console.log('Background script loaded');

// Extension state
const state = {
    isConnected: false,
    pendingRequests: new Map(),
    connectedSites: new Set(),
    wallet: null
};

// Constants
const DEFAULT_CURRENCY = 'VRSCTEST';
const RPC_URL = 'https://api.verustest.net';  // Default Verus RPC port

// Helper function for RPC calls
async function makeRPCCall(method, params = []) {
    try {
        const response = await fetch(RPC_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: Date.now(),
                method,
                params
            })
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        if (data.error) {
            throw new Error(data.error.message || 'RPC Error');
        }

        return data.result;
    } catch (error) {
        console.error(`[Verus Background] RPC error (${method}):`, error);
        throw error;
    }
}

// Initialize state from storage
async function initializeState() {
    const stored = await chrome.storage.local.get(['wallet', 'connectedSites']);
    if (stored.wallet) {
        state.wallet = stored.wallet;
    }
    if (stored.connectedSites) {
        state.connectedSites = new Set(stored.connectedSites);
    }
}

// Handle messages from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('[Verus Background] Received message:', message);
    const { type, origin } = message;
    
    switch (type) {
        case 'CONNECT_REQUEST':
            handleConnectRequest(origin, sender, sendResponse);
            break;
            
        case 'GET_BALANCE':
            handleGetBalance(message, sender, sendResponse);
            break;
            
        case 'APPROVE_CONNECTION':
            handleConnectionApproval(message.payload);
            break;
            
        case 'REJECT_CONNECTION':
            handleConnectionRejection(message.payload);
            break;
            
        case 'VERUS_CONNECT_REQUEST':
            handleVerusConnectRequest(message, sender, sendResponse);
            break;
            
        case 'VERUS_GET_BALANCE_REQUEST':
            handleVerusGetBalanceRequest(message, sender, sendResponse);
            break;
            
        case 'VERUS_SEND_TRANSACTION_REQUEST':
            handleVerusSendTransactionRequest(message, sender, sendResponse);
            break;
            
        case 'VERUS_ESTIMATE_FEE_REQUEST':
            handleVerusEstimateFeeRequest(message, sender, sendResponse);
            break;
            
        case 'GET_TRANSACTION_REQUEST':
            handleGetTransactionRequest(message, sender, sendResponse);
            break;
            
        case 'APPROVE_TRANSACTION':
            handleTransactionApproval(message, sender, sendResponse);
            break;
            
        case 'REJECT_TRANSACTION':
            handleTransactionRejection(message, sender, sendResponse);
            break;
            
        default:
            console.log('[Verus Background] Unknown message type:', type);
            sendResponse({ error: 'Unknown message type' });
    }
    
    return true; // Required for async response
});

async function handleConnectRequest(origin, sender, sendResponse) {
    try {
        console.log('[Verus Background] Processing connect request from:', origin);

        // Check if site is already connected
        if (state.connectedSites.has(origin)) {
            if (state.wallet?.address) {
                console.log('[Verus Background] Site already connected, returning address');
                return sendResponse({ address: state.wallet.address });
            }
        }

        // Get wallet from storage
        const { wallet } = await chrome.storage.local.get(['wallet']);
        if (!wallet?.address) {
            throw new Error('No wallet configured');
        }

        // Generate request ID
        const requestId = Math.random().toString(36).substring(7);
        console.log('[Verus Background] Generated request ID:', requestId);
        
        // Store request details
        state.pendingRequests.set(requestId, {
            origin,
            tabId: sender.tab.id,
            sendResponse,
            timestamp: Date.now()
        });

        // Create popup window
        try {
            const popupURL = chrome.runtime.getURL('popup.html');
            const queryParams = new URLSearchParams({
                requestId,
                origin: encodeURIComponent(origin),
                action: 'connect'
            }).toString();

            console.log('[Verus Background] Opening popup with URL:', `${popupURL}#/approve?${queryParams}`);

            const popup = await chrome.windows.create({
                url: `${popupURL}#/approve?${queryParams}`,
                type: 'popup',
                width: 360,
                height: 600,
                focused: true
            });

            state.pendingRequests.get(requestId).popupId = popup.id;
            sendResponse({ pending: true, requestId });
        } catch (error) {
            console.error('[Verus Background] Failed to create popup:', error);
            throw new Error('Failed to open connection approval window');
        }
    } catch (error) {
        console.error('[Verus Background] Connect error:', error);
        sendResponse({ error: error.message });
    }
}

