console.log('Background script loaded');

// Extension state
const state = {
    isConnected: false,
    pendingRequests: new Map(),
    connectedSites: new Set(),
    wallet: null,
    selectedCurrency: 'VRSCTEST',
    currencies: new Map(),
    network: null,
    mainCurrency: 'VRSCTEST'
};

// Constants
const DEFAULT_CURRENCY = 'VRSCTEST';
const RPC_URL = 'https://api.verustest.net';  // Default Verus testnet RPC port
const TESTNET_ONLY = true; // Force testnet mode

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
    try {
        const stored = await chrome.storage.local.get(['wallet', 'connectedSites', 'selectedCurrency']);
        
        if (stored.wallet) {
            state.wallet = stored.wallet;
        }
        if (stored.connectedSites) {
            state.connectedSites = new Set(stored.connectedSites);
        }
        if (stored.selectedCurrency) {
            state.selectedCurrency = stored.selectedCurrency;
        }

        // Force testnet mode
        state.network = { isTestnet: true };

        // Fetch initial currencies list
        const allCurrencies = await makeRPCCall('listcurrencies', []);
        if (allCurrencies) {
            const currenciesWithState = allCurrencies.map(currency => ({
                currencyid: currency.currencyid || currency.name,
                name: currency.name || currency.currencyid,
                selected: currency.currencyid === 'VRSCTEST',
                istoken: currency.istoken || false,
                issystemcurrency: currency.issystemcurrency || false,
                isconvertible: currency.isconvertible || false,
                initialsupply: currency.initialsupply || '0',
                supply: currency.supply || '0',
                reserves: currency.reserves || [],
                lastnotarization: currency.lastnotarization || null,
                currencypath: currency.currencypath || [],
                notarizationprotocol: currency.notarizationprotocol || null,
                conversions: currency.conversions || [],
                weights: currency.weights || [],
                options: currency.options || {}
            }));

            await chrome.storage.local.set({
                availableCurrencies: currenciesWithState
            });
        }
    } catch (error) {
        console.error('[Verus Background] Initialize state error:', error);
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
            
        case 'GET_CURRENCIES':
            handleGetCurrencies(message, sender, sendResponse);
            return true;
            
        case 'GET_BALANCE':
        case 'GET_CURRENCY_BALANCE':
            handleGetCurrencyBalanceRequest(message, sender, sendResponse);
            return true;
            
        case 'GET_ALL_BALANCES':
            handleGetAllBalancesRequest(message, sender, sendResponse);
            return true;
            
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
            
        case 'VERUS_GET_CURRENCIES_REQUEST':
            handleVerusGetCurrenciesRequest(message, sender, sendResponse);
            break;
            
        case 'GET_CURRENCIES':
            handleGetCurrencies(message, sender, sendResponse);
            return true;
            
        case 'GET_ALL_BALANCES':
            handleGetAllBalancesRequest(message, sender, sendResponse);
            return true;
            
        case 'VERUS_PRECONVERT_REQUEST':
            handleVerusPreconvertRequest(message, sender, sendResponse);
            break;
            
        case 'GET_PRECONVERT_REQUEST':
            handleGetPreconvertRequest(message, sender, sendResponse);
            break;
            
        case 'APPROVE_PRECONVERT':
            handlePreconvertApproval(message, sender, sendResponse);
            break;
            
        case 'REJECT_PRECONVERT':
            handlePreconvertRejection(message, sender, sendResponse);
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

async function handleGetCurrencyBalanceRequest(message, sender, sendResponse) {
    try {
        const { currency } = message.payload;
        if (!currency) {
            throw new Error('Currency not specified');
        }

        if (!state.wallet?.address) {
            throw new Error('Wallet not connected');
        }

        const balance = await handleGetCurrencyBalance(currency);
        console.log(`[Verus Background] Found balance: ${balance.balance} for currency: ${currency}`);
        sendResponse({ success: true, balance: balance.balance.toString() });
    } catch (error) {
        console.error('[Verus Background] Get balance error:', error);
        sendResponse({ success: false, error: error.message });
    }
}

async function handleGetAllBalancesRequest(message, sender, sendResponse) {
    try {
        let currencies = message.payload?.currencies;
        
        // If no currencies provided, get from storage
        if (!currencies) {
            const storage = await chrome.storage.local.get(['availableCurrencies']);
            currencies = Array.isArray(storage.availableCurrencies) 
                ? storage.availableCurrencies.filter(c => c && typeof c === 'object' && typeof c.currencyid === 'string')
                : [];
        }

        if (currencies.length === 0) {
            console.log('[Verus Background] No valid currencies found');
            sendResponse({ success: true, balances: {} });
            return true;
        }

        console.log('[Verus Background] Getting balances for currencies:', currencies);

        // Get balances for all currencies
        const balances = await handleGetAllBalances(currencies);

        // Update balances in storage
        await chrome.storage.local.set({ balances });

        console.log('[Verus Background] Updated all balances:', balances);
        sendResponse({ success: true, balances });
        return true;
    } catch (error) {
        console.error('[Verus Background] Error getting all balances:', error);
        sendResponse({ success: false, error: error.message });
        return true;
    }
}

async function handleGetCurrencyBalance(currencyId) {
    try {
        if (!state.wallet?.address) {
            throw new Error('Wallet not connected');
        }

        // Get balance info for specific currency
        const balanceResult = await makeRPCCall('getaddressbalance', [{
            addresses: [state.wallet.address],
            currencyid: currencyId
        }]);

        let totalBalance = 0;
        if (balanceResult && typeof balanceResult.balance === 'number') {
            totalBalance = balanceResult.balance / 100000000; // Convert from satoshis
        }

        console.log(`[Verus Background] Balance for ${currencyId}:`, totalBalance);
        return { success: true, balance: totalBalance.toString() };
    } catch (err) {
        console.error('[Verus Background] Error getting currency balance:', err);
        return { success: false, error: err.message };
    }
}

async function handleGetAllBalances(currencies) {
    try {
        console.log('[Verus Background] Getting balances for currencies:', currencies);
        if (!Array.isArray(currencies)) {
            throw new Error('Currencies must be an array');
        }

        const balances = {};
        
        // Get balance info for all currencies in parallel
        const balanceResults = await Promise.all(
            currencies.map(currency => 
                makeRPCCall('getaddressbalance', [{
                    addresses: [state.wallet.address],
                    currencyid: currency.currencyid
                }]).catch(err => {
                    console.warn(`[Verus Background] Failed to get balance for ${currency.currencyid}:`, err);
                    return null;
                })
            )
        );

        // Process balances
        currencies.forEach((currency, index) => {
            const balanceResult = balanceResults[index];
            if (balanceResult && typeof balanceResult.balance === 'number') {
                balances[currency.currencyid] = (balanceResult.balance / 100000000).toString();
            } else {
                balances[currency.currencyid] = '0';
            }
        });

        console.log('[Verus Background] All balances:', balances);
        return balances;
    } catch (err) {
        console.error('[Verus Background] Error getting all balances:', err);
        throw err;
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
        const result = await makeRPCCall('getaddressutxos', [{
            addresses: [address],
            currencynames: true
        }]);
        const balance = await handleGetCurrencyBalance(currency);

        console.log(`[Verus Background] Found balance: ${balance.balance} for currency: ${currency}`);

        // Send response directly through sendResponse
        sendResponse({ success: true, balance: balance.balance.toString() });
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
        
        const request = state.pendingRequests.get(requestId);
        if (!request) {
            throw new Error('Transaction request not found');
        }

        // Get the stored request data
        const data = await chrome.storage.local.get([`txRequest_${requestId}`]);
        const transaction = data[`txRequest_${requestId}`];
        console.log('[Verus Background] Found request data:', transaction);

        if (!transaction) {
            throw new Error('Transaction request not found');
        }

        // Notify any waiting popups
        const popupResponses = await chrome.storage.local.get(['popupResponses']);
        const responses = popupResponses.popupResponses || {};
        responses[transaction.popupId] = { approved: true };
        await chrome.storage.local.set({ popupResponses: responses });
        console.log('[Verus Background] Set popup response:', responses);

        // Send the transaction using sendtoaddress RPC method
        const txid = await makeRPCCall('sendtoaddress', [
            transaction.toAddress,
            parseFloat(transaction.amount),
            "", // comment
            "", // comment_to
            false, // subtract fee from amount
            false, // use instant send
            1, // conf target
            "UNSET", // address type
            false, // avoid reuse
            transaction.currency || DEFAULT_CURRENCY // currency
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
        await chrome.storage.local.set({ popupResponses });

        sendResponse({ success: true });
    } catch (error) {
        console.error('[Verus Background] Transaction rejection error:', error);
        sendResponse({ success: false, error: error.message });
    }
}

// Helper function to get network-specific storage key
function getNetworkStorageKey(key) {
    const network = state.network?.isTestnet ? 'testnet' : 'mainnet';
    return `${key}_${network}`;
}

// Save to chrome storage
async function saveToStorage(key, value) {
    const networkKey = getNetworkStorageKey(key);
    return chrome.storage.local.set({ [networkKey]: value });
}

// Get from chrome storage
async function getFromStorage(key) {
    const networkKey = getNetworkStorageKey(key);
    const result = await chrome.storage.local.get([networkKey]);
    return result[networkKey];
}

async function handleGetCurrencies(message, sender, sendResponse) {
    try {
        // Get the wallet address
        const address = state.wallet?.address;
        if (!address) {
            throw new Error('Wallet not connected');
        }

        console.log('[Verus Background] Getting currencies list');
        
        // Get currencies using RPC call
        const currencies = await makeRPCCall('listcurrencies', []);
        
        if (!Array.isArray(currencies)) {
            throw new Error('Invalid response from listcurrencies');
        }

        // Process and filter currencies
        const processedCurrencies = currencies
            .filter(currency => currency && currency.currencydefinition)
            .map(currency => {
                const def = currency.currencydefinition;
                return {
                    currencyid: def.currencyid,
                    name: def.name || def.currencyid,
                    fullyqualifiedname: def.fullyqualifiedname || def.name || def.currencyid,
                    balance: '0', // Initial balance
                    istoken: def.options === 40,
                    issystemcurrency: def.systemid === def.currencyid,
                    isconvertible: currency.bestcurrencystate?.currencies ? true : false,
                    initialsupply: def.initialsupply || '0',
                    supply: currency.bestcurrencystate?.supply || '0',
                    currencydefinition: def
                };
            });

        if (processedCurrencies.length === 0) {
            throw new Error('No valid currencies found');
        }

        // Save to storage
        await chrome.storage.local.set({ availableCurrencies: processedCurrencies });
        
        console.log('[Verus Background] Got currencies:', processedCurrencies);
        
        // Send response with currencies
        sendResponse({
            success: true,
            currencies: processedCurrencies
        });

        // Start fetching balances in the background
        handleGetAllBalances(processedCurrencies).then(balances => {
            chrome.storage.local.set({ balances });
            console.log('[Verus Background] Updated balances in background:', balances);
        }).catch(err => {
            console.error('[Verus Background] Error updating balances in background:', err);
        });

    } catch (error) {
        console.error('[Verus Background] Error getting currencies:', error);
        sendResponse({
            success: false,
            error: error.message
        });
    }
}

async function handleSelectCurrency(message, sender, sendResponse) {
    try {
        const { currency } = message.payload;
        if (!currency) {
            throw new Error('Currency not specified');
        }

        // Get current selected currencies
        const { selectedCurrencies = [] } = await chrome.storage.local.get(['selectedCurrencies']);
        
        // Add new currency if not already selected
        if (!selectedCurrencies.includes(currency)) {
            const updatedCurrencies = [...selectedCurrencies, currency];
            await chrome.storage.local.set({ selectedCurrencies: updatedCurrencies });
        }

        sendResponse({ success: true });
    } catch (error) {
        console.error('[Verus Background] Select currency error:', error);
        sendResponse({ success: false, error: error.message });
    }
}

async function handleUnselectCurrency(message, sender, sendResponse) {
    try {
        const { currency } = message.payload;
        if (!currency) {
            throw new Error('Currency not specified');
        }

        // Get current selected currencies and network
        const { selectedCurrencies = [], currentNetwork } = await chrome.storage.local.get(['selectedCurrencies', 'currentNetwork']);
        
        // Don't allow removing default currencies
        const defaultCurrencies = currentNetwork === 'MAINNET' 
            ? ['VRSC', 'BTC', 'ETH']
            : ['VRSCTEST'];
            
        if (defaultCurrencies.includes(currency)) {
            throw new Error('Cannot remove default currency');
        }

        // Remove currency
        const updatedCurrencies = selectedCurrencies.filter(c => c !== currency);
        await chrome.storage.local.set({ selectedCurrencies: updatedCurrencies });

        sendResponse({ success: true });
    } catch (error) {
        console.error('[Verus Background] Unselect currency error:', error);
        sendResponse({ success: false, error: error.message });
    }
}

// Create transaction approval popup
async function createTransactionApprovalPopup(transaction) {
    const popupURL = chrome.runtime.getURL(
        transaction.type === 'preconvert' 
            ? 'popup.html#/approve-preconvert'
            : 'popup.html#/approve-transaction'
    );

    const requestId = Date.now().toString();
    const queryParams = new URLSearchParams({
        requestId,
        origin: transaction.origin || ''
    }).toString();

    const popup = await chrome.windows.create({
        url: `${popupURL}?${queryParams}`,
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

async function handleVerusPreconvertRequest(message, sender, sendResponse) {
    try {
        const { fromAddress, fromCurrency, toCurrency, amount, memo } = message.payload;
        console.log('[Verus Background] Processing preconvert request:', { fromAddress, fromCurrency, toCurrency, amount });

        // Basic validation
        if (!fromAddress || !fromCurrency || !toCurrency || !amount) {
            throw new Error('Invalid parameters provided');
        }

        // Create preconvert approval popup
        const { id: popupId, requestId } = await createTransactionApprovalPopup({
            fromAddress,
            fromCurrency,
            toCurrency,
            amount,
            memo,
            type: 'preconvert',
            origin: message.origin
        });

        // Store preconvert data
        await chrome.storage.local.set({
            [`preconvertRequest_${requestId}`]: {
                fromAddress,
                fromCurrency,
                toCurrency,
                amount,
                memo,
                popupId,
                timestamp: Date.now()
            }
        });

        // Return immediately with requestId
        sendResponse({ success: true, requestId });
    } catch (error) {
        console.error('[Verus Background] Preconvert error:', error);
        sendResponse({ success: false, error: error.message });
    }
}

async function handleGetPreconvertRequest(message, sender, sendResponse) {
    try {
        const { requestId } = message;
        console.log('[Verus Background] Getting preconvert request:', requestId);

        // Get preconvert data from storage
        const data = await chrome.storage.local.get([`preconvertRequest_${requestId}`]);
        const transaction = data[`preconvertRequest_${requestId}`];

        if (!transaction) {
            throw new Error('Preconvert request not found');
        }

        sendResponse({ success: true, transaction });
    } catch (error) {
        console.error('[Verus Background] Get preconvert error:', error);
        sendResponse({ success: false, error: error.message });
    }
}

async function handlePreconvertApproval(message, sender, sendResponse) {
    try {
        const { requestId } = message.payload;
        console.log('[Verus Background] Handling preconvert approval:', requestId);

        // Get the stored request data
        const data = await chrome.storage.local.get([`preconvertRequest_${requestId}`]);
        const request = data[`preconvertRequest_${requestId}`];
        console.log('[Verus Background] Found request data:', request);

        if (!request) {
            throw new Error('Preconvert request not found');
        }

        // Execute the preconvert with via and convertto parameters
        const txid = await makeRPCCall('sendcurrency', [{
            from: request.fromAddress,
            amount: request.amount,
            currency: request.fromCurrency,
            via: request.via || 'SPORTS', // Use SPORTS as default basket
            convertto: request.toCurrency,
            memo: request.memo || ''
        }]);

        // Notify content script of success
        const tabs = await chrome.tabs.query({ url: request.origin + '/*' });
        for (const tab of tabs) {
            await sendMessageToContentScript(tab.id, {
                type: 'VERUS_PRECONVERT_APPROVED',
                txid
            });
        }

        // Cleanup stored request
        await chrome.storage.local.remove(`preconvertRequest_${requestId}`);
        
        sendResponse({ success: true, txid });
    } catch (error) {
        console.error('[Verus Background] Preconvert approval error:', error);
        sendResponse({ success: false, error: error.message });
    }
}

async function handlePreconvertRejection(message, sender, sendResponse) {
    try {
        const { requestId } = message.payload;
        console.log('[Verus Background] Handling preconvert rejection:', requestId);

        // Get request data
        const data = await chrome.storage.local.get([`preconvertRequest_${requestId}`]);
        const request = data[`preconvertRequest_${requestId}`];

        if (!request) {
            throw new Error('Preconvert request not found');
        }

        // Notify content script of rejection
        const tabs = await chrome.tabs.query({ url: request.origin + '/*' });
        for (const tab of tabs) {
            await sendMessageToContentScript(tab.id, {
                type: 'VERUS_PRECONVERT_REJECTED',
                error: 'User rejected preconvert request'
            });
        }

        // Cleanup stored request
        await chrome.storage.local.remove(`preconvertRequest_${requestId}`);
        
        sendResponse({ success: true });
    } catch (error) {
        console.error('[Verus Background] Preconvert rejection error:', error);
        sendResponse({ success: false, error: error.message });
    }
}

// Initialize when loaded
initializeState().catch(console.error);
