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
      const response = await browser.runtime.sendMessage({
        type: 'CONNECT_REQUEST',
        origin: window.location.origin
      });
      
      console.log('[Verus] Received connect response:', response);
      
      if (response.error === 'Wallet is locked') {
        // For locked wallet, we wait for unlock and approval
        window.postMessage({
          type: 'VERUS_CONNECT_REQUEST_RESPONSE',
          payload: { status: 'awaitingApproval' }
        }, '*');
      } else if (response.error) {
        // For other errors, send error response
        window.postMessage({
          type: 'VERUS_CONNECT_REQUEST_RESPONSE',
          payload: { error: response.error }
        }, '*');
      } else if (response.status === 'awaitingApproval') {
        // For awaiting approval, send waiting status
        window.postMessage({
          type: 'VERUS_CONNECT_REQUEST_RESPONSE',
          payload: { status: 'awaitingApproval' }
        }, '*');
      } else {
        // For successful connection
        window.postMessage({
          type: 'VERUS_CONNECT_REQUEST_RESPONSE',
          payload: response
        }, '*');
      }
    } catch (error) {
      console.error('[Verus] Error connecting:', error);
      window.postMessage({
        type: 'VERUS_CONNECT_REQUEST_RESPONSE',
        payload: { error: error.message }
      }, '*');
    }
  }

  if (event.data.type === 'VERUS_GET_BALANCE_REQUEST') {
    try {
      console.log('[Verus] Getting balance');
      const response = await browser.runtime.sendMessage({
        type: 'GET_BALANCE_REQUEST',
        currency: event.data.currency
      });
      
      window.postMessage({
        type: 'VERUS_GET_BALANCE_REQUEST_RESPONSE',
        payload: response
      }, '*');
    } catch (error) {
      console.error('[Verus] Error getting balance:', error);
      window.postMessage({
        type: 'VERUS_GET_BALANCE_REQUEST_RESPONSE',
        payload: { error: error.message }
      }, '*');
    }
  }
});

// Listen for connection events from background script
browser.runtime.onMessage.addListener((message) => {
  if (message.type === 'CONNECT_RESULT') {
    window.postMessage({
      type: 'VERUS_CONNECT_REQUEST_RESPONSE',
      payload: {
        status: 'connected',
        address: message.address,
        chainId: message.chainId
      }
    }, '*');
  }
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
