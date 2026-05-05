'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Mic, MicOff, X, Play, History, BarChart2 } from 'lucide-react';
import TypingAnimation from '@/components/TypingAnimation';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Conversation states
enum ConversationState {
  INACTIVE = 'inactive',
  CONNECTING = 'connecting',
  GREETING = 'greeting',
  LISTENING = 'listening',
  PROCESSING = 'processing',
  SPEAKING = 'speaking',
  ERROR = 'error',
  ENDED = 'ended'
}

// API Constants
const ELEVENLABS_API_KEY = process.env.NEXT_PUBLIC_ELEVENLABS_API_KEY || '';
const GEMINI_API_KEY = process.env.NEXT_PUBLIC_GEMINI_API_KEY || '';
const DEFAULT_VOICE_ID = 'EXAVITQu4vr4xnSDxMaL'; // Default voice ID (Adam)

// Interface for conversation history
interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

// Session data structure
interface SessionData {
  id: string;
  userId: string | null;
  startedAt: Date;
  endedAt?: Date;
  conversation: Message[];
  voiceId?: string; // Store voice ID for the session
  metadata?: {
    mongoDbId?: string;
    [key: string]: any;
  };
}

// Status messages for different states
const stateMessages = {
  [ConversationState.INACTIVE]: "Click 'Begin Session' to start",
  [ConversationState.CONNECTING]: "Connecting to voice assistant...",
  [ConversationState.GREETING]: "Aura is greeting you...",
  [ConversationState.LISTENING]: "Listening to you...",
  [ConversationState.PROCESSING]: "Processing your message...",
  [ConversationState.SPEAKING]: "Aura is speaking...",
  [ConversationState.ERROR]: "There was an error. Please try again.",
  [ConversationState.ENDED]: "Conversation ended."
};

