import browser from 'webextension-polyfill';

console.log('[Verus] Content script loaded');

// Track pending requests
const pendingRequests = new Map();

// Inject provider script
const script = document.createElement('script');
script.src = browser.runtime.getURL('provider.js');
(document.head || document.documentElement).appendChild(script);

// Handle messages from the webpage
window.addEventListener('message', async (event) => {
  if (event.source !== window) return;
  
  const { type, requestId } = event.data;
  console.log('[Verus] Received message from page:', type, requestId);
  
  try {
    let response;
    
    switch (type) {
      case 'VERUS_CHECK_CONNECTION':
        console.log('[Verus] Checking connection state');
        response = await browser.runtime.sendMessage({
          type: 'CHECK_CONNECTION',
          origin: window.location.origin
        });
        
        window.postMessage({
          type: 'VERUS_CHECK_CONNECTION_RESPONSE',
          payload: response
        }, '*');
        break;

      case 'VERUS_CONNECT_REQUEST':
        console.log('[Verus] Sending connect request to background');
        
        // Generate request ID if not provided
        const connectRequestId = requestId || Math.random().toString(36).substring(7);
        
        // Track the request
        pendingRequests.set(connectRequestId, {
          type: 'connect',
          timestamp: Date.now()
        });
        
        response = await browser.runtime.sendMessage({
          type: 'CONNECT_REQUEST',
          origin: window.location.origin,
          requestId: connectRequestId
        });
        
        console.log('[Verus] Received connect response:', response);
        
        // Handle different response types
        let payload;
        if (response.error === 'Wallet is locked' || response.status === 'awaitingApproval') {
          payload = { 
            status: 'awaitingApproval',
            requestId: connectRequestId
          };
        } else if (response.error) {
          payload = { 
            error: response.error,
            requestId: connectRequestId
          };
        } else if (response.result?.connected) {
          payload = {
            status: 'connected',
            address: response.result.address,
            chainId: response.result.chainId,
            requestId: connectRequestId
          };
          pendingRequests.delete(connectRequestId);
        } else {
          payload = response;
        }
        
        window.postMessage({
          type: 'VERUS_CONNECT_REQUEST_RESPONSE',
          payload
        }, '*');
        break;

      case 'VERUS_GET_BALANCE_REQUEST':
        console.log('[Verus] Getting balance');
        response = await browser.runtime.sendMessage({
          type: 'GET_BALANCE_REQUEST',
          currency: event.data.currency
        });
        
        window.postMessage({
          type: 'VERUS_GET_BALANCE_REQUEST_RESPONSE',
          payload: response
        }, '*');
        break;

      case 'VERUS_GET_BALANCES_REQUEST':
        console.log('[Verus] Getting all balances');
        response = await browser.runtime.sendMessage({
          type: 'GET_BALANCES',
          requestId
        });
        
        window.postMessage({
          type: 'VERUS_GET_BALANCES_REQUEST_RESPONSE',
          payload: { ...response, requestId }
        }, '*');
        break;

      case 'VERUS_GET_TOTAL_BALANCE_REQUEST':
        console.log('[Verus] Getting total balance');
        response = await browser.runtime.sendMessage({
          type: 'GET_TOTAL_BALANCE',
          requestId
        });
        
        window.postMessage({
          type: 'VERUS_GET_TOTAL_BALANCE_REQUEST_RESPONSE',
          payload: {
            totalBalance: response.totalBalance,
            balances: response.balances,
            error: response.error,
            requestId
          }
        }, '*');
        break;

      default:
        console.log('[Verus] Unknown message type:', type);
        break;
    }
  } catch (error) {
    console.error('[Verus Content Script] Error:', error);
    window.postMessage({
      type: `${type}_RESPONSE`,
      payload: {
        error: error.message
      }
    }, '*');
  }
});

// Listen for connection events from background script
browser.runtime.onMessage.addListener((message) => {
  console.log('[Verus] Received background message:', message);
  
  if (message.type === 'CONNECT_RESULT') {
    const pendingRequest = pendingRequests.get(message.requestId);
    if (pendingRequest) {
      pendingRequests.delete(message.requestId);
      
      window.postMessage({
        type: 'VERUS_CONNECT_REQUEST_RESPONSE',
        payload: {
          status: message.status,
          address: message.address,
          chainId: message.chainId,
          requestId: message.requestId
        }
      }, '*');
    }
  }
});

// Clean up old pending requests periodically
setInterval(() => {
  const now = Date.now();
  const timeout = 5 * 60 * 1000; // 5 minutes
  
  for (const [requestId, request] of pendingRequests.entries()) {
    if (now - request.timestamp > timeout) {
      pendingRequests.delete(requestId);
      
      // Notify provider of timeout
      window.postMessage({
        type: 'VERUS_CONNECT_REQUEST_RESPONSE',
        payload: {
          status: 'error',
          error: 'Connection request timed out',
          requestId
        }
      }, '*');
    }
  }
}, 60000); // Check every minute

// Initialize message passing between page and background
browser.runtime.onConnect.addListener((port) => {
  console.log('[Verus] Connected to background script');
});

// Inject the provider when document starts loading
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {});
} else {
}
