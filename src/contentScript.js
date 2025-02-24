console.log('[Verus] Content script loaded');

// Inject provider script
const injectProvider = () => {
    try {
        const script = document.createElement('script');
        script.src = chrome.runtime.getURL('src/provider.js');
        script.onload = () => {
            console.log('[Verus] Provider script loaded successfully');
            // Notify that the provider is ready
            window.postMessage({ type: 'VERUS_PROVIDER_READY' }, '*');
        };
        script.onerror = (error) => {
            console.error('[Verus] Failed to load provider script:', error);
        };
        (document.head || document.documentElement).appendChild(script);
    } catch (error) {
        console.error('[Verus] Failed to inject provider:', error);
    }
};

// Inject provider as soon as possible
injectProvider();

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
                } else if (response.address) {
                    window.postMessage({
                        type: 'CONNECT_APPROVED',
                        address: response.address
                    }, '*');
                }
                break;

            case 'VERUS_GET_BALANCE_REQUEST':
                console.log('[Verus] Sending balance request to background');
                const balanceResponse = await chrome.runtime.sendMessage({
                    type: 'GET_BALANCE',
                    payload,
                    origin: window.location.origin
                });
                console.log('[Verus] Got balance response:', balanceResponse);

                window.postMessage({
                    type: 'VERUS_GET_BALANCE_RESPONSE',
                    balance: balanceResponse.balance,
                    error: balanceResponse.error
                }, '*');
                break;

            case 'VERUS_SEND_TRANSACTION_REQUEST':
                console.log('[Verus] Sending transaction request to background');
                const txResponse = await chrome.runtime.sendMessage({
                    type: 'VERUS_SEND_TRANSACTION_REQUEST',
                    payload,
                    origin: window.location.origin
                });
                console.log('[Verus] Got transaction response:', txResponse);

                window.postMessage({
                    type: txResponse.success ? 'VERUS_TRANSACTION_APPROVED' : 'VERUS_TRANSACTION_REJECTED',
                    txid: txResponse.txid,
                    error: txResponse.error
                }, '*');
                break;

            case 'VERUS_ESTIMATE_FEE_REQUEST':
                console.log('[Verus] Sending fee estimation request to background');
                const feeResponse = await chrome.runtime.sendMessage({
                    type: 'VERUS_ESTIMATE_FEE_REQUEST',
                    payload,
                    origin: window.location.origin
                });
                console.log('[Verus] Got fee response:', feeResponse);

                window.postMessage({
                    type: 'VERUS_ESTIMATE_FEE_RESPONSE',
                    fee: feeResponse.fee,
                    error: feeResponse.error
                }, '*');
                break;

            case 'VERUS_GET_CURRENCIES_REQUEST':
                console.log('[Verus] Sending get currencies request to background');
                const currenciesResponse = await chrome.runtime.sendMessage({
                    type: 'GET_CURRENCIES',
                    origin: window.location.origin
                });
                console.log('[Verus] Got currencies response:', currenciesResponse);

                window.postMessage({
                    type: 'VERUS_GET_CURRENCIES_RESPONSE',
                    currencies: currenciesResponse.currencies,
                    error: currenciesResponse.error
                }, '*');
                break;

            case 'VERUS_GET_CURRENCY_BALANCE_REQUEST':
                console.log('[Verus] Sending currency balance request to background');
                const currencyBalanceResponse = await chrome.runtime.sendMessage({
                    type: 'GET_CURRENCY_BALANCE',
                    payload,
                    origin: window.location.origin
                });
                console.log('[Verus] Got currency balance response:', currencyBalanceResponse);

                window.postMessage({
                    type: 'VERUS_GET_CURRENCY_BALANCE_RESPONSE',
                    balance: currencyBalanceResponse.balance,
                    error: currencyBalanceResponse.error
                }, '*');
                break;

            case 'VERUS_SELECT_CURRENCY_REQUEST':
                console.log('[Verus] Sending select currency request to background');
                const selectCurrencyResponse = await chrome.runtime.sendMessage({
                    type: 'SELECT_CURRENCY',
                    payload,
                    origin: window.location.origin
                });
                console.log('[Verus] Got select currency response:', selectCurrencyResponse);

                window.postMessage({
                    type: 'VERUS_SELECT_CURRENCY_RESPONSE',
                    success: selectCurrencyResponse.success,
                    error: selectCurrencyResponse.error
                }, '*');
                break;
        }
    } catch (error) {
        console.error('[Verus] Error handling message:', error);
        window.postMessage({
            type: `${type}_ERROR`,
            error: error.message
        }, '*');
    }
});

// Listen for messages from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('[Verus] Received background message:', message);
    
    // Forward all relevant messages to the page
    if ([
        'CONNECT_APPROVED',
        'CONNECT_REJECTED',
        'VERUS_BALANCE_UPDATED',
        'VERUS_TRANSACTION_APPROVED',
        'VERUS_TRANSACTION_REJECTED',
        'VERUS_ESTIMATE_FEE_RESPONSE',
        'VERUS_GET_CURRENCIES_RESPONSE'
    ].includes(message.type)) {
        window.postMessage(message, '*');
    }
    
    return true;
});
