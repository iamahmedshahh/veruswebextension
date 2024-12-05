// Verus Web Wallet Provider Implementation
const createVerusProvider = () => ({
  isVerusWallet: true,
  version: '1.0.0',
  _isConnected: false,
  _address: null,
  _listeners: new Map(),
  _connecting: null,
  
  // Get current accounts
  getAccounts: function() {
    console.log('getAccounts called');
    if (this._isConnected && this._address) {
      return Promise.resolve([this._address]);
    }
    return Promise.resolve([]);
  },
  
  // Request account access
  requestAccounts: function() {
    console.log('requestAccounts called');
    return this.connect().then(result => {
      if (result.error) {
        throw new Error(result.error);
      }
      return [result.address];
    });
  },
  
  // Connect to the wallet
  connect: function() {
    console.log('connect called');
    
    // Return existing connection if already connected
    if (this._isConnected && this._address) {
      return Promise.resolve({ address: this._address });
    }
    
    // Return existing connection attempt if in progress
    if (this._connecting) {
      return this._connecting;
    }
    
    const that = this;
    this._connecting = new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        window.removeEventListener('message', handler);
        reject(new Error('Connection request timed out'));
      }, 30000); // 30 second timeout
      
      function handler(event) {
        if (event.source !== window) return;
        if (event.data.type === 'VERUS_CONNECT_REQUEST_RESPONSE') {
          clearTimeout(timeoutId);
          window.removeEventListener('message', handler);
          
          if (event.data.error) {
            that._connecting = null;
            reject(new Error(event.data.error));
          } else {
            that._isConnected = true;
            that._address = event.data.result.address;
            that._emitEvent('accountsChanged', [event.data.result.address]);
            that._emitEvent('connect', { address: event.data.result.address });
            resolve(event.data.result);
          }
        }
      }
      
      window.addEventListener('message', handler);
      window.postMessage({ type: 'VERUS_CONNECT_REQUEST' }, '*');
    }).finally(() => {
      this._connecting = null;
    });
    
    return this._connecting;
  },
  
  // Disconnect from the wallet
  disconnect: function() {
    if (!this._isConnected) {
      return Promise.resolve();
    }
    
    return new Promise((resolve) => {
      this._isConnected = false;
      this._address = null;
      this._emitEvent('accountsChanged', []);
      this._emitEvent('disconnect');
      resolve();
    });
  },
  
  // Event handling
  on: function(eventName, callback) {
    if (!this._listeners.has(eventName)) {
      this._listeners.set(eventName, new Set());
    }
    this._listeners.get(eventName).add(callback);
  },
  
  off: function(eventName, callback) {
    if (this._listeners.has(eventName)) {
      this._listeners.get(eventName).delete(callback);
    }
  },
  
  _emitEvent: function(eventName, data) {
    if (this._listeners.has(eventName)) {
      for (const callback of this._listeners.get(eventName)) {
        callback(data);
      }
    }
  }
});

// Export the provider creation function
export { createVerusProvider };

// Create and expose the provider instance
window.verus = createVerusProvider();
