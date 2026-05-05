import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';

export const dynamic = 'force-dynamic';

/**
 * Test endpoint to validate Zyphra API connectivity
 */
export async function GET(request: NextRequest) {
  const apiKey = 'zsk-41170e00c745ec61140bba001eb1ed74f2aaedbe2a93d0788d099f8209cdf040';
  
  try {
    console.log('Testing Zyphra API connection...');
    
    // Test the API by getting available models
    const response = await axios.get('https://api.zyphra.com/v1/models', {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    });
    
    console.log('Zyphra API test successful. Response:', response.status);
    
    return NextResponse.json({
      success: true,
      message: 'Successfully connected to Zyphra API',
      models: response.data,
      apiVersion: response.headers['x-api-version'] || 'unknown'
    });
  } catch (error: any) {
    console.error('Zyphra API test failed:', error.message);
    
    // Return detailed error information
    return NextResponse.json({
      success: false,
      error: error.message,
      status: error.response?.status,
      details: error.response?.data,
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
} 