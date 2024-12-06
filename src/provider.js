// Verus Web Wallet Provider Implementation
export class VerusProvider {
  constructor() {
    this.isVerusWallet = true;
    this.version = '1.0.0';
    this._isConnected = false;
    this._address = null;
    this._listeners = new Map();
    this._reconnectAttempts = 0;
    this._maxReconnectAttempts = 3;
    this._reconnectDelay = 1000; // 1 second
    this._connecting = null;

    // Bind methods
    this.connect = this.connect.bind(this);
    this.disconnect = this.disconnect.bind(this);
    this.getAccounts = this.getAccounts.bind(this);
    this.requestAccounts = this.requestAccounts.bind(this);
    this.isConnected = this.isConnected.bind(this);
    this.on = this.on.bind(this);
    this.off = this.off.bind(this);

    // Initialize connection state
    this._checkConnection();
  }

  async _checkConnection() {
    try {
      const accounts = await this.getAccounts();
      this._isConnected = accounts && accounts.length > 0;
      this._address = accounts?.[0] || null;
    } catch (error) {
      this._isConnected = false;
      this._address = null;
      console.error('[Verus] Connection check failed:', error);
    }
  }

  async connect() {
    console.log('connect called');
    
    // Return existing connection if already connected
    if (this._isConnected && this._address) {
      return Promise.resolve({ address: this._address });
    }
    
    // Return existing connection attempt if in progress
    if (this._connecting) {
      return this._connecting;
    }

    try {
      this._connecting = new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          cleanup();
          reject(new Error('Connection request timed out'));
        }, 300000); // 5 minutes timeout

        const handler = (event) => {
          if (event.source !== window) return;
          if (event.data.type === 'VERUS_CONNECT_REQUEST_RESPONSE') {
            cleanup();
            if (event.data.error) {
              reject(new Error(event.data.error));
            } else {
              this._isConnected = true;
              this._address = event.data.result.address;
              this._emitEvent('accountsChanged', [event.data.result.address]);
              this._emitEvent('connect', { address: event.data.result.address });
              resolve(event.data.result);
            }
          }
        };

        const cleanup = () => {
          clearTimeout(timeoutId);
          window.removeEventListener('message', handler);
        };

        window.addEventListener('message', handler);
        window.postMessage({ type: 'VERUS_CONNECT_REQUEST' }, '*');
      });

      const result = await this._connecting;
      return result;
    } catch (error) {
      // Handle extension context invalidation
      if (error.message.includes('Extension context invalidated')) {
        if (this._reconnectAttempts < this._maxReconnectAttempts) {
          this._reconnectAttempts++;
          await new Promise(resolve => setTimeout(resolve, this._reconnectDelay));
          return this.connect();
        }
      }

      this._isConnected = false;
      this._address = null;
      this._emitEvent('disconnect');
      throw error;
    } finally {
      this._connecting = null;
    }
  }

  async requestAccounts() {
    console.log('requestAccounts called');
    const result = await this.connect();
    if (result.error) {
      throw new Error(result.error);
    }
    return [result.address];
  }

  async disconnect() {
    console.log('disconnect called');
    if (!this._isConnected) {
      return Promise.resolve();
    }

    this._isConnected = false;
    this._address = null;
    this._emitEvent('accountsChanged', []);
    this._emitEvent('disconnect');
  }

  async getAccounts() {
    console.log('getAccounts called');
    if (!this._isConnected) {
      return Promise.resolve([]);
    }
    return Promise.resolve(this._address ? [this._address] : []);
  }

  isConnected() {
    return this._isConnected;
  }

  on(eventName, callback) {
    if (!this._listeners.has(eventName)) {
      this._listeners.set(eventName, new Set());
    }
    this._listeners.get(eventName).add(callback);
  }

  off(eventName, callback) {
    if (this._listeners.has(eventName)) {
      this._listeners.get(eventName).delete(callback);
    }
  }

  _emitEvent(eventName, data) {
    if (this._listeners.has(eventName)) {
      for (const callback of this._listeners.get(eventName)) {
        try {
          callback(data);
        } catch (error) {
          console.error(`[Verus] Error in ${eventName} event handler:`, error);
        }
      }
    }
  }
}

// Export the provider creation function
export function createVerusProvider() {
  return new VerusProvider();
}

// Create and expose the provider instance
window.verus = createVerusProvider();
