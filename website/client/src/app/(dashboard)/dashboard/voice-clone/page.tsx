'use client';

import { useState, useRef, useEffect } from 'react';
import { 
  Mic, 
  MicOff, 
  Play, 
  Upload, 
  X, 
  Save,
  RefreshCw,
  AlertCircle
} from 'lucide-react';

// API Constants
const ELEVENLABS_API_KEY = process.env.NEXT_PUBLIC_ELEVENLABS_API_KEY || '';

interface VoiceCloneResponse {
  voice_id: string;
  name: string;
}

export default function VoiceClonePage() {
  const [isRecording, setIsRecording] = useState(false);
  const [recordedAudio, setRecordedAudio] = useState<Blob | null>(null);
  const [uploadedAudio, setUploadedAudio] = useState<File | null>(null);
  const [previewAudio, setPreviewAudio] = useState<string | null>(null);
  const [previewSource, setPreviewSource] = useState<'recorded' | 'uploaded' | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState<VoiceCloneResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [voiceName, setVoiceName] = useState('My Therapy Voice');
  const [selectedTab, setSelectedTab] = useState<'record' | 'upload'>('record');

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<BlobPart[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  useEffect(() => {
    // Create audio element
    audioRef.current = new Audio();
    
    return () => {
      // Cleanup function
      if (previewAudio) {
        URL.revokeObjectURL(previewAudio);
      }
      
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
    };
  }, []);

  // Start recording audio
  const startRecording = () => {
    // Reset any previous recordings
    setRecordedAudio(null);
    setPreviewAudio(null);
    audioChunksRef.current = [];
    
    // Access the microphone
    navigator.mediaDevices.getUserMedia({ audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true
    } })
      .then(stream => {
        const mediaRecorder = new MediaRecorder(stream);
        mediaRecorderRef.current = mediaRecorder;
        
        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            audioChunksRef.current.push(event.data);
          }
        };
        
        mediaRecorder.onstop = () => {
          const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' });
          setRecordedAudio(audioBlob);
          
          // Create preview URL for the audio
          const audioUrl = URL.createObjectURL(audioBlob);
          setPreviewAudio(audioUrl);
          setPreviewSource('recorded');
          
          // Stop all tracks in the stream
          stream.getTracks().forEach(track => track.stop());
        };
        
        mediaRecorder.start();
        setIsRecording(true);
      })
      .catch(error => {
        console.error('Error accessing microphone:', error);
        setError('Failed to access microphone. Please check your permissions and try again.');
      });
  };
  
  // Stop recording audio
  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
  };
  
  // Handle file upload
  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    
    if (files && files.length > 0) {
      const file = files[0];
      
      // Check file type and size
      if (!file.type.startsWith('audio/')) {
        setError('Please upload an audio file.');
        return;
      }
      
      if (file.size > 10 * 1024 * 1024) {
        setError('File size exceeds 10MB limit.');
        return;
      }
      
      setUploadedAudio(file);
      
      // Create preview URL for the audio
      const audioUrl = URL.createObjectURL(file);
      setPreviewAudio(audioUrl);
      setPreviewSource('uploaded');
      setError(null);
    }
  };
  
  // Trigger file input click
  const triggerFileUpload = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };
  
  // Play preview audio
  const playPreview = () => {
    if (audioRef.current && previewAudio) {
      audioRef.current.src = previewAudio;
      audioRef.current.play().catch(error => {
        console.error('Error playing audio:', error);
      });
    }
  };
  
  // Stop preview audio
  const stopPreview = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
  };
  
  // Reset everything
  const resetAll = () => {
    if (previewAudio) {
      URL.revokeObjectURL(previewAudio);
    }
    
    stopPreview();
    setRecordedAudio(null);
    setUploadedAudio(null);
    setPreviewAudio(null);
    setPreviewSource(null);
    setSuccess(null);
    setError(null);
    
    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };
  
  // Submit for voice cloning
  const submitVoiceClone = async () => {
    // Check if we have audio to submit
    if (!recordedAudio && !uploadedAudio) {
      setError('Please record or upload audio first');
      return;
    }
    
    setIsSubmitting(true);
    setError(null);
    
    try {
      // Record timestamp of voice cloning attempt
      localStorage.setItem('lastVoiceClonedAt', Date.now().toString());
      
      // Submit to ElevenLabs
      await submitVoiceCloneElevenLabs();
    } catch (error) {
      console.error('Error with voice cloning:', error);
      
      // Clear any partial success state
      setSuccess(null);
      
      // Show error message
      if (error instanceof Error) {
        setError(`Voice cloning failed: ${error.message}`);
      } else {
        setError('Voice cloning failed with an unknown error');
      }
    } finally {
      setIsSubmitting(false);
    }
  };
  
  // Test the cloned voice by generating a sample audio
  const testClonedVoice = async (voiceId: string, testText: string) => {
    try {
      if (!ELEVENLABS_API_KEY) {
        console.error('ElevenLabs API key is missing');
        return;
      }
      
      console.log('Testing cloned voice with ElevenLabs:', voiceId);
      
      // Generate speech with ElevenLabs
      const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'xi-api-key': ELEVENLABS_API_KEY,
        },
        body: JSON.stringify({
          text: testText,
          model_id: 'eleven_turbo_v2',
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
          }
        }),
      });
      
      if (!response.ok) {
        throw new Error(`Failed to generate test speech: ${response.status}`);
      }
      
      // Get the audio data
      const audioBuffer = await response.arrayBuffer();
      const audioBlob = new Blob([audioBuffer], { type: 'audio/mpeg' });
      const audioUrl = URL.createObjectURL(audioBlob);
      
      // Play the audio
      if (audioRef.current) {
        audioRef.current.src = audioUrl;
        audioRef.current.play();
      }
    } catch (error) {
      console.error('Error testing cloned voice:', error);
    }
  };
  
  // Detect audio format from ArrayBuffer
  const detectAudioFormat = (buffer: ArrayBuffer): 'mp3' | 'wav' | 'unknown' => {
    const dataView = new DataView(buffer);
    
    // Check for WAV header (RIFF)
    if (buffer.byteLength > 12) {
      const header = new Uint8Array(buffer, 0, 4);
      const wavSignature = [0x52, 0x49, 0x46, 0x46]; // "RIFF" in ASCII
      
      if (header[0] === wavSignature[0] && 
          header[1] === wavSignature[1] && 
          header[2] === wavSignature[2] && 
          header[3] === wavSignature[3]) {
        return 'wav';
      }
    }
    
    // Check for MP3 header (ID3 or MPEG frame sync)
    if (buffer.byteLength > 3) {
      const header = new Uint8Array(buffer, 0, 3);
      const id3Signature = [0x49, 0x44, 0x33]; // "ID3" in ASCII
      
      if (header[0] === id3Signature[0] && 
          header[1] === id3Signature[1] && 
          header[2] === id3Signature[2]) {
        return 'mp3';
      }
      
      // Check for MPEG frame sync (most MP3s start with 0xFF 0xFB)
      if (dataView.getUint16(0) === 0xFFFB || 
          dataView.getUint16(0) === 0xFFF3 || 
          dataView.getUint16(0) === 0xFFF2) {
        return 'mp3';
      }
    }
    
    // Unknown format
    return 'unknown';
  };
  
  // Play audio using Web Audio API (better for handling different formats)
  const playAudioWithWebAudioAPI = (audioBuffer: ArrayBuffer) => {
    try {
      // Create a new audio context
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      
      // Decode the audio data with enhanced error handling
      audioContext.decodeAudioData(
        audioBuffer,
        (buffer) => {
          // Create source node
          const source = audioContext.createBufferSource();
          source.buffer = buffer;
          
          // Connect to destination (speakers)
          source.connect(audioContext.destination);
          
          // Play the audio
          source.start(0);
          console.log('Playing audio using Web Audio API successfully');
          
          // Clean up
          source.onended = () => {
            console.log('Web Audio API playback completed');
            audioContext.close();
          };
        },
        (decodeError) => {
          console.error('Error decoding audio data:', decodeError);
          
          // Try converting to WAV as last resort
          console.log('Attempting to convert audio for playback...');
          tryConvertAndPlay(audioBuffer);
        }
      );
    } catch (fallbackError) {
      console.error('Error in Web Audio API playback:', fallbackError);
      tryConvertAndPlay(audioBuffer);
    }
  };
  
  // Last resort method to try different audio conversions
  const tryConvertAndPlay = (audioBuffer: ArrayBuffer) => {
    try {
      // Try converting the audio to a Data URL with different formats
      const formats = ['audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/mp3'];
      
      // Create a temporary audio element
      const tempAudio = new Audio();
      
      // Set up event handlers
      tempAudio.oncanplaythrough = () => {
        console.log('Converted audio can play through, attempting playback');
        tempAudio.play().catch(e => {
          console.error('Failed to play converted audio:', e);
          useSynthesizedSpeech();
        });
      };
      
      tempAudio.onerror = () => {
        console.error('Error with converted audio format');
        useSynthesizedSpeech();
      };
      
      // Try each format in sequence
      let formatIndex = 0;
      
      const tryNextFormat = () => {
        if (formatIndex >= formats.length) {
          console.error('All conversion formats failed');
          useSynthesizedSpeech();
          return;
        }
        
        const format = formats[formatIndex++];
        console.log(`Trying format ${format} with size ${audioBuffer.byteLength} bytes`);
        
        const blob = new Blob([audioBuffer], { type: format });
        const url = URL.createObjectURL(blob);
        
        tempAudio.src = url;
        
        // Set a timeout to try the next format if this one doesn't work
        setTimeout(() => {
          if (!tempAudio.paused && tempAudio.currentTime > 0) {
            console.log(`Format ${format} is working`);
          } else {
            console.log(`Format ${format} failed, trying next`);
            URL.revokeObjectURL(url);
            tryNextFormat();
          }
        }, 1000);
      };
      
      // Start trying formats
      tryNextFormat();
    } catch (error) {
      console.error('Error in format conversion:', error);
      useSynthesizedSpeech();
    }
  };
  
  // Use browser's speech synthesis as absolute last resort
  const useSynthesizedSpeech = () => {
    console.log('Using speech synthesis as last resort');
    const synthAudio = new SpeechSynthesisUtterance('Voice cloning successful');
    window.speechSynthesis.speak(synthAudio);
  };
  
  // Update the current session with the newly created voice ID
  const updateCurrentSessionVoice = (voiceId: string) => {
    try {
      console.log('Updating current session with voice ID:', voiceId);
      
      // Get all sessions from localStorage
      const allSessions = JSON.parse(localStorage.getItem('aura_sessions') || '{}');
      
      // Find the active session (the one without endedAt)
      const activeSessionKey = Object.keys(allSessions).find(
        key => allSessions[key] && !allSessions[key].endedAt
      );
      
      if (activeSessionKey) {
        console.log('Found active session:', activeSessionKey);
        
        // Update the active session with the new voice ID
        allSessions[activeSessionKey].voiceId = voiceId;
        
        // Save the changes back to localStorage
        localStorage.setItem('aura_sessions', JSON.stringify(allSessions));
        
        // Dispatch an event to notify other components
        const event = new CustomEvent('voiceCloned', {
          detail: {
            voiceId,
            sessionId: activeSessionKey,
            timestamp: Date.now()
          }
        });
        window.dispatchEvent(event);
        
        console.log('Dispatched voiceCloned event with voice ID:', voiceId);
        
        // Double-check the object actually has voiceId set
        console.log('Session now has voice ID:', allSessions[activeSessionKey].voiceId);
        
        // Just to be absolutely sure, double-check after the event too
        setTimeout(() => {
          console.log('Double-checking voice ID after event:', voiceId);
        }, 100);
      } else {
        console.log('No active session found to update voice ID');
      }
    } catch (error) {
      console.error('Error updating current session voice:', error);
    }
  };
  
  // Fall back to ElevenLabs voice cloning as backup
  const submitVoiceCloneElevenLabs = async () => {
    if (!ELEVENLABS_API_KEY) {
      setError('API key is missing. Please set NEXT_PUBLIC_ELEVENLABS_API_KEY in your environment.');
      setIsSubmitting(false);
      return;
    }
    
    try {
      // Create a FormData object
      const formData = new FormData();
      
      // Add the name and description
      formData.append('name', voiceName);
      formData.append('description', 'Created with Aura Plus voice cloning tool');
      
      // Add the audio file
      if (previewSource === 'recorded' && recordedAudio) {
        formData.append('files', recordedAudio, 'recording.wav');
      } else if (previewSource === 'uploaded' && uploadedAudio) {
        formData.append('files', uploadedAudio);
      }
      
      // Set the API options
      formData.append('labels', JSON.stringify({"accent": "american"}));
      
      // Call the ElevenLabs API
      const response = await fetch('https://api.elevenlabs.io/v1/voices/add', {
        method: 'POST',
        headers: {
          'xi-api-key': ELEVENLABS_API_KEY,
          'Accept': 'application/json'
        },
        body: formData
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail?.message || 'Failed to clone voice');
      }
      
      const data = await response.json();
      setSuccess(data);
      
      // Save the voice ID to localStorage for later use
      if (data.voice_id) {
        const savedVoices = JSON.parse(localStorage.getItem('aura_cloned_voices') || '[]');
        savedVoices.push({
          id: data.voice_id,
          name: data.name,
          type: 'elevenlabs',
          createdAt: new Date().toISOString()
        });
        localStorage.setItem('aura_cloned_voices', JSON.stringify(savedVoices));
        
        // Update current active session to use this voice if one exists
        updateCurrentSessionVoice(data.voice_id);
      }
      
    } catch (error) {
      console.error('Error cloning voice:', error);
      setError(error instanceof Error ? error.message : 'An unknown error occurred');
    }
  };
  
  return (
    <div className="p-4 md:p-8">
      <div className="max-w-3xl mx-auto">
        <div className="bg-white rounded-xl shadow-sm mb-6">
          <div className="border-b p-6">
            <h1 className="text-2xl font-bold text-gray-900">Voice Cloning</h1>
            <p className="text-gray-600 mt-2">
              Create your personalized therapy voice by recording or uploading a sample
            </p>
            <p className="text-blue-600 text-sm mt-2">
              Voice cloning powered by ElevenLabs API
            </p>
          </div>
          
          {/* Tabs */}
          <div className="flex border-b">
            <button
              className={`flex-1 py-4 text-center transition-colors ${
                selectedTab === 'record' ? 'text-purple-600 border-b-2 border-purple-600' : 'text-gray-500 hover:text-gray-700'
              }`}
              onClick={() => setSelectedTab('record')}
            >
              <Mic className="inline-block mr-2 h-5 w-5" />
              Record Audio
            </button>
            
            <button
              className={`flex-1 py-4 text-center transition-colors ${
                selectedTab === 'upload' ? 'text-purple-600 border-b-2 border-purple-600' : 'text-gray-500 hover:text-gray-700'
              }`}
              onClick={() => setSelectedTab('upload')}
            >
              <Upload className="inline-block mr-2 h-5 w-5" />
              Upload Audio
            </button>
          </div>
          
          {/* Tab Content */}
          <div className="p-6">
            {/* Record Tab */}
            {selectedTab === 'record' && (
              <div className="flex flex-col items-center">
                <div
                  className={`w-28 h-28 rounded-full flex items-center justify-center mb-6 transition-colors ${
                    isRecording ? 'bg-red-500' : 'bg-purple-600 hover:bg-purple-700'
                  }`}
                >
                  <button
                    onClick={isRecording ? stopRecording : startRecording}
                    className="w-full h-full rounded-full flex items-center justify-center text-white"
                  >
                    {isRecording ? <MicOff size={36} /> : <Mic size={36} />}
                  </button>
                </div>
                
                <p className="text-sm text-gray-600 mb-4">
                  {isRecording 
                    ? 'Recording... Click to stop' 
                    : recordedAudio 
                      ? 'Recording complete. Click to re-record.' 
                      : 'Click to start recording'}
                </p>
                
                {isRecording && (
                  <div className="flex items-center space-x-1 my-2">
                    <div className="bg-red-500 w-2 h-4 rounded-full animate-pulse"></div>
                    <div className="bg-red-500 w-2 h-6 rounded-full animate-pulse delay-75"></div>
                    <div className="bg-red-500 w-2 h-2 rounded-full animate-pulse delay-150"></div>
                    <div className="bg-red-500 w-2 h-5 rounded-full animate-pulse delay-300"></div>
                  </div>
                )}
              </div>
            )}
            
            {/* Upload Tab */}
            {selectedTab === 'upload' && (
              <div className="flex flex-col items-center">
                <input 
                  type="file" 
                  ref={fileInputRef}
                  accept="audio/*"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                
                <div 
                  className="w-28 h-28 rounded-full bg-purple-600 hover:bg-purple-700 flex items-center justify-center mb-6 cursor-pointer"
                  onClick={triggerFileUpload}
                >
                  <Upload size={36} className="text-white" />
                </div>
                
                <p className="text-sm text-gray-600 mb-4">
                  {uploadedAudio 
                    ? `Selected: ${uploadedAudio.name}` 
                    : 'Click to upload an audio file'}
                </p>
                
                {uploadedAudio && (
                  <div className="text-xs text-gray-500">
                    Size: {(uploadedAudio.size / 1024).toFixed(2)} KB
                  </div>
                )}
              </div>
            )}
            
            {/* Preview Section */}
            {previewAudio && (
              <div className="mt-6 pt-6 border-t">
                <h3 className="text-lg font-medium text-gray-900 mb-4">Preview</h3>
                
                <div className="flex justify-center space-x-4 mb-6">
                  <button
                    onClick={playPreview}
                    className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 flex items-center"
                  >
                    <Play size={16} className="mr-2" />
                    Play
                  </button>
                  
                  <button
                    onClick={stopPreview}
                    className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 flex items-center"
                  >
                    <X size={16} className="mr-2" />
                    Stop
                  </button>
                  
                  <button
                    onClick={resetAll}
                    className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 flex items-center"
                  >
                    <RefreshCw size={16} className="mr-2" />
                    Reset
                  </button>
                </div>
                
                <div className="mb-6">
                  <label htmlFor="voice-name" className="block text-sm font-medium text-gray-700 mb-1">
                    Voice Name
                  </label>
                  <input
                    type="text"
                    id="voice-name"
                    value={voiceName}
                    onChange={(e) => setVoiceName(e.target.value)}
                    className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                    placeholder="Enter a name for your voice"
                  />
                </div>
                
                <button
                  onClick={submitVoiceClone}
                  disabled={isSubmitting}
                  className={`w-full py-3 rounded-md flex items-center justify-center ${
                    isSubmitting 
                      ? 'bg-gray-400 cursor-not-allowed' 
                      : 'bg-purple-600 hover:bg-purple-700'
                  } text-white`}
                >
                  {isSubmitting ? (
                    <>
                      <RefreshCw size={18} className="mr-2 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <Save size={18} className="mr-2" />
                      Clone Voice
                    </>
                  )}
                </button>
              </div>
            )}
            
            {/* Success Message */}
            {success && (
              <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-md">
                <h3 className="text-green-800 font-medium">Voice Cloned Successfully!</h3>
                <p className="text-green-700 text-sm mt-1">
                  Your voice "{success.name}" has been created with ID: {success.voice_id}
                </p>
                <p className="text-xs text-green-600 mt-2">
                  This voice ID has been saved and will be available for your future therapy sessions.
                </p>
              </div>
            )}
            
            {/* Error Message */}
            {error && (
              <div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-md flex">
                <AlertCircle className="h-5 w-5 text-red-500 mr-2 flex-shrink-0" />
                <p className="text-red-700 text-sm">{error}</p>
              </div>
            )}
            
            {/* Tips */}
            <div className="mt-8 pt-6 border-t">
              <h3 className="text-lg font-medium text-gray-900 mb-3">Tips for best results</h3>
              <ul className="text-sm text-gray-600 space-y-2">
                <li>• Record in a quiet environment with minimal background noise</li>
                <li>• Speak clearly and at a consistent volume</li>
                <li>• For best results, provide at least 30 seconds of audio</li>
                <li>• Use a high-quality microphone if possible</li>
                <li>• Avoid audio with multiple speakers or music</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 