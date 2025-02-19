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
                this.handleBalanceResponse(event.data);
                break;
            case 'VERUS_GET_CURRENCIES_RESPONSE':
                this.handleCurrenciesResponse(event.data);
                break;
            case 'VERUS_TRANSACTION_APPROVED':
                this.handleTransactionApproved(event.data);
                break;
            case 'VERUS_TRANSACTION_REJECTED':
                this.handleTransactionRejected(event.data);
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
        if (data.error) {
            this.rejectRequest('getBalance', new Error(data.error));
        } else {
            this.resolveRequest('getBalance', data.balance);
        }
    }

    handleCurrenciesResponse(data) {
        if (data.error) {
            this.rejectRequest('getCurrencies', new Error(data.error));
        } else {
            this.resolveRequest('getCurrencies', data.currencies);
        }
    }

    handleTransactionApproved(data) {
        this.resolveRequest('sendTransaction', data.txid);
    }

    handleTransactionRejected(data) {
        this.rejectRequest('sendTransaction', new Error(data.error || 'Transaction rejected'));
    }

    resolveRequest(type, result) {
        const request = this.pendingRequests.get(type);
        if (request) {
            request.resolve(result);
            this.pendingRequests.delete(type);
        }
    }

    rejectRequest(type, error) {
        const request = this.pendingRequests.get(type);
        if (request) {
            request.reject(error);
            this.pendingRequests.delete(type);
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

        return new Promise((resolve, reject) => {
            this.pendingRequests.set('connect', { resolve, reject });
            window.postMessage({ type: 'VERUS_CONNECT_REQUEST' }, '*');
        });
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

        return new Promise((resolve, reject) => {
            this.pendingRequests.set('getBalance', { resolve, reject });
            window.postMessage({
                type: 'VERUS_GET_BALANCE_REQUEST',
                payload: {
                    address: this.address,
                    currency: currency
                }
            }, '*');
        });
    }

    /**
     * Get list of supported currencies
     * @returns {Promise<Array<string>>} Array of supported currency symbols
     */
    async getCurrencies() {
        return new Promise((resolve, reject) => {
            this.pendingRequests.set('getCurrencies', { resolve, reject });
            window.postMessage({
                type: 'VERUS_GET_CURRENCIES_REQUEST'
            }, '*');
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

        return new Promise((resolve, reject) => {
            this.pendingRequests.set('sendTransaction', { resolve, reject });
            window.postMessage({
                type: 'VERUS_SEND_TRANSACTION_REQUEST',
                payload: {
                    fromAddress: this.address,
                    toAddress: params.to,
                    amount: params.amount.toString(),
                    currency: params.currency || DEFAULT_CURRENCY,
                    memo: params.memo
                }
            }, '*');
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

        return new Promise((resolve, reject) => {
            window.postMessage({
                type: 'VERUS_ESTIMATE_FEE_REQUEST',
                payload: {
                    fromAddress: this.address,
                    amount: amount,
                    currency: params.currency || DEFAULT_CURRENCY
                }
            }, '*');
        });
    }
}

// Initialize provider
window.verus = new VerusProvider();
console.log('[Verus] Provider injected into window.verus');
