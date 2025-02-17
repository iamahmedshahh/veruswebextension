// Verus Web Wallet Provider Implementation
class VerusProvider {
    constructor() {
        this._connected = false;
        this._address = null;
    }
    
    /**
     * Connect to the Verus wallet
     * @returns {Promise<{address: string}>}
     */
    async connect() {
        if (this._connected && this._address) {
            return { address: this._address };
        }

        return new Promise((resolve, reject) => {
            const handleMessage = (event) => {
                if (event.source !== window) return;
                const { type, address, error } = event.data;

                if (type === 'CONNECT_APPROVED') {
                    window.removeEventListener('message', handleMessage);
                    if (address) {
                        this._connected = true;
                        this._address = address;
                        resolve({ address });
                    } else {
                        reject(new Error('No address received from wallet'));
                    }
                    return;
                }

                if (type === 'CONNECT_REJECTED') {
                    window.removeEventListener('message', handleMessage);
                    reject(new Error(error || 'Connection rejected by user'));
                    return;
                }
            };

            window.addEventListener('message', handleMessage);
            window.postMessage({ type: 'VERUS_CONNECT_REQUEST' }, '*');

            // Timeout after 5 minutes
            setTimeout(() => {
                window.removeEventListener('message', handleMessage);
                reject(new Error('Connection request timed out. Please try again.'));
            }, 5 * 60 * 1000);
        });
    }

    /**
     * Get connected accounts
     * @returns {Promise<string[]>}
     */
    async getAccounts() {
        if (!this._connected) {
            throw new Error('Not connected');
        }
        return [this._address];
    }

    /**
     * Check if connected to wallet
     * @returns {boolean}
     */
    isConnected() {
        return this._connected;
    }

    /**
     * Get balance for the connected address
     * @param {string} currency - Currency to get balance for
     * @returns {Promise<string>} Balance in smallest unit
     */
    async getBalance(currency) {
        if (!this._connected) {
            throw new Error('Not connected');
        }

        if (!currency) {
            throw new Error('Currency parameter is required');
        }

        return new Promise((resolve, reject) => {
            const handleMessage = (event) => {
                if (event.source !== window) return;
                const { type, balance, error } = event.data;

                if (type === 'VERUS_GET_BALANCE_RESPONSE') {
                    window.removeEventListener('message', handleMessage);
                    if (error) {
                        reject(new Error(error));
                    } else {
                        resolve(balance);
                    }
                }
            };

            window.addEventListener('message', handleMessage);
            window.postMessage({ 
                type: 'VERUS_GET_BALANCE_REQUEST',
                payload: { 
                    address: this._address,
                    currency 
                }
            }, '*');

            // Timeout after 30 seconds
            setTimeout(() => {
                window.removeEventListener('message', handleMessage);
                reject(new Error('Get balance request timed out'));
            }, 30000);
        });
    }
}

// Create and expose the provider
window.verus = new VerusProvider();
console.log('[Verus] Provider injected into window.verus');