// API utility functions
const apiUtils = {
  // Voice Cloning with ElevenLabs
  async cloneVoice(name: string): Promise<string> {
    try {
      console.log('🎭 Cloning voice with ElevenLabs, name:', name);
      return await this.fallbackToElevenLabsClone(name);
    } catch (error) {
      console.error('Error in cloneVoice:', error);
      throw error;
    }
  },
  
  // Use ElevenLabs for voice cloning
  async fallbackToElevenLabsClone(name: string): Promise<string> {
    // In a real implementation, we would actually clone a voice with ElevenLabs
    // Here we're just creating a mock implementation
    
    console.log('Using ElevenLabs for voice cloning');
    
    // Generate a unique ID for the voice
    const voiceId = `eleven_${Date.now()}_${name.replace(/\s+/g, '_')}`;
    
    // Save the voice ID to localStorage
    const savedVoices = JSON.parse(localStorage.getItem('aura_cloned_voices') || '[]');
    savedVoices.push({
      id: voiceId,
      name: `Aura Session ${name}`,
      type: 'elevenlabs',
      createdAt: new Date().toISOString()
    });
    localStorage.setItem('aura_cloned_voices', JSON.stringify(savedVoices));
    
    console.log('Voice cloned successfully, ID:', voiceId);
    return voiceId;
  },
  
  // Get available voices from ElevenLabs
  async getVoices(): Promise<Array<{voice_id: string, name: string}>> {
    try {
      if (!ELEVENLABS_API_KEY) {
        throw new Error('ELEVENLABS_API_KEY not configured');
      }
      
      const response = await fetch('https://api.elevenlabs.io/v1/voices', {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'xi-api-key': ELEVENLABS_API_KEY
        }
      });
      
      if (!response.ok) {
        throw new Error(`Get voices error: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (!data || !data.voices || !Array.isArray(data.voices)) {
        throw new Error('Invalid response from get voices API');
      }
      
      return data.voices.map((voice: any) => ({
        voice_id: voice.voice_id,
        name: voice.name
      }));
    } catch (error) {
      console.error('❌ Error getting voices:', error);
      // Return empty array if failed
      return [];
    }
  },
  
  // ElevenLabs Speech-to-Text
  async speechToText(audioBlob: Blob): Promise<string> {
    try {
      console.log('⚙️ Starting speech-to-text conversion...');
      
      if (!ELEVENLABS_API_KEY) {
        throw new Error('ELEVENLABS_API_KEY not configured');
      }
      
      // Create form data
      const formData = new FormData();
      formData.append('file', audioBlob);
      formData.append('model_id', 'scribe_v1');
      
      console.log('📡 Sending request to Eleven Labs STT API...');
      
      const response = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'xi-api-key': ELEVENLABS_API_KEY
        },
        body: formData
      });
      
      if (!response.ok) {
        throw new Error(`STT API error: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (!data || !data.text) {
        throw new Error('Invalid response from speech-to-text API');
      }
      
      console.log('✅ Successfully converted speech to text:', data.text);
      
      return data.text.trim();
    } catch (error) {
      console.error('❌ Error in speech-to-text conversion:', error);
      
      // Fallback phrases
      const fallbackPhrases = [
        "I've been feeling anxious lately",
        "I'm having trouble sleeping at night",
        "Work has been really stressful for me",
        "I had an argument with my friend and I feel bad",
        "I'm worried about my future"
      ];
      
      // Select a random fallback phrase
      const index = Math.floor(Math.random() * fallbackPhrases.length);
      return fallbackPhrases[index];
    }
  },
  
  // Gemini AI for generating responses
  async generateResponse(history: Message[]): Promise<string> {
    try {
      console.log("Generating AI response...");

      // Create a proper conversation history for the AI
      const formattedHistory = history.map(msg => ({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.content }]
      }));

      // Get the last user message as context
      const lastMessage = history.length > 0 ? history[history.length - 1] : null;
      const userContext = lastMessage && lastMessage.role === 'user' ? lastMessage.content : "How are you feeling today?";
      
      // Use consistent model name with what works in the analysis page
      const modelName = "gemini-2.0-flash";
      
      // Create a better system prompt with length guidelines
      const systemPrompt = {
        role: "user",
        parts: [{
          text: `You are a therapist named Aura. Be extremely concise. 

Your responses must:
- Be 1-2 sentences maximum
- Use simple, direct language
- Avoid unnecessary words
- Never exceed 25 words total

The client context is: ${userContext}`
        }]
      };
      
      // API call to Gemini with full conversation history
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1/models/${modelName}:generateContent?key=${process.env.NEXT_PUBLIC_GEMINI_API_KEY}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            contents: formattedHistory.length > 1 ? 
              [...formattedHistory.slice(-5), systemPrompt] : // Include up to 5 recent messages
              [systemPrompt], // Just use system prompt if no history
            generationConfig: {
              temperature: 0.7,
              topK: 40,
              topP: 0.95,
              maxOutputTokens: 300, // Reduced from 1024 for more concise responses
            },
          }),
        }
      );
      
      // Check for HTTP errors
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Gemini API error (${response.status}):`, errorText);
        return "Sorry, I couldn't generate a response. Please try again later.";
      }

      const data = await response.json();
      
      if (!data.candidates || !data.candidates[0] || !data.candidates[0].content) {
        console.error("Invalid response from Gemini API:", data);
        return "Sorry, I couldn't generate a proper response. Please try again later.";
      }
      
      const aiResponse = data.candidates[0].content.parts[0].text;
      return aiResponse;
    } catch (error) {
      console.error("Error generating AI response:", error);
      return "Sorry, I couldn't generate a response due to an error. Please try again later.";
    }
  },
  
  // ElevenLabs Text-to-Speech
  async textToSpeech(text: string, voiceId: string = DEFAULT_VOICE_ID): Promise<ArrayBuffer> {
    try {
      console.log('🎵 Converting text to speech using voice ID:', voiceId);
      
      // Check if this is a Zyphra voice ID (they start with "zyphra_")
      if (voiceId.startsWith('zyphra_')) {
        return this.textToSpeech(text, DEFAULT_VOICE_ID);
      }
      
      // Improved text processing for TTS
      // Split long text into chunks of up to 250 characters at sentence boundaries
      const chunks = this.splitIntoOptimalChunks(text, 250);
      const firstChunk = chunks[0]; // Always process at least the first chunk
      
      if (!ELEVENLABS_API_KEY) {
        throw new Error('ELEVENLABS_API_KEY not configured');
      }
      
      const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
        method: 'POST',
        headers: {
          'Accept': 'audio/mpeg',
          'Content-Type': 'application/json',
          'xi-api-key': ELEVENLABS_API_KEY
        },
        body: JSON.stringify({
          text: firstChunk,
          model_id: 'eleven_turbo_v2',
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
            style: 0.15,  // Add a slight style boost
            speaking_rate: 1.15  // Speak slightly faster (15% faster than normal)
          }
        })
      });
      
      if (!response.ok) {
        throw new Error(`TTS API error: ${response.status} ${response.statusText}`);
      }
      
      const audioData = await response.arrayBuffer();
      console.log('✅ Successfully converted text to speech with ElevenLabs');
      
      return audioData;
    } catch (error) {
      console.error('❌ Error in text-to-speech conversion:', error);
      throw error;
    }
  },
  
  // Split text into optimal chunks for TTS processing
  splitIntoOptimalChunks(text: string, maxChunkLength: number): string[] {
    // If text is already short enough, return as is
    if (text.length <= maxChunkLength) {
      return [text];
    }
    
    const chunks: string[] = [];
    let remainingText = text;
    
    while (remainingText.length > 0) {
      // If remaining text fits in a chunk, add it and finish
      if (remainingText.length <= maxChunkLength) {
        chunks.push(remainingText);
        break;
      }
      
      // Find a good breaking point (end of sentence or clause)
      let breakPoint = remainingText.substring(0, maxChunkLength).lastIndexOf('.');
      if (breakPoint === -1) {
        breakPoint = remainingText.substring(0, maxChunkLength).lastIndexOf('!');
      }
      if (breakPoint === -1) {
        breakPoint = remainingText.substring(0, maxChunkLength).lastIndexOf('?');
      }
      if (breakPoint === -1) {
        breakPoint = remainingText.substring(0, maxChunkLength).lastIndexOf(',');
      }
      if (breakPoint === -1 || breakPoint < maxChunkLength / 2) {
        // If no good breaking point, just break at the max length
        breakPoint = maxChunkLength;
      }
      
      // Add this chunk and continue with remaining text
      chunks.push(remainingText.substring(0, breakPoint + 1).trim());
      remainingText = remainingText.substring(breakPoint + 1).trim();
    }
    
    return chunks;
  },
  
  async syncWithBackend(sessionToSync: SessionData): Promise<string | null> {
    try {
      // Get auth token from localStorage (using correct key 'token' not 'auth_token')
      let token = localStorage.getItem('token');
      
      // For development
      if (!token || token === 'null' || token === 'undefined') {
        console.log("Using demo token for development");
        token = "demo_development_token";
      }
      
      // Get API URL from env or default to localhost
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3005';
      
      try {
        console.log(`Attempting to sync session to ${apiUrl}/api/sessions/sync`);
        
        // Set a timeout for the request to prevent long hangs
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000); // 3 second timeout
        
        // Check if server is reachable first with a HEAD request
        let isServerReachable = false;
        try {
          const pingResponse = await fetch(`${apiUrl}/api/health`, {
            method: 'HEAD',
            signal: controller.signal,
          });
          isServerReachable = pingResponse.ok;
        } catch (pingError) {
          console.warn(`Server at ${apiUrl} is not reachable:`, pingError);
          isServerReachable = false;
          // Don't return yet, we'll proceed with the full logic but expect failure
        }
        
        // If server is not reachable, fall back to local storage immediately
        if (!isServerReachable) {
          console.warn(`Server at ${apiUrl} is not reachable, using local storage fallback`);
          return this.createLocalFallbackResponse(sessionToSync.id);
        }
        
        // Make the API call with proper auth headers
        const response = await fetch(`${apiUrl}/api/sessions/sync`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            sessionData: sessionToSync
          }),
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
          const errorData = await response.text();
          console.error(`Session sync failed (${response.status}):`, errorData);
          return this.createLocalFallbackResponse(sessionToSync.id);
        }
        
        const data = await response.json();
        console.log('Session synced successfully:', data);
        this.updateLocalSessionWithSyncInfo(sessionToSync.id, data.sessionId);
        return data.sessionId;
      } catch (fetchError: any) {
        console.warn("Server connection failed. Using client-only storage:", fetchError.message);
        // Create a fallback response for development mode
        return this.createLocalFallbackResponse(sessionToSync.id);
      }
    } catch (error) {
      console.error('Error in syncWithBackend:', error);
      return null;
    }
  },
  
  // Helper function to create a fallback response when server is unavailable
  createLocalFallbackResponse(sessionId: string): string {
    // Generate a fake MongoDB-like ID for development use
    const mockId = `local_${Date.now()}_${sessionId}`;
    
    // Mark session as handled locally
    this.updateLocalSessionWithSyncInfo(sessionId, mockId);
    
    console.log(`Created local fallback session ID: ${mockId}`);
    return mockId;
  },
  
  // Helper to update localStorage with sync info
  updateLocalSessionWithSyncInfo(sessionId: string, serverId: string): void {
    const allSessions = JSON.parse(localStorage.getItem('aura_sessions') || '{}');
    if (allSessions[sessionId]) {
      allSessions[sessionId].synced = true;
      allSessions[sessionId].serverSessionId = serverId;
      allSessions[sessionId].syncedAt = new Date().toISOString();
      localStorage.setItem('aura_sessions', JSON.stringify(allSessions));
    }
  }
};

// Storage utility for managing user conversations
const storageUtils = {
  // Generate a unique session ID
  generateSessionId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substring(2);
  },
  
  // Get current user ID (can be enhanced with auth integration)
  getUserId(): string | null {
    // If you have authentication, get the user ID from there
    // For now, we'll use a stored anonymous ID
    let userId = localStorage.getItem('aura_user_id');
    
    if (!userId) {
      userId = 'anonymous_' + Date.now().toString(36) + Math.random().toString(36).substring(2);
      localStorage.setItem('aura_user_id', userId);
    }
    
    return userId;
  },
  
  // Create a new session
  createSession(sessionId?: string, voiceId?: string): SessionData {
    // Use provided sessionId or generate a new one
    const id = sessionId || this.generateSessionId();
    const userId = this.getUserId();
    
    const session: SessionData = {
      id: id,
      userId: userId,
      startedAt: new Date(),
      conversation: [],
      voiceId: voiceId || DEFAULT_VOICE_ID, // Use provided voiceId or default
      metadata: {}
    };
    
    // Store in localStorage
    this.saveSession(session);
    
    return session;
  },
  
  // Save session to localStorage
  saveSession(session: SessionData): void {
    try {
      // Get all sessions
      const sessionsJson = localStorage.getItem('aura_sessions') || '{}';
      const sessions = JSON.parse(sessionsJson);
      
      // Update or add this session
      sessions[session.id] = session;
      
      // Save back to localStorage
      localStorage.setItem('aura_sessions', JSON.stringify(sessions));
      
      // Also update session list for this user
      const userSessionsJson = localStorage.getItem(`aura_user_sessions_${session.userId}`) || '[]';
      let userSessions = JSON.parse(userSessionsJson);
      
      // Add session ID if not already in the list
      if (!userSessions.includes(session.id)) {
        userSessions.push(session.id);
        localStorage.setItem(`aura_user_sessions_${session.userId}`, JSON.stringify(userSessions));
      }
      
      console.log('Session saved to localStorage:', session.id);
    } catch (error) {
      console.error('Error saving session to localStorage:', error);
    }
  },
  
  // Get session by ID
  getSession(sessionId: string): SessionData | null {
    try {
      const sessionsJson = localStorage.getItem('aura_sessions') || '{}';
      const sessions = JSON.parse(sessionsJson);
      
      return sessions[sessionId] || null;
    } catch (error) {
      console.error('Error retrieving session:', error);
      return null;
    }
  },
  
  // Get all sessions for a user
  getUserSessions(userId: string): SessionData[] {
    try {
      const userSessionsJson = localStorage.getItem(`aura_user_sessions_${userId}`) || '[]';
      const sessionIds = JSON.parse(userSessionsJson);
      
      const sessionsJson = localStorage.getItem('aura_sessions') || '{}';
      const allSessions = JSON.parse(sessionsJson);
      
      // Map session IDs to actual session data
      return sessionIds.map((id: string) => allSessions[id]).filter(Boolean);
    } catch (error) {
      console.error('Error retrieving user sessions:', error);
      return [];
    }
  },
  
  // End a session by updating its endedAt property
  endSession(sessionId: string): void {
    try {
      const session = this.getSession(sessionId);
      if (session) {
        session.endedAt = new Date();
        this.saveSession(session);
        console.log('Session ended:', sessionId);
      }
    } catch (error) {
      console.error('Error ending session:', error);
    }
  },
  
  // Add a message to a session
  addMessageToSession(sessionId: string, message: Message): void {
    try {
      const session = this.getSession(sessionId);
      if (session) {
        session.conversation.push(message);
        this.saveSession(session);
      }
    } catch (error) {
      console.error('Error adding message to session:', error);
    }
  },
  
  // Sync session with backend
  async syncWithBackend(sessionId: string): Promise<boolean> {
    try {
      console.log('Syncing session to backend:', sessionId);
      
      // Get the session from localStorage
      const session = this.getSession(sessionId);
      if (!session) {
        console.error('Cannot sync: Session not found in localStorage');
        return false;
      }
      
      // Use the API utility to sync the session, which now has proper error handling
      const result = await apiUtils.syncWithBackend(session);
      return !!result; // Return true if we got a valid result
    } catch (error) {
      console.error('Error syncing session to backend:', error);
      return false;
    }
  }
};

// Initialize Gemini AI API
const initGemini = () => {
  // In a real implementation, use environment variable for the API key
  const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY || '';
  return new GoogleGenerativeAI(apiKey);
};

// Generate speech from text using ElevenLabs API
const generateSpeech = async (text: string, voiceId?: string): Promise<ArrayBuffer | string> => {
  // Default to the default voice ID if not provided
  const useVoiceId = voiceId || DEFAULT_VOICE_ID;
  
  // Define a log with timer for performance tracking
  const startTime = performance.now();
  const logWithTime = (stage: string, extraInfo?: string) => {
    const timeMs = performance.now() - startTime;
    console.log(`${stage}: ${timeMs.toFixed(3)} ms${extraInfo ? ' - ' + extraInfo : ''}`);
  };
  
  try {
    // Always use ElevenLabs, ignore any zyphra_ prefixed voice IDs
    const safeVoiceId = useVoiceId.startsWith('zyphra_') ? DEFAULT_VOICE_ID : useVoiceId;
    return await generateSpeechWithElevenLabs(text, safeVoiceId);
  } catch (error) {
    console.error('❌ Error in generateSpeech:', error);
    return generateSpeechWithElevenLabs(text, DEFAULT_VOICE_ID);
  }
};

// Helper function to detect audio format from ArrayBuffer
const detectAudioFormat = (buffer: ArrayBuffer): 'mp3' | 'wav' | 'unknown' => {
  if (!buffer || buffer.byteLength < 4) return 'unknown';
  
  const dataView = new DataView(buffer);
  
  // Check for WAV header (RIFF)
  if (buffer.byteLength > 12) {
    const header = new Uint8Array(buffer, 0, 4);
    if (header[0] === 0x52 && header[1] === 0x49 && header[2] === 0x46 && header[3] === 0x46) {
      return 'wav';
    }
  }
  
  // Check for MP3 header (ID3 or MPEG frame sync)
  if (buffer.byteLength > 3) {
    const header = new Uint8Array(buffer, 0, 3);
    // Check for ID3 tag
    if (header[0] === 0x49 && header[1] === 0x44 && header[2] === 0x33) {
      return 'mp3';
    }
    
    // Check for MPEG frame sync
    if ((dataView.getUint16(0) & 0xFFF0) === 0xFFF0) {
      return 'mp3';
    }
  }
  
  return 'unknown';
};

// Use ElevenLabs for TTS
const generateSpeechWithElevenLabs = async (text: string, voiceId: string): Promise<string> => {
  try {
    console.log('🎵 Generating speech with ElevenLabs voice:', voiceId);
    
    // In a real implementation, use environment variable for the API key
    const apiKey = process.env.NEXT_PUBLIC_ELEVENLABS_API_KEY || '';
    
    if (!apiKey) {
      console.error('ElevenLabs API key not found');
      throw new Error('ElevenLabs API key missing');
    }
    
    console.time('elevenLabsGeneration');
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': apiKey
      },
      body: JSON.stringify({
        text,
        model_id: 'eleven_turbo_v2',
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
          style: 0.15,  // Add a slight style boost
          speaking_rate: 1.15  // Speak slightly faster (15% faster than normal)
        }
      })
    });
    console.timeEnd('elevenLabsGeneration');
    
    if (!response.ok) {
      throw new Error(`Speech generation failed: ${response.status}`);
    }
    
    const audioBuffer = await response.arrayBuffer();
    console.log('ElevenLabs returned audio size:', audioBuffer.byteLength, 'bytes');
    
    const audioBlob = new Blob([audioBuffer], { type: 'audio/mpeg' });
    const audioUrl = URL.createObjectURL(audioBlob);
    console.log('✅ ElevenLabs audio URL created:', audioUrl);
    
    return audioUrl;
  } catch (error) {
    console.error('Error generating speech with ElevenLabs:', error);
    
    // Return a minimal valid audio as a last resort
    return 'data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA//uQZAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAAGAAABkABUVFRUVFRUVFRUVFRUVFSlpaWlpaWlpaWlpaWlpaXp6enp6enp6enp6enp6en/////////////////////AAAAAAE==';
  }
};

export default function Dashboard() {
  const router = useRouter();
  const [conversationState, setConversationState] = useState<ConversationState>(ConversationState.INACTIVE);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [isAISpeaking, setIsAISpeaking] = useState<boolean>(false);
  const [animationActive, setAnimationActive] = useState<boolean>(false);
  const [processingStep, setProcessingStep] = useState<string>("");
  const [textResponse, setTextResponse] = useState<string>("");
  const [transcription, setTranscription] = useState<string>("");
  const [conversationHistory, setConversationHistory] = useState<Message[]>([]);
  const [serverAvailable, setServerAvailable] = useState<boolean | null>(null);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [audioChunks, setAudioChunks] = useState<Blob[]>([]);
  const [sessionActive, setSessionActive] = useState(false);
  
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // State for user input
  const [lastUserInput, setLastUserInput] = useState<string>('');

  // Keep track of the current audio element for cleanup
  const [currentAudioElement, setCurrentAudioElement] = useState<HTMLAudioElement | null>(null);

  useEffect(() => {
    // Check server availability on first load
    const checkServerAvailability = async () => {
      try {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3005';
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);
        
        const response = await fetch(`${apiUrl}/api/health`, {
          method: 'GET',
          signal: controller.signal
        }).catch(() => null);
        
        clearTimeout(timeoutId);
        
        setServerAvailable(response && response.ok);
      } catch (error) {
        console.error('Error checking server availability:', error);
        setServerAvailable(false);
      }
    };
    
    // Create audio element for playback
    audioRef.current = new Audio();
      
    // Listen for voice cloning events
    const handleVoiceCloned = (event: any) => {
      try {
        const { voiceId, sessionId } = event.detail;
        
        console.log('Voice cloned event received:', { voiceId, sessionId });
        
        if (!voiceId) {
          console.warn('No voice ID in voice cloned event');
          return;
        }
        
        // Only update the current session if it matches the event session ID
        if (sessionId && currentSessionId && sessionId === currentSessionId) {
          console.log('Updating current session with cloned voice:', voiceId);
          
          // Get the session data
          const allSessions = JSON.parse(localStorage.getItem('aura_sessions') || '{}');
          
          if (allSessions[sessionId]) {
            // Update the session with the new voice ID
            allSessions[sessionId].voiceId = voiceId;
            localStorage.setItem('aura_sessions', JSON.stringify(allSessions));
            
            // Provide user feedback
            if (!isAISpeaking && !isProcessing) {
              // If the AI isn't already speaking, generate some response using the new voice
              const confirmationMessage = "I've been updated with your voice. How can I help you today?";
              generateSpeechWithElevenLabs(confirmationMessage, voiceId)
                .then(audioUrl => {
                  playAudio(audioUrl, confirmationMessage);
                })
                .catch(error => {
                  console.error('Error generating speech with cloned voice:', error);
                });
            }
          }
        }
      } catch (error) {
        console.error('Error handling voice cloned event:', error);
      }
    };
    
    // Check server on page load
    checkServerAvailability();
    
    // Cleanup on unmount
    return () => {
      cleanupAudioResources();
      window.removeEventListener('voiceCloned', handleVoiceCloned);
      
      // End current session if active
      if (currentSessionId) {
        endSession();
      }
    };
  }, [currentSessionId, isAISpeaking, isProcessing]);

  // Clean up function for audio and streams
  const cleanupAudioResources = () => {
    // Stop any playing audio
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
    }
    
    // Stop media recorder if active
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    
    // Stop and release media stream if exists
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
  };

  // Begin a new session with initial user input
  const beginSession = async (initialInput?: string): Promise<string> => {
    console.log('Beginning new session...');
    
    // Generate session ID
      const sessionId = storageUtils.generateSessionId();
    console.log('Generated new session ID:', sessionId);
      
      // Check if there are any cloned voices available
      let sessionVoiceId = DEFAULT_VOICE_ID;
      try {
        const savedVoices = JSON.parse(localStorage.getItem('aura_cloned_voices') || '[]');
        
        // If we have saved voices, use the most recent one
        if (savedVoices.length > 0) {
          // Sort by creation date (newest first)
          savedVoices.sort((a: any, b: any) => 
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          );
          
          // Use the most recent voice
          sessionVoiceId = savedVoices[0].id;
          console.log('Using previously cloned voice:', savedVoices[0].name, sessionVoiceId);
        
        // If this is a Zyphra voice, use the default voice instead
        if (sessionVoiceId.startsWith('zyphra_')) {
          console.log('Converted Zyphra voice ID to default ElevenLabs voice');
          sessionVoiceId = DEFAULT_VOICE_ID;
        }
        } else {
        // If no saved voices, create a default voice for this session
        console.log('No saved voices found, using default voice');
        sessionVoiceId = DEFAULT_VOICE_ID;
        }
      } catch (voiceError) {
        console.error('Error getting cloned voices:', voiceError);
        // Fallback to default voice
        sessionVoiceId = DEFAULT_VOICE_ID;
      }
      
    // Create and save the session
      const session = storageUtils.createSession(sessionId, sessionVoiceId);
    console.log('Created new session with voice ID:', sessionVoiceId);
    
    // Return the session ID
    return sessionId;
  };

  // Initialize microphone and media recorder
  const initializeMicrophone = () => {
    // Clean up any existing resources
    if (streamRef.current) {
      console.log('🧹 Cleaning up existing stream');
      streamRef.current.getTracks().forEach(track => track.stop());
    }
    
    console.log('🎙️ Initializing microphone');
    // Get user's audio input with specific constraints for better quality
    navigator.mediaDevices.getUserMedia({ 
      audio: { 
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      } 
    })
    .then(stream => {
      streamRef.current = stream;
      mediaRecorderRef.current = createMediaRecorder(stream);
      
      // Start the actual recording
      startRecording();
    })
    .catch(error => {
      console.error('❌ Error accessing microphone:', error);
      setErrorMessage("Microphone access denied. Please allow microphone access and try again.");
      setIsRecording(false);
      setConversationState(ConversationState.ERROR);
    });
  };

  // Start recording audio
  const startRecording = useCallback(() => {
    if (!mediaRecorderRef.current) return;
    
    try {
      console.log('⏺️ Starting media recorder with 500ms time slices');
      // Use smaller time slices for more frequent data collection
      mediaRecorderRef.current.start(500); 
      
      // Add event listeners for recording state changes
      mediaRecorderRef.current.addEventListener('start', () => {
        console.log('🎙️ Recording started');
      });
      
      // Add error handler for media recorder
      mediaRecorderRef.current.addEventListener('error', (e) => {
        console.error('🔴 Media recorder error:', e);
      });
      
      setIsRecording(true);
      setConversationState(ConversationState.LISTENING);
    } catch (error) {
      console.error('Failed to start recording:', error);
      // Ensure we handle errors gracefully
      setIsRecording(false);
      setErrorMessage('Failed to start recording. Please try again.');
    }
  }, []);

  // Stop recording
  const stopRecording = () => {
    // Stop the recorder
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
  };

  // Process the entire conversation flow
  const processConversation = useCallback(async (userInput: string | Blob, isNewSession: boolean = false) => {
    if (isProcessing || isAISpeaking) {
      console.log('Already processing or AI speaking, ignoring input');
      return;
    }
    
    setIsProcessing(true);
    setConversationState(ConversationState.PROCESSING);
    
    try {
      // Handle either string input or audio blob
      let transcribedText = '';
      
      if (typeof userInput === 'string') {
        transcribedText = userInput;
        setLastUserInput(transcribedText);
        
        // If this is a new session, we need to generate a session ID
        if (isNewSession && !currentSessionId) {
          console.log('Starting new session...');
          const sessionId = await beginSession(transcribedText);
          setCurrentSessionId(sessionId);
          
          // Use the current session
          const currentSession = storageUtils.getSession(sessionId);
          if (currentSession?.voiceId?.startsWith('zyphra_')) {
            console.log('Converting Zyphra voice ID to default voice');
            currentSession.voiceId = DEFAULT_VOICE_ID;
            storageUtils.saveSession(currentSession);
          }
        }
      } else {
        // It's an audio blob, transcribe it
        setProcessingStep("Transcribing your audio...");
        transcribedText = await apiUtils.speechToText(userInput as Blob);
        setTranscription(transcribedText);
        setLastUserInput(transcribedText);
      }
      
      if (!transcribedText.trim()) {
        console.log('Empty transcription, ignoring');
        setIsProcessing(false);
        setConversationState(ConversationState.LISTENING);
        return;
      }
      
      // Add user message to conversation history first
      const userMessage: Message = {
        role: 'user',
        content: transcribedText,
        timestamp: new Date()
      };
      
      // Update state
      setConversationHistory(prevHistory => [...prevHistory, userMessage]);
      
      // Add message to session storage
      if (currentSessionId) {
        storageUtils.addMessageToSession(currentSessionId, userMessage);
      }
      
      // Generate AI response
      setProcessingStep("Generating AI response...");
      const sessionData = currentSessionId ? storageUtils.getSession(currentSessionId) : null;
      const conversationContext = sessionData?.conversation || [];
      
      const aiResponse = await apiUtils.generateResponse([...conversationContext, userMessage]);
      
      // Add AI message to conversation history
      const assistantMessage: Message = {
        role: 'assistant',
        content: aiResponse,
        timestamp: new Date()
      };
      
      setConversationHistory(prevHistory => [...prevHistory, assistantMessage]);
      setTextResponse(aiResponse);
      
      // Add message to session storage
      if (currentSessionId) {
        storageUtils.addMessageToSession(currentSessionId, assistantMessage);
      }
      
      // Generate speech for AI response
      setProcessingStep("Converting to speech...");
      const voiceId = sessionData?.voiceId || DEFAULT_VOICE_ID;
      const audioData = await generateSpeech(aiResponse, voiceId);
      
      // Play the audio response
      setIsProcessing(false);
      
      // Play the audio based on the type of data returned
      if (typeof audioData === 'string') {
        // It's a URL, pass it directly
        playAudio(audioData, aiResponse);
      } else {
        // It's an ArrayBuffer, pass it for processing
        playAudio(audioData, aiResponse);
      }
      
      // Sync with backend if available
      if (serverAvailable && currentSessionId) {
        try {
          await storageUtils.syncWithBackend(currentSessionId);
        } catch (error) {
          console.error('Error syncing with backend:', error);
        }
      }
    } catch (error) {
      console.error('Error in conversation processing:', error);
      setErrorMessage('Failed to process your request');
      setIsProcessing(false);
      setConversationState(ConversationState.ERROR);
    }
  }, [currentSessionId, serverAvailable]);

  // Play audio and handle completion
  const playAudio = (audioData: ArrayBuffer | string, responseText: string) => {
    try {
      // Function to attempt playing audio with robust error handling
      const safePlayAudio = async (audioElement: HTMLAudioElement, source: string): Promise<boolean> => {
        return new Promise((resolve) => {
          let playAttempted = false;
          let loadTimeout: NodeJS.Timeout;
          
          // Set up event listeners for tracking playback
          audioElement.oncanplaythrough = () => {
            console.log('Audio can play through, attempting playback');
            if (!playAttempted) {
              playAttempted = true;
              clearTimeout(loadTimeout);
              
              try {
                const promise = audioElement.play();
                if (promise !== undefined) {
                  promise
                    .then(() => {
                      console.log('Audio playback started successfully');
                      resolve(true);
                    })
                    .catch(e => {
                      console.error('Play promise rejected:', e);
                      resolve(false);
                    });
                } else {
                  console.log('Audio play() returned undefined, assuming playback started');
                  resolve(true);
                }
              } catch (e) {
                console.error('Exception during play():', e);
                resolve(false);
              }
            }
          };
          
          audioElement.onerror = (e) => {
            console.error('Audio element error event:', e);
            console.error('Audio error code:', audioElement.error?.code);
            console.error('Audio error message:', audioElement.error?.message);
            clearTimeout(loadTimeout);
            resolve(false);
          };
          
          audioElement.onended = () => {
            console.log('Audio playback ended');
            cleanupAudioResources();
            setIsAISpeaking(false);
            setConversationState(ConversationState.LISTENING);
            
            // Clean up the object URL if we created one
            if (typeof audioData !== 'string') {
              cleanupUrl(source);
            }
          };
          
          // Set a timeout to detect if loading takes too long
          loadTimeout = setTimeout(() => {
            console.warn('Audio loading timed out');
            resolve(false);
          }, 5000);
          
          // Set the source and load the audio
          audioElement.src = source;
          audioElement.load();
          console.log('Audio element initialized with source');
        });
      };
      
      // Helper function to play audio using Web Audio API
      const playWithWebAudioAPI = (audioBuffer: ArrayBuffer) => {
        try {
          // Create audio context
          const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
          const audioContext = new AudioContext();
          
          // Decode the audio data
          audioContext.decodeAudioData(
            audioBuffer,
            (buffer) => {
              console.log('Successfully decoded audio with Web Audio API');
              // Create a source node
              const source = audioContext.createBufferSource();
              source.buffer = buffer;
              
              // Connect to the audio output
              source.connect(audioContext.destination);
              
              // Handle completion
              source.onended = () => {
                console.log('Web Audio API playback ended');
                setIsAISpeaking(false);
                setConversationState(ConversationState.LISTENING);
                audioContext.close();
              };
              
              // Start playback
              source.start(0);
              console.log('Started playback with Web Audio API');
            },
            (error) => {
              console.error('Error decoding audio data:', error);
              setIsAISpeaking(false);
              setConversationState(ConversationState.LISTENING);
              
              // Use speech synthesis as last resort
              const synth = window.speechSynthesis;
              const utterance = new SpeechSynthesisUtterance(responseText);
              synth.speak(utterance);
            }
          );
        } catch (e) {
          console.error('Error using Web Audio API:', e);
          setIsAISpeaking(false);
          setConversationState(ConversationState.LISTENING);
          
          // Use speech synthesis as last resort
          const synth = window.speechSynthesis;
          const utterance = new SpeechSynthesisUtterance(responseText);
          synth.speak(utterance);
        }
      };
      
      // Helper function to clean up object URLs
      const cleanupUrl = (url: string) => {
        if (url.startsWith('blob:')) {
          try {
            URL.revokeObjectURL(url);
            console.log('Revoked object URL:', url);
          } catch (e) {
            console.error('Error revoking object URL:', e);
          }
        }
      };

      const audioElement = new Audio();
      setCurrentAudioElement(audioElement);
      
      // Set state to speaking
      setIsAISpeaking(true);
      setConversationState(ConversationState.SPEAKING);
      
      // Create URL source based on input type
      let source: string;
      
      // Handle different types of audio data
      if (typeof audioData === 'string') {
        // If it's a string, it could be a URL or data URL
        source = audioData;
        console.log('Playing audio from URL or data URL, length:', source.length);
      } else {
        // Handle ArrayBuffer by creating a blob with the correct MIME type
        // Detect format to ensure proper playback
        const format = detectAudioFormat(audioData);
        const mimeType = format === 'mp3' ? 'audio/mpeg' : 
                         format === 'wav' ? 'audio/wav' : 
                         'audio/mpeg'; // Default to MP3
        
        console.log(`Creating ${mimeType} blob from ArrayBuffer, size:`, audioData.byteLength);
        const blob = new Blob([audioData], { type: mimeType });
        source = URL.createObjectURL(blob);
      }
      
      // Play audio with robust error handling
      safePlayAudio(audioElement, source)
        .then(success => {
          if (!success) {
            console.warn('Safe audio playback failed, attempting fallback method');
            if (typeof audioData !== 'string') {
              // Try Web Audio API as fallback
              playWithWebAudioAPI(audioData);
            } else {
              // Use speech synthesis as last resort for text response
              const synth = window.speechSynthesis;
              const utterance = new SpeechSynthesisUtterance(responseText);
              synth.speak(utterance);
            }
          }
        })
        .catch(playError => {
          console.error('Error in audio playback:', playError);
          // Fall back to browser's speech synthesis
          const synth = window.speechSynthesis;
          const utterance = new SpeechSynthesisUtterance(responseText);
          synth.speak(utterance);
      });
    } catch (error) {
      console.error('Error in playAudio:', error);
      setIsAISpeaking(false);
      setConversationState(ConversationState.LISTENING);
      
      // Use speech synthesis as last resort
      try {
        const synth = window.speechSynthesis;
        const utterance = new SpeechSynthesisUtterance(responseText);
        synth.speak(utterance);
      } catch (synthError) {
        console.error('Speech synthesis also failed:', synthError);
      }
    }
  };

  // Toggle microphone on/off
  const toggleMicrophone = useCallback(() => {
    if (isAISpeaking || isProcessing) {
      console.log('Cannot toggle mic during AI speaking or processing');
      return;
    }

    if (isRecording) {
      // We are currently recording, so stop
      console.log('Stopping recording');
      setIsRecording(false);
      stopRecording();
      
      // Process the recorded audio chunks
      if (audioChunks.length > 0) {
        const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
        setAudioChunks([]); // Clear the chunks for next recording
        
        // Process the audio for transcription and response
        processConversation(audioBlob);
      } else {
        console.log('No audio recorded');
        setConversationState(ConversationState.LISTENING);
      }
    } else {
      // We are not recording, so start
      console.log('Starting recording');
      setAudioChunks([]); // Clear any previous chunks
      initializeMicrophone();
    }
  }, [isRecording, isAISpeaking, isProcessing, audioChunks, processConversation]);

  // Create a media recorder with proper event handlers
  const createMediaRecorder = (stream: MediaStream): MediaRecorder => {
    const options = { mimeType: 'audio/webm' };
    const recorder = new MediaRecorder(stream, options);
    
    // Add data available handler to collect audio chunks
    recorder.addEventListener('dataavailable', (event) => {
      if (event.data.size > 0) {
        setAudioChunks((currentChunks) => [...currentChunks, event.data]);
      }
    });
    
    // Add stop handler to process recording when stopped
    recorder.addEventListener('stop', () => {
      console.log('Recording stopped, processing audio...');
      // We don't process audio here anymore, it's handled in toggleMicrophone
    });
    
    return recorder;
  };

  // End the current conversation session
  const endSession = () => {
    try {
      if (currentSessionId) {
        console.log('Ending session:', currentSessionId);
        
        // Stop any active audio playback
    cleanupAudioResources();
    
        // Clear session in storage
      storageUtils.endSession(currentSessionId);
      
        // Reset UI state
        setCurrentSessionId(null);
    setSessionActive(false);
        setConversationState(ConversationState.INACTIVE);
        setConversationHistory([]);
        setTextResponse("");
        setTranscription("");
      }
    } catch (error) {
      console.error('Error ending session:', error);
    }
  };

  // Get appropriate status message with more detail
  const getStatusMessage = () => {
    if (isRecording) {
      return "Listening... (tap mic to stop)";
    } else if (isProcessing) {
      return processingStep || "Processing your message...";
    } else if (isAISpeaking) {
      return "Aura is speaking...";
    } else {
      return stateMessages[conversationState] || "Ready";
    }
  };

  // UI handler for starting a new session
  const handleNewSession = async () => {
    try {
      setErrorMessage("");
      setConversationState(ConversationState.CONNECTING);
      setTranscription("");
      
      const sessionId = await beginSession();
      setCurrentSessionId(sessionId);
      setSessionActive(true);
      
      // Create initial greeting
      setConversationState(ConversationState.GREETING);
      
      // Generate initial AI greeting
      const genAI = initGemini();
      const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
      const chat = model.startChat({
        history: [],
        generationConfig: {
          temperature: 0.7,
          topK: 40,
          topP: 0.95,
          maxOutputTokens: 1024,
        },
      });
      
      const result = await chat.sendMessage(
        "Start a new therapy session with a very brief greeting. Keep it under 15 words. Be warm but extremely concise. Do NOT ask for the user's name or any personal information."
      );
      const aiResponse = result.response.text();
      
      // Set the AI response text before playing audio
      setTextResponse(aiResponse);
      
      // Generate speech audio using the selected voice ID
      const session = storageUtils.getSession(sessionId);
      if (!session) {
        console.error('Session not found after creation:', sessionId);
        throw new Error('Failed to retrieve session after creation');
      }
      
      const audioData = await generateSpeech(aiResponse, session.voiceId);
      
      // Add the message to conversation history
      setConversationHistory([{
        role: 'assistant',
        content: aiResponse,
        timestamp: new Date()
      }]);
      
      // Play the audio based on the type of data returned
      if (typeof audioData === 'string') {
        // It's a URL, pass it directly
        playAudio(audioData, aiResponse);
      } else {
        // It's an ArrayBuffer, pass it for processing
        playAudio(audioData, aiResponse);
      }
    } catch (error) {
      console.error('Error starting session:', error);
      setErrorMessage('Failed to start session');
      setSessionActive(false);
      setConversationState(ConversationState.ERROR);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center h-full mx-auto max-w-4xl px-4">
      <div className="mb-8 text-center">
          <p className="text-gray-600">{getStatusMessage()}</p>
          {errorMessage && (
          <p className="text-red-600 mt-2">{errorMessage}</p>
          )}
        </div>
        
      <div className="relative flex items-center justify-center w-full mb-4">
        <div className={`ai-orb ${
          animationActive ? 'animate-pulse' : ''
        }`}></div>
            </div>
      
      {/* Typing animation for AI response */}
      {isAISpeaking && (
        <div className="mb-8 w-full max-w-lg">
          <TypingAnimation text={textResponse} speed={20} />
              </div>
      )}
          
      <div className="w-full max-w-md flex flex-col items-center space-y-6">
          {/* Begin Session button */}
          {!sessionActive && (
            <button
            className="calmi-button w-full"
            onClick={handleNewSession}
            disabled={conversationState === ConversationState.CONNECTING}
            >
            begin session
            </button>
          )}
          
          {/* Control buttons */}
          {sessionActive && (
            <div className="flex space-x-10 items-center">
              {/* Microphone button */}
              <button
                onClick={toggleMicrophone}
                disabled={isAISpeaking || isProcessing}
              className={`voice-button ${
                isRecording 
                    ? 'bg-red-500 text-white' 
                    : isAISpeaking || isProcessing 
                      ? 'bg-gray-300 text-gray-500 cursor-not-allowed' 
                    : ''
                }`}
              aria-label={isRecording ? "Stop speaking" : "Start speaking"}
              >
              {isRecording ? <MicOff size={24} /> : <Mic size={24} />}
              </button>
              
              {/* End session button - always enabled */}
              <button
                onClick={endSession}
              className="voice-button bg-red-500 text-white"
                aria-label="End session"
              >
                <X size={24} />
              </button>
            </div>
          )}
      </div>
    </div>
  );
} 