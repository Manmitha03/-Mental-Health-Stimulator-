import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// This is a better valid MP3 file as a base64 string - improved version that's browser-compatible
const FALLBACK_AUDIO = 'SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA//tQxAADB8AhSmxhIIEVCSiJrDCQQAkgALIAAABOAGeDgQBGjvBwXB8H8HwfA8DwPA8DwfB8DwfB8HwfB8DwPA8DwPB8DwfB8HwfA8DwPB8DwfB8HwfA8DwPB8DwfB8HwfB8H//8Hg+D4Pg+D4sSQIGSA//tQxBYAGJINKGGGrgL0IqKww1dgMAhPgnmHKM2AGYa47TCiEk6Y4wpDGM0+WoZJ9GhOk/8vMM8LUNWbwmaf/5hhhhhjzNP33h5h4hn/8wzwwxoMwxhhmgzAYYYxoYYxghBBcWF//tQxCUAF2ENJYYauAL8IqYYw1dhoADDBBBCDDGNDFzShhhhhiez/MMMMYQYYzT5Y8wzDGEIGGMBmGMIQMMMMMMMwwwQgwxmEMwxjNP/5jT/8PMMMMaGGY0///mEIYDAFxYX//tQxDAAGMENVUxhaAMcIqYYw1dhgGGGEGGODQYYYxhiGnAcGg8MHhj8vLA0cGM8BGfB0ePaFR4YXj/BimeGziPLiiXBYnAFjDBwKGIEFfCxhY1KgAgKMbFFQRgsRCvD//tQxDmAGTEtKMPMrQM+JqIYeZsgAmFEYsaaaSiSTSabTUmJtNmkkkkkkGMP///5hGiaP/5aRCRxhCEYRxI6IxQiQTCOJ//6SRx3o660k0kk2mzaTZppNpp///5tJJJNGkkktf/7//tQxEOAF4ktEMPMrQMKJqIYeZshJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJBBBBBgwYMGDBg8MMMMMMMMD/gwYMGDBgwYMGDBgwYMGH/gwYMGDBgwYMGDBgwYMGDBgwYMGDBgwYMGDBgw//tQxFOAF2EtEMMMrYMqJaEYeZuYYMGD/gwYMGDBgQA';

// Alternative fallback: WAV format that's often more reliable in browsers
const FALLBACK_WAV = 'UklGRsgAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YaQAAAAA/wD//wAA//8AAP///wD/AP8AAAD//wAA/////wAAAAAAAAAAAAAAAAAAAAAAAAAA/wAAAAAA/wAAAAAA//8AAAAAAAAAAAAAAAAAAAAA//8AAAAAAAAAAAAAAAD//wAAAAAAAAD/AAAA/wAAAP//AAAAAAAAAAAAAAAA//8AAAAA/wD/AAAAAP8AAP8AAAAA';

// Simple fallback endpoint for when other TTS methods fail
export async function POST(request: NextRequest) {
  try {
    // Parse request body if needed
    const body = await request.json().catch(() => ({}));
    
    console.log('Zyphra fallback called with:', {
      method: request.method,
      url: request.url,
      bodyKeys: Object.keys(body)
    });
    
    // Check if the request wants WAV format
    const useWav = body.format === 'wav';
    
    // Return a fallback audio file
    const audioBuffer = Buffer.from(useWav ? FALLBACK_WAV : FALLBACK_AUDIO, 'base64');
    
    return new NextResponse(audioBuffer, {
      headers: {
        'Content-Type': useWav ? 'audio/wav' : 'audio/mpeg',
        'Content-Length': audioBuffer.length.toString(),
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
        'X-Content-Type-Options': 'nosniff',
        'Accept-Ranges': 'bytes'
      },
    });
  } catch (error) {
    console.error('Fallback TTS error:', error);
    
    // Even if parsing fails, still return the fallback audio - use WAV as safest option
    const audioBuffer = Buffer.from(FALLBACK_WAV, 'base64');
    
    return new NextResponse(audioBuffer, {
      headers: {
        'Content-Type': 'audio/wav',
        'Content-Length': audioBuffer.length.toString(),
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
        'X-Content-Type-Options': 'nosniff',
        'Accept-Ranges': 'bytes'
      },
    });
  }
}

// GET endpoint for testing
export async function GET(request: NextRequest) {
  // Check if the request wants WAV format
  const useWav = request.nextUrl.searchParams.get('format') === 'wav';
  
  const audioBuffer = Buffer.from(useWav ? FALLBACK_WAV : FALLBACK_AUDIO, 'base64');
  
  return new NextResponse(audioBuffer, {
    headers: {
      'Content-Type': useWav ? 'audio/wav' : 'audio/mpeg',
      'Content-Length': audioBuffer.length.toString(),
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
      'X-Content-Type-Options': 'nosniff',
      'Accept-Ranges': 'bytes'
    },
  });
} 