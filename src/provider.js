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
        if (response.error) {
          // Only reset state if it's not a "wallet locked" error
          // and not awaiting approval
          if (response.error !== 'Wallet is locked' && 
              response.status !== 'awaitingApproval') {
            this._connecting = false;
            this._connected = false;
            this._address = null;
            this._balances = {};
            this._emit('error', new Error(response.error));
          }
        } else if (response.status === 'awaitingApproval') {
          // Keep connecting state while waiting for approval
          this._connecting = true;
          this._emit('waiting', { message: 'Awaiting connection approval' });
        } else if (response.status === 'connected' || (response.result && response.result.connected)) {
          this._connected = true;
          this._connecting = false;
          this._address = response.address || response.result?.address;
          
          console.log('[Verus Provider] Connected with address:', this._address);
          
          // Emit events
          this._emit('connect', { address: this._address });
          this._emit('accountsChanged', [this._address]);
          
          // Fetch initial balances
          this._fetchBalances();
        } else if (response.status === 'rejected') {
          this._connecting = false;
          this._connected = false;
          this._address = null;
          this._balances = {};
          this._emit('error', new Error('Connection rejected by user'));
        }
      } else if (requestType === 'VERUS_CHECK_CONNECTION') {
        if (!response.error && response.connected) {
          this._connected = true;
          this._address = response.address;
          console.log('[Verus Provider] Already connected:', this._address);
          this._emit('connect', { address: this._address });
          this._emit('accountsChanged', [this._address]);
          
          // Fetch initial balances for existing connection
          this._fetchBalances();
        }
      } else if (requestType === 'VERUS_GET_BALANCES_REQUEST') {
        if (!response.error && response.result) {
          this._balances = response.result;
          this._emit('balancesChanged', this._balances);
        }
      } else if (requestType === 'VERUS_GET_TOTAL_BALANCE_REQUEST') {
        if (!response.error && response.result) {
          this._emit('totalBalanceChanged', response.result);
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
      console.log('[Verus Provider] Connect called');
      if (this._connected) {
        console.log('[Verus Provider] Already connected:', { address: this._address });
        return { address: this._address };
      }
      
      if (this._connecting) {
        console.log('[Verus Provider] Already connecting...');
        return this._connectPromise;
      }

      this._connecting = true;
      console.log('[Verus Provider] Initiating new connection...');
      
      // Generate unique request ID
      const requestId = Math.random().toString(36).substring(7);
      
      try {
        this._connectPromise = new Promise((resolve, reject) => {
          this._pendingRequests.set(requestId, { resolve, reject });
          window.postMessage({
            type: 'VERUS_CONNECT_REQUEST',
            requestId
          }, '*');
        });
        
        return await this._connectPromise;
      } catch (error) {
        // Only reset state if it's not waiting for approval
        if (!error.message.includes('Awaiting approval')) {
          this._connecting = false;
          this._connected = false;
          this._address = null;
        }
        throw error;
      } finally {
        this._connectPromise = null;
      }
    }

    async _fetchBalances() {
      try {
        window.postMessage({
          type: 'VERUS_GET_BALANCES_REQUEST'
        }, '*');
      } catch (error) {
        console.error('[Verus Provider] Error fetching balances:', error);
      }
    }

    async getAllBalances() {
      console.log('[Verus Provider] Getting all balances');
      const response = await this._sendMessage('VERUS_GET_BALANCES_REQUEST');
      return response;
    }

    async getTotalBalance() {
      console.log('[Verus Provider] Getting total balance');
      const response = await this._sendMessage('VERUS_GET_TOTAL_BALANCE_REQUEST');
      return response;
    }

    async _sendMessage(messageType) {
      try {
        const requestId = Math.random().toString(36).substring(7);
        const response = await new Promise((resolve, reject) => {
          const responseHandler = (event) => {
            if (event.source !== window) return;
            if (!event.data.type || !event.data.type.endsWith('_RESPONSE')) return;
            if (event.data.payload?.requestId !== requestId) return;
            
            window.removeEventListener('message', responseHandler);
            resolve(event.data.payload);
          };
          
          window.addEventListener('message', responseHandler);
          window.postMessage({
            type: messageType,
            requestId
          }, '*');
        });
        return response;
      } catch (error) {
        console.error('[Verus Provider] Error sending message:', error);
        throw error;
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