async function handleGetBalance(request, sender, sendResponse) {
    try {
        const { address, currency = DEFAULT_CURRENCY } = request.payload;
        console.log('[Verus Background] Getting balance for:', { address, currency });
        
        // Check if site is connected
        if (!state.connectedSites.has(request.origin)) {
            throw new Error('Site not connected. Please connect first.');
        }

        // Get wallet and balances from storage
        const { wallet, balances } = await chrome.storage.local.get(['wallet', 'balances']);
        if (!wallet?.address) {
            throw new Error('No wallet configured');
        }

        // Get balance from storage
        const balance = balances?.[currency]?.[wallet.address] || '0';
        console.log(`[Verus Background] Found balance: ${balance} for currency: ${currency}`);

        // Send message to popup to refresh balances
        chrome.runtime.sendMessage({
            type: 'REFRESH_BALANCES',
            payload: { address: wallet.address, currency: currency }
        }).catch(error => {
            // Ignore error if popup is not open
            console.log('[Verus Background] Popup not available for balance refresh');
        });

        // Notify content script about the balance
        if (sender?.tab?.id) {
            try {
                await chrome.tabs.sendMessage(sender.tab.id, {
                    type: 'VERUS_BALANCE_UPDATED',
                    currency: currency,
                    balance: balance
                });
            } catch (error) {
                console.error('[Verus Background] Failed to notify content script:', error);
            }
        }

        sendResponse({ balance: balance.toString() });
    } catch (error) {
        console.error('[Verus Background] Get balance error:', error);
        
        // Send error back through content script
        if (sender?.tab?.id) {
            try {
                await chrome.tabs.sendMessage(sender.tab.id, {
                    type: 'VERUS_BALANCE_UPDATED',
                    error: error.message
                });
            } catch (err) {
                console.error('[Verus Background] Failed to notify content script:', err);
            }
        }
        
        sendResponse({ error: error.message });
    }
}

async function handleConnectionApproval(payload) {
    const { requestId } = payload;
    console.log('[Verus Background] Processing approval for request:', requestId);
    
    const request = state.pendingRequests.get(requestId);
    if (!request) {
        console.error('[Verus Background] Invalid request ID:', requestId);
        return;
    }

    try {
        // Get current wallet
        const { wallet } = await chrome.storage.local.get(['wallet']);
        if (!wallet?.address) {
            throw new Error('No wallet configured');
        }

        // Add to connected sites
        state.connectedSites.add(request.origin);
        
        // Save to storage
        await chrome.storage.local.set({ 
            connectedSites: Array.from(state.connectedSites) 
        });

        // Notify content script in the original tab
        if (request.tabId) {
            try {
                chrome.tabs.sendMessage(request.tabId, {
                    type: 'CONNECT_APPROVED',
                    address: wallet.address
                });
            } catch (error) {
                console.error('[Verus Background] Failed to notify content script:', error);
            }
        }

        // Notify original requester
        request.sendResponse({ address: wallet.address });
        
        // Close popup window if it exists
        if (request.popupId) {
            try {
                chrome.windows.remove(request.popupId);
            } catch (error) {
                console.error('[Verus Background] Failed to close popup:', error);
            }
        }

        // Clean up request
        state.pendingRequests.delete(requestId);
    } catch (error) {
        console.error('[Verus Background] Approval error:', error);
    }
}

async function handleConnectionRejection(payload) {
    const { requestId } = payload;
    const request = state.pendingRequests.get(requestId);
    
    if (request) {
        // Notify original requester
        request.sendResponse({ error: 'Connection rejected by user' });
        
        // Close popup if it exists
        if (request.popupId) {
            try {
                chrome.windows.remove(request.popupId);
            } catch (error) {
                console.error('[Verus Background] Failed to close popup:', error);
            }
        }
        
        // Clean up request
        state.pendingRequests.delete(requestId);
    }
}

