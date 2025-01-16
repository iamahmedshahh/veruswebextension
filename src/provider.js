// Verus Web Wallet Provider Implementation
(() => {
  class VerusProvider {
    constructor() {
      this._connected = false;
      this._connecting = false;
      this._address = null;
      this._balances = {};
      this._eventListeners = new Map();
      this._pendingRequests = new Map();
      this._connectPromise = null;
      
      // Provider properties
      this.isVerusWalletInstalled = true;
      this.isVerusWallet = true;
      
      // Check if already connected
      this._checkConnectionState();
      
      // Listen for responses from content script
      window.addEventListener('message', (event) => {
        if (event.source !== window) return;
        if (!event.data.type || !event.data.type.endsWith('_RESPONSE')) return;
        
        console.log('[Verus Provider] Received response:', event.data);
        
        const requestType = event.data.type.replace('_RESPONSE', '');
        const response = event.data.payload || {};
        const requestId = response.requestId;
        
        // Handle state changes first
        this._handleResponse(requestType, response);
        
        // Then handle pending requests
        if (requestId) {
          const pendingRequest = this._pendingRequests.get(requestId);
          if (pendingRequest) {
            if (response.error) {
              pendingRequest.reject(new Error(response.error));
              this._pendingRequests.delete(requestId);
            } else if (response.status === 'connected') {
              pendingRequest.resolve({ address: response.address });
              this._pendingRequests.delete(requestId);
            } else if (response.status === 'awaitingApproval') {
              // Don't resolve/reject for waiting status
              console.log('[Verus Provider] Waiting for approval');
              this._emit('waiting', { message: 'Awaiting connection approval' });
            } else if (response.status === 'rejected') {
              pendingRequest.reject(new Error('Connection rejected by user'));
              this._pendingRequests.delete(requestId);
            } else if (response.result?.connected) {
              pendingRequest.resolve({ address: response.result.address });
              this._pendingRequests.delete(requestId);
            }
          }
        }
      });
    }

    _handleResponse(requestType, response) {
      console.log('[Verus Provider] Handling response:', requestType, response);
      
      if (requestType === 'VERUS_CONNECT_REQUEST') {
        if (!response) {
          this._connecting = false;
          this._connected = false;
          this._address = null;
          this._balances = {};
          window.postMessage({ type: 'VERUS_SET_CONNECTING', payload: { isConnecting: false } }, '*');
          this._emit('error', new Error('Connection failed'));
          return;
        }

        if (response.error) {
          this._connecting = false;
          this._connected = false;
          this._address = null;
          this._balances = {};
          window.postMessage({ type: 'VERUS_SET_CONNECTING', payload: { isConnecting: false } }, '*');
          this._emit('error', new Error(response.error));
          return;
        }

        if (response.result?.connected) {
          this._connected = true;
          this._connecting = false;
          this._address = response.result.address;
          
          console.log('[Verus Provider] Connected with address:', this._address);
          
          window.postMessage({ type: 'VERUS_SET_CONNECTING', payload: { isConnecting: false } }, '*');
          
          this._emit('connect', { address: this._address });
          this._emit('accountsChanged', [this._address]);
          
          this._fetchBalances();
        }
      } else if (requestType === 'VERUS_SEND_TRANSACTION_REQUEST') {
        const requestId = response.requestId;
        const pendingRequest = this._pendingRequests.get(requestId);
        
        if (pendingRequest) {
          if (response.error) {
            pendingRequest.reject(new Error(response.error));
          } else if (response.result?.txid) {
            pendingRequest.resolve({
              txid: response.result.txid,
              amount: response.result.amount,
              currency: response.result.currency
            });
          }
          this._pendingRequests.delete(requestId);
        }
      }

      // Handle pending request resolution
      if (response.requestId) {
        const pendingRequest = this._pendingRequests.get(response.requestId);
        if (pendingRequest) {
          if (response.error) {
            pendingRequest.reject(new Error(response.error));
          } else {
            pendingRequest.resolve(response);
          }
          this._pendingRequests.delete(response.requestId);
        }
      }
    }

    async _checkConnectionState() {
      try {
        window.postMessage({
          type: 'VERUS_CHECK_CONNECTION'
        }, '*');
      } catch (error) {
        console.error('[Verus Provider] Error checking connection state:', error);
      }
    }

    _emit(eventName, data) {
      console.log('[Verus Provider] Emitting event:', eventName, data);
      const listeners = this._eventListeners.get(eventName) || [];
      listeners.forEach(listener => {
        try {
          listener(data);
        } catch (error) {
          console.error(`Error in ${eventName} listener:`, error);
        }
      });
    }

    on(eventName, listener) {
      if (!this._eventListeners.has(eventName)) {
        this._eventListeners.set(eventName, []);
      }
      this._eventListeners.get(eventName).push(listener);
    }

    off(eventName, listener) {
      if (!this._eventListeners.has(eventName)) return;
      const listeners = this._eventListeners.get(eventName);
      const index = listeners.indexOf(listener);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    }

    isConnected() {
      return this._connected;
    }

    async getAccounts() {
      if (!this._connected) return [];
      return this._address ? [this._address] : [];
    }

    async connect() {
      if (this._connecting || this._connected) {
        return { address: this._address };
      }

      this._connecting = true;
      window.postMessage({ type: 'VERUS_SET_CONNECTING', payload: { isConnecting: true } }, '*');

      try {
        // Generate request ID
        const requestId = Math.random().toString(36).substring(7);
        
        return new Promise((resolve, reject) => {
          this._pendingRequests.set(requestId, { resolve, reject });
          
          // Send connection request
          window.postMessage({
            type: 'VERUS_CONNECT_REQUEST',
            payload: { requestId }
          }, '*');
        });
      } catch (error) {
        this._connecting = false;
        window.postMessage({ type: 'VERUS_SET_CONNECTING', payload: { isConnecting: false } }, '*');
        throw error;
      }
    }

    async _sendMessage(messageType, params = {}) {
      if (!this._connected && messageType !== 'VERUS_CHECK_CONNECTION') {
        throw new Error('Not connected');
      }

      try {
        const requestId = Math.random().toString(36).substring(7);
        
        return new Promise((resolve, reject) => {
          this._pendingRequests.set(requestId, { resolve, reject });
          
          window.postMessage({
            type: messageType,
            requestId,
            ...params
          }, '*');

          // Add timeout
          setTimeout(() => {
            const request = this._pendingRequests.get(requestId);
            if (request) {
              this._pendingRequests.delete(requestId);
              reject(new Error('Request timed out'));
            }
          }, 30000); // 30 second timeout
        });
      } catch (error) {
        console.error('[Verus Provider] Failed to send message:', error);
        throw error;
      }
    }

    async _fetchBalances() {
      try {
        const response = await this._sendMessage('VERUS_GET_BALANCES_REQUEST');
        if (response.balances) {
          this._balances = response.balances;
          this._emit('balancesChanged', this._balances);
        }
      } catch (error) {
        console.error('[Verus Provider] Failed to fetch balances:', error);
        this._emit('error', error);
      }
    }

    async getAllBalances() {
      try {
        const response = await this._sendMessage('VERUS_GET_BALANCES_REQUEST');
        if (response.balances) {
          this._balances = response.balances;
          this._emit('balancesChanged', this._balances);
        }
        return response;
      } catch (error) {
        console.error('[Verus Provider] Failed to get all balances:', error);
        throw error;
      }
    }

    async getTotalBalance() {
      try {
        const response = await this._sendMessage('VERUS_GET_TOTAL_BALANCE_REQUEST');
        if (response.balances) {
          this._balances = response.balances;
          this._emit('balancesChanged', this._balances);
        }
        return response;
      } catch (error) {
        console.error('[Verus Provider] Failed to get total balance:', error);
        throw error;
      }
    }

    async getBalance(currency = 'VRSCTEST') {
      console.log('[Verus Provider] Getting balance for:', currency);
      const response = await this._sendMessage('VERUS_GET_BALANCE_REQUEST', { currency });
      if (response.error) {
        throw new Error(response.error);
      }
      
      const balance = response.balance || response.result?.balance || '0';
      if (balance !== '0') {
        this._balances = { 
          ...this._balances, 
          [currency]: balance 
        };
        this._emit('balanceChanged', { currency, balance }); // Keep event format consistent
      }
      
      return {
        balance,
        requestId: response.requestId
      };
    }

    async sendTransaction(transactionParameters) {
      if (!this._connected) {
        throw new Error('Please connect to Verus Wallet first');
      }

      // Validate required parameters
      if (!transactionParameters || typeof transactionParameters !== 'object') {
        throw new Error('Transaction parameters are required');
      }

      const { toAddress, amount, currency = 'VRSCTEST' } = transactionParameters;

      if (!toAddress) {
        throw new Error('Recipient address is required');
      }

      if (typeof amount !== 'number' || amount <= 0) {
        throw new Error('Valid amount is required');
      }

      // Generate unique request ID
      const requestId = Math.random().toString(36).substring(7);

      // Create promise to handle async response
      const promise = new Promise((resolve, reject) => {
        this._pendingRequests.set(requestId, { resolve, reject });
      });

      // Send request to content script
      window.postMessage({
        type: 'VERUS_SEND_TRANSACTION_REQUEST',
        payload: {
          requestId,
          fromAddress: this._address,
          toAddress,
          amount,
          currency
        }
      }, '*');

      return promise;
    }

    async request(args) {
      if (!args || typeof args !== 'object') {
        throw new Error('Request args are required');
      }

      const { method, params } = args;

      switch (method) {
        case 'eth_requestAccounts':
          return this.connect();
        
        case 'eth_accounts':
          return this._address ? [this._address] : [];
        
        case 'eth_sendTransaction':
          if (!params || !Array.isArray(params) || params.length === 0) {
            throw new Error('Transaction parameters are required');
          }
          return this.sendTransaction(params[0]);
        
        default:
          throw new Error(`Method ${method} not supported`);
      }
    }
  }

  // Create and expose the provider
  const provider = new VerusProvider();
  window.verus = provider;
  window.verusWallet = provider;

  console.log('[Verus] Provider initialized:', {
    verus: !!window.verus,
    verusWallet: !!window.verusWallet,
    isVerusWalletInstalled: window.verus.isVerusWalletInstalled
  });
})();
