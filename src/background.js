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
    const { type, origin } = message;
    
    switch (type) {
        case 'CONNECT_REQUEST':
            handleConnectRequest(origin, sender, sendResponse);
            break;
            
        case 'GET_BALANCE':
            handleGetBalance(origin, message.payload, sendResponse, sender);
            break;
            
        case 'APPROVE_CONNECTION':
            handleConnectionApproval(message.payload);
            break;
            
        case 'REJECT_CONNECTION':
            handleConnectionRejection(message.payload);
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

async function handleGetBalance(origin, payload, sendResponse, sender) {
    try {
        console.log('[Verus Background] Getting balance for:', payload);
        
        // Check if site is connected
        if (!state.connectedSites.has(origin)) {
            throw new Error('Site not connected. Please connect first.');
        }

        // Get wallet and balances from storage
        const { wallet, balances } = await chrome.storage.local.get(['wallet', 'balances']);
        if (!wallet?.address) {
            throw new Error('No wallet configured');
        }

        // Get balance from storage
        const balance = balances?.[payload.currency]?.[wallet.address] || '0';
        console.log('[Verus Background] Found balance:', balance, 'for currency:', payload.currency);

        // Send message to popup to refresh balances
        chrome.runtime.sendMessage({
            type: 'REFRESH_BALANCES',
            payload: { address: wallet.address, currency: payload.currency }
        }).catch(error => {
            // Ignore error if popup is not open
            console.log('[Verus Background] Popup not available for balance refresh');
        });

        // Notify content script about the balance
        if (sender?.tab?.id) {
            try {
                await chrome.tabs.sendMessage(sender.tab.id, {
                    type: 'VERUS_BALANCE_UPDATED',
                    currency: payload.currency,
                    balance: balance
                });
            } catch (error) {
                console.error('[Verus Background] Failed to notify content script:', error);
            }
        }

        sendResponse({ balance: balance.toString() });
    } catch (error) {
        console.error('[Verus Background] Get balance error:', error);
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

// Initialize when loaded
initializeState().catch(console.error);