// Handle verus connect request
async function handleVerusConnectRequest(message, sender, sendResponse) {
    try {
        // Get stored wallet
        const wallet = await chrome.storage.local.get(['wallet']);
        
        if (!wallet || !wallet.address) {
            throw new Error('No wallet found');
        }

        // Send response back through content script
        sendMessageToContentScript(sender.tab.id, {
            type: 'CONNECT_APPROVED',
            address: wallet.address
        });

        sendResponse({ success: true });
    } catch (error) {
        console.error('[Background] Connect error:', error);
        sendMessageToContentScript(sender.tab.id, {
            type: 'CONNECT_REJECTED',
            error: error.message
        });
        sendResponse({ success: false, error: error.message });
    }
}

async function handleVerusGetBalanceRequest(message, sender, sendResponse) {
    try {
        const { address, currency = DEFAULT_CURRENCY } = message.payload;
        console.log(`[Verus Background] Getting balance for ${address}, currency: ${currency}`);
        
        // Get balance from RPC
        const result = await makeRPCCall('getaddressbalance', [{ addresses: [address] }]);
        const confirmedBalance = result.balance || 0;
        
        console.log(`[Verus Background] Found balance: ${confirmedBalance} for currency: ${currency}`);

        // Send response directly through sendResponse
        sendResponse({ success: true, balance: confirmedBalance.toString() });
    } catch (error) {
        console.error('[Verus Background] Get balance error:', error);
        sendResponse({ success: false, error: error.message });
    }
}

async function handleVerusSendTransactionRequest(message, sender, sendResponse) {
    try {
        const { fromAddress, toAddress, amount, currency = DEFAULT_CURRENCY, memo } = message.payload;
        console.log('[Verus Background] Processing transaction request:', { fromAddress, toAddress, amount, currency });

        // Basic address validation
        if (!toAddress || !fromAddress) {
            throw new Error('Invalid addresses provided');
        }

        // Create transaction approval popup
        const { id: popupId, requestId } = await createTransactionApprovalPopup({
            fromAddress,
            toAddress,
            amount,
            currency,
            memo,
            origin: message.origin
        });

        // Store transaction data
        await chrome.storage.local.set({
            [`txRequest_${requestId}`]: {
                fromAddress,
                toAddress,
                amount,
                currency,
                memo,
                popupId,
                timestamp: Date.now()
            }
        });

        // Return immediately with requestId
        sendResponse({ success: true, requestId });
    } catch (error) {
        console.error('[Verus Background] Send transaction error:', error);
        sendResponse({ success: false, error: error.message });
    }
}

async function handleVerusEstimateFeeRequest(message, sender, sendResponse) {
    try {
        const { fromAddress, amount, currency } = message.payload;
        
        // Estimate fee
        const fee = await estimateFee(fromAddress, amount, currency);

        sendMessageToContentScript(sender.tab.id, {
            type: 'VERUS_ESTIMATE_FEE_RESPONSE',
            fee: fee.toString()
        });

        sendResponse({ success: true });
    } catch (error) {
        console.error('[Background] Estimate fee error:', error);
        sendMessageToContentScript(sender.tab.id, {
            type: 'VERUS_ESTIMATE_FEE_RESPONSE',
            error: error.message
        });
        sendResponse({ success: false, error: error.message });
    }
}

// Handle get transaction request
async function handleGetTransactionRequest(message, sender, sendResponse) {
    try {
        const { requestId } = message;
        console.log('[Verus Background] Getting transaction request:', requestId);

        // Get transaction data from storage
        const data = await chrome.storage.local.get([`txRequest_${requestId}`]);
        const transaction = data[`txRequest_${requestId}`];

        if (!transaction) {
            throw new Error('Transaction request not found');
        }

        sendResponse({ success: true, transaction });
    } catch (error) {
        console.error('[Verus Background] Get transaction error:', error);
        sendResponse({ success: false, error: error.message });
    }
}

