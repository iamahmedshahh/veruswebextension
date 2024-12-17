import browser from 'webextension-polyfill';

console.log('[Verus] Content script loaded');

// Inject provider script
const script = document.createElement('script');
script.src = browser.runtime.getURL('provider.js');
(document.head || document.documentElement).appendChild(script);

// Handle messages from the page
window.addEventListener('message', async (event) => {
  if (event.source !== window) return;
  
  console.log('[Verus] Received message from page:', event.data.type, event.data.payload);
  
  if (event.data.type === 'VERUS_CHECK_CONNECTION') {
    try {
      console.log('[Verus] Checking connection state');
      const response = await browser.runtime.sendMessage({
        type: 'CHECK_CONNECTION',
        origin: window.location.origin
      });
      
      window.postMessage({
        type: 'VERUS_CHECK_CONNECTION_RESPONSE',
        payload: response
      }, '*');
    } catch (error) {
      console.error('[Verus] Error checking connection:', error);
      window.postMessage({
        type: 'VERUS_CHECK_CONNECTION_RESPONSE',
        payload: { error: error.message }
      }, '*');
    }
  }

  if (event.data.type === 'VERUS_CONNECT_REQUEST') {
    try {
      console.log('[Verus] Sending connect request to background');
      // Send connect request to background
      const response = await browser.runtime.sendMessage({
        type: 'CONNECT_REQUEST',
        origin: window.location.origin
      });
      
      console.log('[Verus] Received connect response from background:', response);
      // Send response back to page
      window.postMessage({
        type: 'VERUS_CONNECT_REQUEST_RESPONSE',
        payload: response
      }, '*');
      
    } catch (error) {
      console.error('[Verus] Error handling connect request:', error);
      window.postMessage({
        type: 'VERUS_CONNECT_REQUEST_RESPONSE',
        payload: {
          error: error.message
        }
      }, '*');
    }
  }

  if (event.data.type === 'VERUS_GET_BALANCE_REQUEST') {
    try {
      console.log('[Verus] Sending get balance request to background');
      const response = await browser.runtime.sendMessage({
        type: 'GET_BALANCE_REQUEST',
        currency: event.data.currency
      });
      
      console.log('[Verus] Received get balance response from background:', response);
      window.postMessage({
        type: 'VERUS_GET_BALANCE_REQUEST_RESPONSE',
        payload: response
      }, '*');
      
    } catch (error) {
      console.error('[Verus] Error handling get balance request:', error);
      window.postMessage({
        type: 'VERUS_GET_BALANCE_REQUEST_RESPONSE',
        payload: {
          error: error.message
        }
      }, '*');
    }
  }
});

// Listen for messages from background script
browser.runtime.onMessage.addListener((message) => {
  console.log('[Verus] Received message from background:', message);

  if (message.type === 'CONNECT_RESULT') {
    console.log('[Verus] Forwarding connection result to page:', message);
    // Forward the connection result to the page
    window.postMessage({
      type: 'VERUS_CONNECT_REQUEST_RESPONSE',
      payload: message.error ? { error: message.error } : message.result
    }, '*');
  }

  if (message.type === 'CONNECTION_STATUS_CHANGED') {
    console.log('[Verus] Forwarding connection status change to page:', message);
    window.postMessage({
      type: 'VERUS_CONNECT_REQUEST_RESPONSE',
      payload: message.payload
    }, '*');
  }
  return true;
});

// Initialize message passing between page and background
browser.runtime.onConnect.addListener((port) => {
  console.log('[Verus] Connected to background script');
});

// Inject the provider when document starts loading
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {});
} else {
}
