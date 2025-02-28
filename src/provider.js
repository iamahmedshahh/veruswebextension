// Verus Web Wallet Provider Implementation

// Constants
const DEFAULT_CURRENCY = 'VRSCTEST';

class VerusProvider {
    constructor() {
        this.isConnected = false;
        this.address = null;
        this.pendingRequests = new Map();

        // Listen for messages from content script
        window.addEventListener('message', this.handleMessage.bind(this));

        // Notify that provider is ready
        window.postMessage({ type: 'VERUS_PROVIDER_READY' }, '*');
    }

    async handleMessage(event) {
        if (event.source !== window) return;
        if (!event.data.type) return;

        const { type } = event.data;
        console.log('[Verus Provider] Received message:', type);

        switch (type) {
            case 'CONNECT_APPROVED':
                this.handleConnectApproved(event.data);
                break;
            case 'CONNECT_REJECTED':
                this.handleConnectRejected(event.data);
                break;
            case 'VERUS_GET_BALANCE_RESPONSE':
            case 'VERUS_GET_CURRENCY_BALANCE_RESPONSE':
                this.handleBalanceResponse(event.data);
                break;
            case 'VERUS_GET_ALL_BALANCES_RESPONSE':
                this.handleAllBalancesResponse(event.data);
                break;
            case 'VERUS_GET_CURRENCIES_RESPONSE':
                this.handleCurrenciesResponse(event.data);
                break;
            case 'VERUS_SELECT_CURRENCY_RESPONSE':
                this.handleSelectCurrencyResponse(event.data);
                break;
            case 'VERUS_TRANSACTION_APPROVED':
                this.handleTransactionApproved(event.data);
                break;
            case 'VERUS_TRANSACTION_REJECTED':
                this.handleTransactionRejected(event.data);
                break;
            case 'VERUS_PRECONVERT_RESPONSE':
                this.handlePreconvertResponse(event.data);
                break;
        }
    }

    handleConnectApproved(data) {
        this.isConnected = true;
        this.address = data.address;
        this.resolveRequest('connect', { address: data.address });
    }

    handleConnectRejected(data) {
        this.isConnected = false;
        this.address = null;
        this.rejectRequest('connect', new Error(data.error || 'Connection rejected'));
    }

    handleBalanceResponse(data) {
        if (!data.success || data.error) {
            this.rejectRequest('getBalance', new Error(data.error || 'Failed to get balance'));
        } else {
            this.resolveRequest('getBalance', data.balance);
        }
    }

    handleAllBalancesResponse(data) {
        if (!data.success || data.error) {
            this.rejectRequest('getAllBalances', new Error(data.error || 'Failed to get balances'));
        } else {
            this.resolveRequest('getAllBalances', data.balances);
        }
    }

    handleCurrenciesResponse(data) {
        console.log('[Verus Provider] Handling currencies response:', data);
        if (!data.success || data.error) {
            this.rejectRequest('getCurrencies', new Error(data.error || 'Failed to get currencies'));
            return;
        }
        
        if (!data.currencies || !Array.isArray(data.currencies)) {
            console.error('[Verus Provider] Invalid currencies data:', data);
            this.rejectRequest('getCurrencies', new Error('Invalid currency data received'));
            return;
        }

        // Log first currency for debugging
        if (data.currencies.length > 0) {
            console.log('[Verus Provider] First currency sample:', data.currencies[0]);
        }

        // Validate each currency object
        const validCurrencies = data.currencies.filter(currency => {
            const isValid = currency && 
                typeof currency === 'object' && 
                typeof currency.currencyid === 'string' && 
                typeof currency.name === 'string';
            
            if (!isValid) {
                console.warn('[Verus Provider] Invalid currency object:', currency);
            }
            return isValid;
        });

        if (validCurrencies.length === 0) {
            this.rejectRequest('getCurrencies', new Error('No valid currencies found'));
            return;
        }

        this.resolveRequest('getCurrencies', validCurrencies);
    }

    handleCurrencyBalanceResponse(data) {
        if (data.error) {
            this.rejectRequest('getCurrencyBalance', new Error(data.error));
        } else {
            this.resolveRequest('getCurrencyBalance', data.balance);
        }
    }

    handleSelectCurrencyResponse(data) {
        if (data.error) {
            this.rejectRequest('selectCurrency', new Error(data.error));
        } else {
            this.resolveRequest('selectCurrency', data);
        }
    }

    handleTransactionApproved(data) {
        this.resolveRequest('sendTransaction', data.txid);
    }

    handleTransactionRejected(data) {
        this.rejectRequest('sendTransaction', new Error(data.error || 'Transaction rejected'));
    }

    handlePreconvertResponse(data) {
        if (data.error) {
            this.rejectRequest('preconvertCurrency', new Error(data.error));
        } else {
            this.resolveRequest('preconvertCurrency', data.txid);
        }
    }

    resolveRequest(requestId, result) {
        const request = this.pendingRequests.get(requestId);
        if (request) {
            request.resolve(result);
            this.pendingRequests.delete(requestId);
        }
    }

    rejectRequest(requestId, error) {
        const request = this.pendingRequests.get(requestId);
        if (request) {
            request.reject(error);
            this.pendingRequests.delete(requestId);
        }
    }

    /**
     * Connect to Verus wallet
     * @returns {Promise<{address: string}>} Connected address
     */
    async connect() {
        if (this.isConnected) {
            return { address: this.address };
        }

        return this.sendRequest('connect', 'VERUS_CONNECT_REQUEST');
    }

    /**
     * Check if wallet is connected
     * @returns {boolean} True if connected
     */
    isConnected() {
        return this.isConnected;
    }

