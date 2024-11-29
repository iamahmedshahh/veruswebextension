import browser from 'webextension-polyfill';
import { testConnection } from './utils/verus-rpc';

console.log('Background script loaded');

// Initialize connection
testConnection()
  .then(isConnected => {
    console.log('RPC connection status:', isConnected ? 'Connected' : 'Failed to connect');
  })
  .catch(error => {
    console.error('RPC connection error:', error);
  });

// Handle messages from the popup
browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Background script received message:', request);
  
  // Create a promise for the response
  const responsePromise = (async () => {
    try {
      switch (request.type) {
        case 'CHECK_CONNECTION':
          console.log('Checking connection...');
          const isConnected = await testConnection();
          console.log('Connection check result:', isConnected);
          return { isConnected };
        
        default:
          throw new Error(`Unknown message type: ${request.type}`);
      }
    } catch (error) {
      console.error('Error handling message:', error);
      return { error: error.message };
    }
  })();
  
  // Return true to indicate we will send a response asynchronously
  return responsePromise;
});

// Initialize the service worker
self.addEventListener('activate', event => {
  console.log('Service worker activated');
  event.waitUntil(clients.claim());
});

// Keep the service worker alive
self.addEventListener('install', event => {
  console.log('Service worker installed');
  event.waitUntil(self.skipWaiting());
});

// Handle errors
self.addEventListener('error', event => {
  console.error('Service worker error:', event.error);
});

// Handle unhandled rejections
self.addEventListener('unhandledrejection', event => {
  console.error('Unhandled promise rejection:', event.reason);
});
