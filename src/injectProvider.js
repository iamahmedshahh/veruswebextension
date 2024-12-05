// Initialize the Verus provider
(() => {
  console.log('[Verus] Starting provider initialization');
  
  // Check if already initialized
  if (window.verus) {
    console.log('[Verus] Provider already exists');
    return;
  }

  console.log('[Verus] Creating provider object');
  
  // Create the provider object
  const provider = {
    isVerusWallet: true,
    version: '1.0.0',
    _isConnected: false,
    _address: null,
    _listeners: new Map(),
    
    requestAccounts: async function() {
      console.log('[Verus] requestAccounts called');
      try {
        // Send connect request
        window.postMessage({ type: 'VERUS_CONNECT_REQUEST' }, '*');
        
        // Wait for response
        const response = await new Promise((resolve, reject) => {
          const handler = (event) => {
            if (event.source !== window) return;
            if (event.data.type === 'VERUS_CONNECT_RESPONSE') {
              window.removeEventListener('message', handler);
              if (event.data.error) {
                reject(new Error(event.data.error));
              } else {
                this._isConnected = true;
                this._address = event.data.result.address;
                resolve([event.data.result.address]);
                
                // Emit connected event
                this._emitEvent('connected', { address: this._address });
              }
            }
          };
          window.addEventListener('message', handler);
          
          // Add timeout
          setTimeout(() => {
            window.removeEventListener('message', handler);
            reject(new Error('Connection request timeout'));
          }, 30000);
        });
        
        return response;
      } catch (error) {
        console.error('[Verus] Connection failed:', error);
        throw error;
      }
    },
    
    getAccounts: async function() {
      console.log('[Verus] getAccounts called');
      if (!this._isConnected) return [];
      return [this._address];
    },
    
    isConnected: function() {
      return this._isConnected;
    },
    
    on: function(eventName, callback) {
      console.log('[Verus] Adding event listener:', eventName);
      if (!this._listeners.has(eventName)) {
        this._listeners.set(eventName, new Set());
      }
      this._listeners.get(eventName).add(callback);
    },
    
    removeListener: function(eventName, callback) {
      console.log('[Verus] Removing event listener:', eventName);
      if (this._listeners.has(eventName)) {
        this._listeners.get(eventName).delete(callback);
      }
    },
    
    _emitEvent: function(eventName, data) {
      console.log('[Verus] Emitting event:', eventName, data);
      if (this._listeners.has(eventName)) {
        this._listeners.get(eventName).forEach(callback => {
          try {
            callback(data);
          } catch (error) {
            console.error(`[Verus] Error in ${eventName} event handler:`, error);
          }
        });
      }
    }
  };

  console.log('[Verus] Setting up global objects');
  
  try {
    // Expose the provider globally
    Object.defineProperty(window, 'verus', {
      value: provider,
      writable: false,
      configurable: false
    });
    
    Object.defineProperty(window, 'isVerusWalletInstalled', {
      value: true,
      writable: false,
      configurable: false
    });
    
    console.log('[Verus] Provider initialized successfully');
    
    // Dispatch initialization event
    window.dispatchEvent(new Event('verus#initialized'));
  } catch (error) {
    console.error('[Verus] Failed to initialize provider:', error);
  }
})();
