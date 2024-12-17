// Verus Web Wallet Provider Implementation
(() => {
  class VerusProvider {
    constructor() {
      this._connected = false;
      this._connecting = false;
      this._address = null;
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
        
        // Handle state changes first
        this._handleResponse(requestType, response);
        
        // Then handle pending requests
        const pendingRequest = this._pendingRequests.get(requestType);
        if (pendingRequest) {
          this._pendingRequests.delete(requestType);
          if (response.error) {
            pendingRequest.reject(new Error(response.error));
          } else if (response.result) {
            pendingRequest.resolve(response.result);
          } else if (response.status === 'WAITING') {
            // Don't resolve/reject for waiting status
            console.log('[Verus Provider] Waiting for approval:', response.message);
          }
        }
      });
    }

    _handleResponse(requestType, response) {
      console.log('[Verus Provider] Handling response:', requestType, response);
      
      if (requestType === 'VERUS_CONNECT_REQUEST') {
        if (response.error) {
          this._connecting = false;
          this._connected = false;
          this._address = null;
          this._emit('error', new Error(response.error));
          
          // Reject the connect promise if it exists
          if (this._connectPromise) {
            this._connectPromise.reject(new Error(response.error));
            this._connectPromise = null;
          }
        } else if (response.status === 'WAITING') {
          // Keep connecting state for waiting status
          this._connecting = true;
          this._emit('waiting', { message: response.message });
        } else if (response.connected && response.address) {
          this._connected = true;
          this._connecting = false;
          this._address = response.address;
          
          console.log('[Verus Provider] Connected with address:', this._address);
          
          // Emit events
          this._emit('connect', { address: this._address });
          this._emit('accountsChanged', [this._address]);
          
          // Resolve the connect promise if it exists
          if (this._connectPromise) {
            this._connectPromise.resolve({ address: this._address });
            this._connectPromise = null;
          }
        }
      } else if (requestType === 'VERUS_CHECK_CONNECTION') {
        if (response.error) {
          console.error('[Verus Provider] Error checking connection state:', response.error);
        } else if (response.connected && response.address) {
          this._connected = true;
          this._address = response.address;
          console.log('[Verus Provider] Already connected:', this._address);
          this._emit('connect', { address: this._address });
          this._emit('accountsChanged', [this._address]);
        }
      }
    }

    async _checkConnectionState() {
      try {
        // Request current connection state
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
      console.log('[Verus Provider] Getting accounts, connected:', this._connected);
      if (!this._connected) return [];
      if (this._address) return [this._address];
      
      try {
        return await new Promise((resolve, reject) => {
          this._pendingRequests.set('VERUS_GET_ACCOUNTS', { resolve, reject });
          window.postMessage({
            type: 'VERUS_GET_ACCOUNTS'
          }, '*');
        });
      } catch (error) {
        console.error('[Verus Provider] Error getting accounts:', error);
        return [];
      }
    }

    async connect() {
      console.log('[Verus Provider] Connect called');
      if (this._connected) {
        console.log('[Verus Provider] Already connected:', { address: this._address });
        return { address: this._address };
      }
      
      if (this._connecting) {
        console.log('[Verus Provider] Already connecting, waiting for existing promise...');
        if (this._connectPromise) {
          return new Promise((resolve, reject) => {
            this._connectPromise = { resolve, reject };
          });
        }
      }

      this._connecting = true;
      console.log('[Verus Provider] Initiating new connection...');
      
      try {
        return await new Promise((resolve, reject) => {
          this._connectPromise = { resolve, reject };
          this._pendingRequests.set('VERUS_CONNECT_REQUEST', { resolve, reject });
          
          window.postMessage({
            type: 'VERUS_CONNECT_REQUEST'
          }, '*');
        });
      } catch (error) {
        if (!error.message.includes('Awaiting connection approval')) {
          this._connecting = false;
          this._connected = false;
          this._address = null;
          this._connectPromise = null;
        }
        throw error;
      }
    }

    async getBalance(currency = 'VRSCTEST') {
      if (!this._connected) {
        throw new Error('Not connected');
      }

      return new Promise((resolve, reject) => {
        this._pendingRequests.set('VERUS_GET_BALANCE_REQUEST', { resolve, reject });
        window.postMessage({
          type: 'VERUS_GET_BALANCE_REQUEST',
          currency
        }, '*');
      });
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
