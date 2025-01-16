import browser from 'webextension-polyfill';

console.log('[Verus] Content script loaded');

// Track pending requests
const pendingRequests = new Map();

// Inject provider script
const script = document.createElement('script');
script.src = browser.runtime.getURL('provider.js');
(document.head || document.documentElement).appendChild(script);

// Listen for messages from the page
window.addEventListener('message', async (event) => {
    if (event.source !== window) return;
    if (!event.data.type) return;

    const { type, requestId, ...rest } = event.data;
    console.log('[Verus] Received message from page:', type, requestId);

    try {
        if (type === 'VERUS_CONNECT_REQUEST') {
            console.log('[Verus] Connecting...');
            const response = await browser.runtime.sendMessage({
                type: 'CONNECT_REQUEST',
                origin: window.location.origin,
                requestId
            });
            
            console.log('[Verus] Connect response:', response);
            
            // Forward the response directly
            window.postMessage({
                type: 'VERUS_CONNECT_REQUEST_RESPONSE',
                payload: response
            }, '*');
        }
        else if (type === 'VERUS_GET_BALANCES_REQUEST') {
            console.log('[Verus] Getting all balances');
            const response = await browser.runtime.sendMessage({ type, requestId });
            window.postMessage({
                type: 'VERUS_GET_BALANCES_REQUEST_RESPONSE',
                payload: response
            }, '*');
        }
        else if (type === 'VERUS_GET_TOTAL_BALANCE_REQUEST') {
            console.log('[Verus] Getting total balance');
            const response = await browser.runtime.sendMessage({ type, requestId });
            window.postMessage({
                type: 'VERUS_GET_TOTAL_BALANCE_REQUEST_RESPONSE',
                payload: response
            }, '*');
        }
        else if (type === 'VERUS_SEND_TRANSACTION_REQUEST') {
            console.log('[Verus] Processing Verus transaction request:', rest.payload);
            const response = await browser.runtime.sendMessage({
                type: 'SEND_VERUS_TRANSACTION',
                payload: rest.payload,
                origin: window.location.origin,
                requestId
            });
            
            window.postMessage({
                type: 'VERUS_SEND_TRANSACTION_REQUEST_RESPONSE',
                payload: response
            }, '*');
        }
        else if (type === 'VERUS_SET_CONNECTING') {
            await browser.runtime.sendMessage({ 
                type, 
                payload: rest.payload,
                requestId 
            });
        }
    } catch (error) {
        console.error('[Verus] Content script error:', error);
        window.postMessage({
            type: `${type}_RESPONSE`,
            payload: { error: error.message, requestId }
        }, '*');
    }
});

// Listen for messages from the background script
browser.runtime.onMessage.addListener((message) => {
    console.log('[Verus] Received background message:', message);
    
    if (message.type === 'CONNECT_RESULT') {
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
