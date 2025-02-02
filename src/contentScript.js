console.log('[Verus] Content script loaded');

// Inject provider script
const script = document.createElement('script');
script.src = chrome.runtime.getURL('provider.js');
script.onload = () => {
    console.log('[Verus] Provider script loaded successfully');
};
(document.head || document.documentElement).appendChild(script);

// Handle messages from the page
window.addEventListener('message', async (event) => {
    if (event.source !== window) return;
    if (!event.data.type) return;

    const { type, payload } = event.data;
    console.log('[Verus] Received message from page:', type);

    try {
        switch (type) {
            case 'VERUS_CONNECT_REQUEST':
                console.log('[Verus] Sending connect request to background');
                const response = await chrome.runtime.sendMessage({ 
                    type: 'CONNECT_REQUEST',
                    origin: window.location.origin
                });
                console.log('[Verus] Got connect response:', response);

                if (response.error) {
                    window.postMessage({
                        type: 'CONNECT_REJECTED',
                        error: response.error
                    }, '*');
                } else if (response.pending) {
                    console.log('[Verus] Connection request pending approval');
                    // Don't send any response yet, wait for approval/rejection
                } else if (response.address) {
                    window.postMessage({
                        type: 'CONNECT_APPROVED',
                        address: response.address
                    }, '*');
                }
                break;
            
            case 'VERUS_GET_BALANCE':
                const balanceResponse = await chrome.runtime.sendMessage({
                    type: 'GET_BALANCE',
                    payload: payload,
                    origin: window.location.origin
                });
                
                window.postMessage({
                    type: 'VERUS_GET_BALANCE_RESPONSE',
                    result: balanceResponse.error ? null : balanceResponse,
                    error: balanceResponse.error
                }, '*');
                break;

            case 'VERUS_SEND_REQUEST':
                console.log('[Verus] Sending transaction request to background');
                const sendResponse = await chrome.runtime.sendMessage({
                    type: 'SEND_TRANSACTION',
                    payload: payload,
                    origin: window.location.origin
                });
                
                window.postMessage({
                    type: 'VERUS_SEND_RESPONSE',
                    result: sendResponse.error ? null : { txid: sendResponse.txid },
                    error: sendResponse.error
                }, '*');
                break;
        }
    } catch (error) {
        console.error('[Verus] Content script error:', error);
        window.postMessage({
            type: type === 'VERUS_CONNECT_REQUEST' ? 'CONNECT_REJECTED' : 'VERUS_GET_BALANCE_RESPONSE',
            error: error.message
        }, '*');
    }
});

// Listen for messages from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('[Verus] Received background message:', message);
    
    // Forward approval/rejection messages to the page
    if (message.type === 'CONNECT_APPROVED' || 
        message.type === 'CONNECT_REJECTED' ||
        message.type === 'TRANSACTION_APPROVED' ||
        message.type === 'TRANSACTION_REJECTED') {
        window.postMessage(message, '*');
    }
    
    return true;
});