async function handleTransactionApproval(message, sender, sendResponse) {
    try {
        const { requestId } = message.payload;
        console.log('[Verus Background] Handling transaction approval:', requestId);

        // Get the stored request data
        const data = await chrome.storage.local.get([`txRequest_${requestId}`]);
        const request = data[`txRequest_${requestId}`];
        console.log('[Verus Background] Found request data:', request);

        if (!request) {
            throw new Error('Transaction request not found');
        }

        // Notify any waiting popups
        const popupResponses = await chrome.storage.local.get(['popupResponses']);
        const responses = popupResponses.popupResponses || {};
        responses[request.popupId] = { approved: true };
        await chrome.storage.local.set({ popupResponses: responses });
        console.log('[Verus Background] Set popup response:', responses);

        // Send the transaction using sendtoaddress RPC method
        const txid = await makeRPCCall('sendtoaddress', [
            request.toAddress,
            parseFloat(request.amount),
            "", // comment
            "", // comment_to
            false, // subtract fee from amount
            false, // use instant send
            1, // conf target
            "UNSET", // address type
            false, // avoid reuse
            request.currency || DEFAULT_CURRENCY // currency
        ]);
        console.log('[Verus Background] Transaction sent:', txid);

        sendResponse({ success: true, txid });
    } catch (error) {
        console.error('[Verus Background] Transaction approval error:', error);
        sendResponse({ success: false, error: error.message });
    }
}

async function handleTransactionRejection(message, sender, sendResponse) {
    try {
        const { requestId, error } = message.payload;
        console.log('[Verus Background] Handling transaction rejection:', requestId);

        // Get the stored request data
        const data = await chrome.storage.local.get([`txRequest_${requestId}`]);
        const request = data[`txRequest_${requestId}`];

        if (!request) {
            throw new Error('Transaction request not found');
        }

        // Notify any waiting popups
        const popupResponses = await chrome.storage.local.get(['popupResponses']);
        const responses = popupResponses.popupResponses || {};
        responses[request.popupId] = { approved: false, error: error || 'Transaction rejected by user' };
        await chrome.storage.local.set({ popupResponses: responses });

        sendResponse({ success: true });
    } catch (error) {
        console.error('[Verus Background] Transaction rejection error:', error);
        sendResponse({ success: false, error: error.message });
    }
}

// Create transaction approval popup
async function createTransactionApprovalPopup(transaction) {
    // Generate unique request ID
    const requestId = Date.now().toString();
    
    // Store transaction data
    await chrome.storage.local.set({
        [`txRequest_${requestId}`]: {
            ...transaction,
            id: requestId,
            timestamp: Date.now()
        }
    });

    // Create popup with correct route
    const popup = await chrome.windows.create({
        url: chrome.runtime.getURL(`popup.html#/approve-transaction?requestId=${requestId}`),
        type: 'popup',
        width: 400,
        height: 600
    });

    return { id: popup.id, requestId };
}

// Wait for popup response
async function waitForPopupResponse(popupId) {
    return new Promise((resolve, reject) => {
        const checkResponse = async () => {
            const { popupResponses } = await chrome.storage.local.get(['popupResponses']);
            if (popupResponses && popupResponses[popupId]) {
                // Clear the response
                const response = popupResponses[popupId];
                delete popupResponses[popupId];
                await chrome.storage.local.set({ popupResponses });
                
                if (response.approved) {
                    resolve({ approved: true });
                } else {
                    reject(new Error(response.error || 'Transaction rejected by user'));
                }
            } else {
                // Check again in 500ms
                setTimeout(checkResponse, 500);
            }
        };
        checkResponse();
    });
}

// Helper to safely send message to content script
async function sendMessageToContentScript(tabId, message) {
    try {
        // Check if tab exists and has our content script
        const tab = await chrome.tabs.get(tabId);
        if (!tab) {
            console.log('[Verus Background] Tab not found:', tabId);
            return;
        }

        // Try to send message
        await chrome.tabs.sendMessage(tabId, message);
    } catch (error) {
        console.log('[Verus Background] Could not send message to content script:', error);
        // Don't throw - this is expected if content script isn't loaded
    }
}

// Initialize when loaded
initializeState().catch(console.error);
