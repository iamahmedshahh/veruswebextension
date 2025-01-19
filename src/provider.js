// Verus Web Wallet Provider Implementation
class VerusProvider {
    constructor() {
      this._connected = false;
      this._address = null;
      this._eventListeners = new Map();
    }
    
    /**
     * Connect to wallet
     * @returns {Promise<{address: string}>}
     */
    async connect() {
      if (this._connected) {
        return { address: this._address };
      }
      
      return new Promise((resolve, reject) => {
        window.postMessage({ type: 'VERUS_CONNECT_REQUEST' }, '*');
        
        const handler = (event) => {
          if (event.source !== window) return;
          if (event.data.type === 'VERUS_CONNECT_RESPONSE') {
            window.removeEventListener('message', handler);
            
            if (event.data.error) {
              reject(new Error(event.data.error));
            } else {
              this._connected = true;
              this._address = event.data.result.address;
              resolve({ address: this._address });
            }
          }
        };
        
        window.addEventListener('message', handler);
      });
    }

    /**
     * Get connected accounts
     * @returns {Promise<string[]>}
     */
    async getAccounts() {
      if (!this._connected) {
        return [];
      }
      return [this._address];
    }

    /**
     * Check connection status
     * @returns {boolean}
     */
    isConnected() {
      return this._connected;
    }

    /**
     * Send transaction
     * @param {Object} params - Transaction parameters
     * @returns {Promise<string>} Transaction ID
     */
    async sendTransaction(params) {
      if (!this._connected) {
        throw new Error('Not connected');
      }

      return new Promise((resolve, reject) => {
        window.postMessage({
          type: 'VERUS_SEND_TRANSACTION',
          payload: {
            fromAddress: this._address,
            toAddress: params.to,
            amount: params.amount,
            currency: params.currency || 'VRSCTEST'
          }
        }, '*');

        const handler = (event) => {
          if (event.source !== window) return;
          if (event.data.type === 'VERUS_SEND_TRANSACTION_RESPONSE') {
            window.removeEventListener('message', handler);
            
            if (event.data.error) {
              reject(new Error(event.data.error));
            } else {
              resolve(event.data.result.txid);
            }
          }
        };
        
        window.addEventListener('message', handler);
      });
    }

    /**
     * Get balance
     * @param {string} [currency='VRSCTEST'] - Currency to check
     * @returns {Promise<string>}
     */
    async getBalance(currency = 'VRSCTEST') {
      if (!this._connected) {
        throw new Error('Not connected');
      }

      return new Promise((resolve, reject) => {
        window.postMessage({
          type: 'VERUS_GET_BALANCE',
          payload: {
            address: this._address,
            currency
          }
        }, '*');

        const handler = (event) => {
          if (event.source !== window) return;
          if (event.data.type === 'VERUS_GET_BALANCE_RESPONSE') {
            window.removeEventListener('message', handler);
            
            if (event.data.error) {
              reject(new Error(event.data.error));
            } else {
              resolve(event.data.result.balance);
            }
          }
        };
        
        window.addEventListener('message', handler);
      });
    }
}

// Create and expose the provider
const provider = new VerusProvider();
window.verus = provider;
window.verusWallet = provider;