    /**
     * Get connected accounts
     * @returns {Promise<string[]>} Array of connected addresses
     */
    async getAccounts() {
        if (!this.isConnected) {
            throw new Error('Not connected');
        }
        return [this.address];
    }

    /**
     * Get balance for connected address
     * @param {string} [currency=VRSCTEST] - Currency to get balance for
     * @returns {Promise<string>} Balance in smallest unit
     */
    async getBalance(currency = DEFAULT_CURRENCY) {
        if (!this.isConnected) {
            throw new Error('Not connected');
        }

        return this.sendRequest('getBalance', 'VERUS_GET_BALANCE_REQUEST', { currency });
    }

    /**
     * Get all balances for connected address
     * @param {string[]} currencies - List of currencies to get balances for
     * @returns {Promise<Object>} Balances in smallest unit
     */
    async getAllBalances(currencies) {
        if (!this.isConnected) {
            throw new Error('Not connected');
        }

        return this.sendRequest('getAllBalances', 'VERUS_GET_ALL_BALANCES_REQUEST', { currencies });
    }

    /**
     * Get list of available currencies
     * @returns {Promise<Array>} List of available currencies
     */
    async getCurrencies() {
        return this.sendRequest('getCurrencies', 'VERUS_GET_CURRENCIES_REQUEST');
    }

    /**
     * Get balance for a specific currency
     * @param {string} currency Currency identifier
     * @returns {Promise<number>} Balance amount
     */
    async getCurrencyBalance(currency) {
        return this.sendRequest('getCurrencyBalance', 'VERUS_GET_CURRENCY_BALANCE_REQUEST', { currency });
    }

    /**
     * Select a currency
     * @param {string} currency Currency identifier
     * @returns {Promise<void>}
     */
    async selectCurrency(currency) {
        return this.sendRequest('selectCurrency', 'VERUS_SELECT_CURRENCY_REQUEST', { currency });
    }

    /**
     * Preconvert/swap between currencies using a basket currency
     * @param {Object} params - Conversion parameters
     * @param {string} params.fromCurrency - Source currency (e.g., VRSCTEST)
     * @param {string} params.toCurrency - Destination currency (e.g., SAILING)
     * @param {string|number} params.amount - Amount to convert
     * @param {string} [params.via='SPORTS'] - Basket currency to route through
     * @param {string} [params.memo] - Optional memo/note
     * @returns {Promise<string>} Transaction ID
     */
    async preconvertCurrency(params) {
        if (!this.isConnected) {
            throw new Error('Not connected');
        }

        if (!params.fromCurrency || !params.toCurrency || !params.amount) {
            throw new Error('Invalid parameters: fromCurrency, toCurrency and amount are required');
        }

        // Convert amount to number if string
        const amount = typeof params.amount === 'string' ? parseFloat(params.amount) : params.amount;
        if (isNaN(amount) || amount <= 0) {
            throw new Error('Invalid amount');
        }

        return this.sendRequest('preconvertCurrency', 'VERUS_PRECONVERT_REQUEST', {
            fromAddress: this.address,
            fromCurrency: params.fromCurrency,
            toCurrency: params.toCurrency,
            amount: params.amount.toString(),
            via: params.via || 'SPORTS', // Default to SPORTS basket
            memo: params.memo
        });
    }

    /**
     * Send transaction
     * @param {Object} params - Transaction parameters
     * @param {string} params.to - Recipient address
     * @param {string|number} params.amount - Amount to send
     * @param {string} [params.currency=VRSCTEST] - Currency to send
     * @param {string} [params.memo] - Optional memo/note
     * @returns {Promise<string>} Transaction ID
     */
    async sendTransaction(params) {
        if (!this.isConnected) {
            throw new Error('Not connected');
        }

        if (!params.to || !params.amount) {
            throw new Error('Invalid parameters: to and amount are required');
        }

        // Convert amount to number if string
        const amount = typeof params.amount === 'string' ? parseFloat(params.amount) : params.amount;
        if (isNaN(amount) || amount <= 0) {
            throw new Error('Invalid amount');
        }

        return this.sendRequest('sendTransaction', 'VERUS_SEND_TRANSACTION_REQUEST', {
            fromAddress: this.address,
            toAddress: params.to,
            amount: params.amount.toString(),
            currency: params.currency || DEFAULT_CURRENCY,
            memo: params.memo
        });
    }

    /**
     * Validate address
     * @param {string} address - Address to validate
     * @returns {Promise<boolean>} True if address is valid
     */
    async validateAddress(address) {
        if (!address) return false;
        
        // Basic validation for Verus addresses
        const isTransparent = address.startsWith('R');
        const isVerusId = address.startsWith('i');
        
        return isTransparent || isVerusId;
    }

    /**
     * Estimate transaction fee
     * @param {Object} params - Transaction parameters
     * @param {string|number} params.amount - Amount to send
     * @param {string} [params.currency=VRSCTEST] - Currency to send
     * @returns {Promise<string>} Estimated fee in smallest unit
     */
    async estimateFee(params) {
        if (!this.isConnected) {
            throw new Error('Not connected');
        }

        const amount = typeof params.amount === 'string' ? parseFloat(params.amount) : params.amount;
        if (isNaN(amount) || amount <= 0) {
            throw new Error('Invalid amount');
        }

        return this.sendRequest('estimateFee', 'VERUS_ESTIMATE_FEE_REQUEST', {
            fromAddress: this.address,
            amount: amount,
            currency: params.currency || DEFAULT_CURRENCY
        });
    }

    async sendRequest(requestId, type, payload = {}) {
        return new Promise((resolve, reject) => {
            this.pendingRequests.set(requestId, { resolve, reject });
            window.postMessage({ type, payload }, '*');
        });
    }
}

// Initialize provider
window.verus = new VerusProvider();
console.log('[Verus] Provider injected into window.verus');
