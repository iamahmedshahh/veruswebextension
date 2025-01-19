import browser from 'webextension-polyfill';

console.log('[Verus] Content script loaded');

// Inject provider script
const script = document.createElement('script');
script.src = browser.runtime.getURL('provider.js');
(document.head || document.documentElement).appendChild(script);

// Listen for messages from the page
window.addEventListener('message', async (event) => {
    if (event.source !== window) return;
    if (!event.data.type) return;

    const { type, payload } = event.data;
    console.log('[Verus] Received message from page:', type, payload);

    try {
        switch (type) {
            case 'VERUS_CONNECT_REQUEST':
                const connectResponse = await browser.runtime.sendMessage({
                    type: 'CONNECT_REQUEST',
                    origin: window.location.origin
                });
                
                window.postMessage({
                    type: 'VERUS_CONNECT_RESPONSE',
                    result: connectResponse
                }, '*');
                break;

            case 'VERUS_SEND_TRANSACTION':
                const txResponse = await browser.runtime.sendMessage({
                    type: 'SEND_TRANSACTION',
                    payload: payload,
                    origin: window.location.origin
                });
                
                window.postMessage({
                    type: 'VERUS_SEND_TRANSACTION_RESPONSE',
                    result: txResponse
                }, '*');
                break;

            case 'VERUS_GET_BALANCE':
                const balanceResponse = await browser.runtime.sendMessage({
                    type: 'GET_BALANCE',
                    payload: payload
                });
                
                window.postMessage({
                    type: 'VERUS_GET_BALANCE_RESPONSE',
                    result: balanceResponse
                }, '*');
                break;
        }
    } catch (error) {
        console.error('[Verus] Content script error:', error);
        window.postMessage({
            type: `${type}_RESPONSE`,
            error: error.message
        }, '*');
    }
});

// Listen for messages from the background script
browser.runtime.onMessage.addListener((message) => {
    console.log('[Verus] Received background message:', message);
    
    // Forward state changes to the page
    if (message.type === 'STATE_CHANGE') {
        window.postMessage({
            type: 'VERUS_STATE_CHANGE',
            ...message.payload
        }, '*');
    }
});
