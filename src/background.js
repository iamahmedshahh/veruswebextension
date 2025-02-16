// Verus RPC communication utilities
import { makeRPCCall, testConnection, getAddressBalance, getAllCurrencyBalances } from './utils/verus-rpc';
import { sendCurrency } from './utils/transaction';
import { store } from './store';

console.log('Background script loaded');

// Extension state
const state = {
    isConnected: false,
    pendingRequests: new Map(),
    connectedSites: new Set(),
    wallet: null
};

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
    const { type, origin, payload } = message;
    
    switch (type) {
        case 'CONNECT_REQUEST':
            handleConnectRequest(origin, sender, sendResponse);
            break;
            
        case 'GET_BALANCE':
            handleBalanceRequest(origin, payload?.address, sendResponse);
            break;
            
        case 'GET_TRANSACTION_REQUEST':
            handleGetTransactionRequest(message.requestId, sendResponse);
            break;
            
        case 'GET_KNOWN_ADDRESSES':
            handleGetKnownAddresses(sendResponse);
            break;
            
        case 'GET_CONNECTED_SITES':
            handleGetConnectedSites(sendResponse);
            break;
            
        case 'SEND_TRANSACTION':
            handleSendTransaction(origin, payload, sender, sendResponse);
            break;
            
        case 'APPROVE_CONNECTION':
            console.log('[Verus Background] Processing approval:', payload);
            handleConnectionApproval(payload, sendResponse);
            break;
            
        case 'REJECT_CONNECTION':
            console.log('[Verus Background] Processing rejection:', payload);
            handleConnectionRejection(payload, sendResponse);
            break;
            
        case 'APPROVE_TRANSACTION':
            handleTransactionApproval(payload, sendResponse);
            break;
            
        case 'REJECT_TRANSACTION':
            handleTransactionRejection(payload, sendResponse);
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
            const popupURL = chrome.runtime.getURL('popup.html#/approve');
            const queryParams = new URLSearchParams({
                requestId,
                origin: encodeURIComponent(origin),
                action: 'connect'
            }).toString();

            console.log('[Verus Background] Opening popup with URL:', popupURL + '?' + queryParams);
            
            const popup = await chrome.windows.create({
                url: `${popupURL}?${queryParams}`,
                type: 'popup',
                width: 360,
                height: 600,
                focused: true
            });

            // Store popup window ID
            state.pendingRequests.get(requestId).popupId = popup.id;

            console.log('[Verus Background] Popup created:', popup);
            
            // Return pending status
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

async function handleConnectionApproval(payload, sendResponse) {
    const { requestId } = payload;
    console.log('[Verus Background] Processing approval for request:', requestId);
    
    const request = state.pendingRequests.get(requestId);
    if (!request) {
        console.error('[Verus Background] Invalid request ID:', requestId);
        return sendResponse({ error: 'Invalid request' });
    }

    try {
        // Add to connected sites
        state.connectedSites.add(request.origin);
        
        // Save to storage
        await chrome.storage.local.set({ 
            connectedSites: Array.from(state.connectedSites) 
        });

        // Notify content script in the original tab
        if (request.tabId) {
            try {
                await chrome.tabs.sendMessage(request.tabId, {
                    type: 'CONNECT_APPROVED',
                    address: state.wallet.address
                });
            } catch (error) {
                console.error('[Verus Background] Failed to notify content script:', error);
            }
        }

        // Notify original requester
        request.sendResponse({ address: state.wallet.address });
        
        // Close popup window if it exists
        if (request.popupId) {
            try {
                await chrome.windows.remove(request.popupId);
            } catch (error) {
                console.error('[Verus Background] Failed to close popup:', error);
            }
        }

        // Clean up request
        state.pendingRequests.delete(requestId);
        
        sendResponse({ success: true });
    } catch (error) {
        console.error('[Verus Background] Approval error:', error);
        sendResponse({ error: error.message });
    }
}

async function handleConnectionRejection(payload, sendResponse) {
    const { requestId } = payload;
    console.log('[Verus Background] Processing rejection for request:', requestId);
    
    const request = state.pendingRequests.get(requestId);
    if (request) {
        // Notify content script in the original tab
        if (request.tabId) {
            try {
                await chrome.tabs.sendMessage(request.tabId, {
                    type: 'CONNECT_REJECTED',
                    error: 'Connection rejected by user'
                });
            } catch (error) {
                console.error('[Verus Background] Failed to notify content script:', error);
            }
        }

        // Close popup window if it exists
        if (request.popupId) {
            try {
                await chrome.windows.remove(request.popupId);
            } catch (error) {
                console.error('[Verus Background] Failed to close popup:', error);
            }
        }

        request.sendResponse({ error: 'Connection rejected by user' });
        state.pendingRequests.delete(requestId);
    }
    
    sendResponse({ success: true });
}

async function handleBalanceRequest(origin, address, sendResponse) {
    try {
        // Skip connection check if request is from our popup
        const isPopup = !origin || origin === chrome.runtime.getURL('');
        if (!isPopup && !state.connectedSites.has(origin)) {
            throw new Error('Site not connected');
        }

        if (!address) {
            throw new Error('No address provided');
        }

        // Get balance in VRSC instead of satoshis
        const balance = await getAddressBalance(address, true);
        sendResponse({ balance });
    } catch (error) {
        console.error('[Verus Background] Balance error:', error);
        sendResponse({ error: error.message });
    }
}

async function handleGetTransactionRequest(requestId, sendResponse) {
    try {
        if (!requestId) {
            throw new Error('No request ID provided');
        }

        const request = state.pendingRequests.get(requestId);
        if (!request) {
            throw new Error('Invalid request ID or request expired');
        }

        sendResponse({
            request: {
                payload: request.payload,
                origin: request.origin,
                timestamp: request.timestamp
            }
        });
    } catch (error) {
        console.error('[Verus Background] Get transaction request error:', error);
        sendResponse({ error: error.message });
    }
}

async function handleGetKnownAddresses(sendResponse) {
    try {
        // For now, we'll return an empty set since we don't have address history tracking yet
        // TODO: Implement address history tracking
        sendResponse({ addresses: [] });
    } catch (error) {
        console.error('[Verus Background] Get known addresses error:', error);
        sendResponse({ error: error.message });
    }
}

async function handleGetConnectedSites(sendResponse) {
    try {
        // Convert Set to Array for serialization
        const sites = Array.from(state.connectedSites);
        sendResponse({ sites });
    } catch (error) {
        console.error('[Verus Background] Get connected sites error:', error);
        sendResponse({ error: error.message });
    }
}

async function handleSendTransaction(origin, payload, sender, sendResponse) {
    try {
        console.log('[Verus Background] Processing send transaction request:', payload);

        // Check if site is connected
        if (!state.connectedSites.has(origin)) {
            throw new Error('Site not connected. Please connect first.');
        }

        // Validate payload
        if (!payload.from || !payload.to || !payload.amount) {
            throw new Error('Missing required transaction parameters');
        }

        // Generate request ID
        const requestId = Math.random().toString(36).substring(7);
        
        // Store request details
        state.pendingRequests.set(requestId, {
            origin,
            tabId: sender.tab.id,
            sendResponse,
            timestamp: Date.now(),
            type: 'transaction',
            payload
        });

        // Open transaction approval popup
        const popupURL = chrome.runtime.getURL('popup.html#/approve-transaction');
        const queryParams = new URLSearchParams({
            requestId,
            origin: encodeURIComponent(origin),
            action: 'transaction',
            fromAddress: payload.fromAddress || payload.from,
            toAddress: payload.toAddress || payload.to,
            amount: payload.amount,
            currency: payload.currency || 'VRSCTEST',
            memo: payload.memo || ''
        }).toString();

        const popup = await chrome.windows.create({
            url: `${popupURL}?${queryParams}`,
            type: 'popup',
            width: 360,
            height: 600,
            focused: true
        });

        // Store popup window ID
        state.pendingRequests.get(requestId).popupId = popup.id;

    } catch (error) {
        console.error('[Verus Background] Send transaction error:', error);
        sendResponse({ error: error.message });
    }
    return true;
}

async function handleTransactionApproval(payload, sendResponse) {
    try {
        const request = state.pendingRequests.get(payload.requestId);
        if (!request) {
            throw new Error('Invalid request ID');
        }

        const { from, to, amount, currency } = request.payload;
        
        // Get private key from wallet store
        const privateKey = await store.dispatch('wallet/getPrivateKey');
        if (!privateKey) {
            throw new Error('Private key not found for address');
        }
        
        // Execute the transaction using our utility function
        const result = await sendCurrency({
            fromAddress: from,
            toAddress: to,
            amount: parseFloat(amount),
            currency: currency || 'VRSCTEST',
            privateKey
        });
        
        // Store the transaction
        await store.dispatch('transactions/addTransaction', {
            txid: result.txid,
            from,
            to,
            amount: parseFloat(amount),
            currency: currency || 'VRSCTEST',
            timestamp: new Date().toISOString(),
            status: 'confirmed'
        });

        // Close the popup
        if (request.popupId) {
            await chrome.windows.remove(request.popupId);
        }

        // Send response back to the content script
        request.sendResponse({ txid: result.txid });
        
        // Clean up
        state.pendingRequests.delete(payload.requestId);

    } catch (error) {
        console.error('[Verus Background] Transaction approval error:', error);
        const request = state.pendingRequests.get(payload.requestId);
        if (request) {
            request.sendResponse({ error: error.message });
            if (request.popupId) {
                await chrome.windows.remove(request.popupId);
            }
            state.pendingRequests.delete(payload.requestId);
        }
    }
}

async function handleTransactionRejection(payload, sendResponse) {
    try {
        const request = state.pendingRequests.get(payload.requestId);
        if (!request) {
            throw new Error('Invalid request ID');
        }

        // Close the popup
        if (request.popupId) {
            await chrome.windows.remove(request.popupId);
        }

        // Send rejection response
        request.sendResponse({ error: 'Transaction rejected by user' });
        
        // Clean up
        state.pendingRequests.delete(payload.requestId);

    } catch (error) {
        console.error('[Verus Background] Transaction rejection error:', error);
    }
}

// Helper function to get private key for an address
async function getPrivateKeyForAddress(address) {
    try {
        // Get private key from wallet store
        const privateKey = await store.dispatch('wallet/getPrivateKey');
        if (!privateKey) {
            throw new Error('Private key not found for address');
        }
        return privateKey;
    } catch (error) {
        console.error('Error getting private key:', error);
        throw error;
    }
}

// Initialize when loaded
initializeState().catch(console.error);
