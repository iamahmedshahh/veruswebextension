import browser from 'webextension-polyfill';

/**
 * Storage service that provides a unified interface for both extension storage and localStorage
 * Enhanced for better security handling of sensitive data
 */

// Keys that contain sensitive data and should never be stored in localStorage
const SENSITIVE_DATA_KEYS = [
  'wallet',
  'encryptedMnemonic',
  'encryptedPrivateKey',
  'sessionData',
  'privateKey',
  'mnemonic'
];

// Check if a key or object contains sensitive data
const containsSensitiveData = (key, data) => {
  // Check the key itself
  if (SENSITIVE_DATA_KEYS.some(sensitiveKey => 
    key === sensitiveKey || 
    key.includes(sensitiveKey)
  )) {
    return true;
  }
  
  // If data is an object, check its properties
  if (data && typeof data === 'object') {
    // Check first-level properties that might contain sensitive info
    return Object.keys(data).some(prop => 
      SENSITIVE_DATA_KEYS.includes(prop) ||
      prop.includes('private') ||
      prop.includes('secret') ||
      prop.includes('key') ||
      prop.includes('mnemonic') ||
      prop.includes('seed') ||
      prop.includes('password')
    );
  }
  
  return false;
};

const storage = {
  async get(keys) {
    try {
      if (typeof browser !== 'undefined' && browser.storage) {
        if (Array.isArray(keys)) {
          return await browser.storage.local.get(keys);
        } else {
          const result = await browser.storage.local.get(keys);
          return result[keys] ? { [keys]: result[keys] } : {};
        }
      } else {
        console.warn('Browser storage not available, using localStorage');
        const result = {};
        const keyArray = Array.isArray(keys) ? keys : [keys];
        
        // Handle each key individually
        keyArray.forEach(key => {
          // Skip sensitive data when using localStorage
          if (containsSensitiveData(key, null)) {
            console.warn(`Attempted to access sensitive data '${key}' from localStorage, returning empty value`);
            return;
          }
          
          const value = localStorage.getItem(key);
          if (value) {
            try {
              result[key] = JSON.parse(value);
            } catch {
              result[key] = value;
            }
          }
        });
        return result;
      }
    } catch (error) {
      console.warn('Storage get failed, using localStorage:', error);
      const result = {};
      const keyArray = Array.isArray(keys) ? keys : [keys];
      
      // Handle each key individually for fallback
      keyArray.forEach(key => {
        // Skip sensitive data in localStorage
        if (containsSensitiveData(key, null)) {
          console.warn(`Attempted to access sensitive data '${key}' from localStorage, returning empty value`);
          return;
        }
        
        const value = localStorage.getItem(key);
        if (value) {
          try {
            result[key] = JSON.parse(value);
          } catch {
            result[key] = value;
          }
        }
      });
      return result;
    }
  },

  async set(data) {
    try {
      if (typeof browser !== 'undefined' && browser.storage) {
        await browser.storage.local.set(data);
      } else {
        // Only allow non-sensitive data to be stored in localStorage
        Object.entries(data).forEach(([key, value]) => {
          if (containsSensitiveData(key, value)) {
            console.error(`Refusing to store sensitive data '${key}' in localStorage`);
            return;
          }
          localStorage.setItem(key, JSON.stringify(value));
        });
      }
    } catch (error) {
      console.warn('Storage set failed, using localStorage:', error);
      
      // Only allow non-sensitive data to be stored in localStorage for fallback
      Object.entries(data).forEach(([key, value]) => {
        if (containsSensitiveData(key, value)) {
          console.error(`Refusing to store sensitive data '${key}' in localStorage`);
          return;
        }
        localStorage.setItem(key, JSON.stringify(value));
      });
    }
  },

  async remove(keys) {
    try {
      if (typeof browser !== 'undefined' && browser.storage) {
        await browser.storage.local.remove(keys);
      } else {
        const keyArray = Array.isArray(keys) ? keys : [keys];
        keyArray.forEach(key => localStorage.removeItem(key));
      }
    } catch (error) {
      console.warn('Storage remove failed, using localStorage:', error);
      const keyArray = Array.isArray(keys) ? keys : [keys];
      keyArray.forEach(key => localStorage.removeItem(key));
    }
  },

  async clear() {
    try {
      if (typeof browser !== 'undefined' && browser.storage) {
        await browser.storage.local.clear();
      } else {
        // Only clear non-sensitive keys when using localStorage
        // This is to avoid a situation where we might want to keep some data
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (!containsSensitiveData(key, null)) {
            localStorage.removeItem(key);
          }
        }
      }
    } catch (error) {
      console.warn('Storage clear failed, using localStorage:', error);
      // Same safe approach for fallback
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!containsSensitiveData(key, null)) {
          localStorage.removeItem(key);
        }
      }
    }
  },

  // Add method to securely store sensitive data
  async setSecure(data) {
    if (typeof browser === 'undefined' || !browser.storage) {
      console.error('Browser storage not available, cannot securely store sensitive data');
      return false;
    }
    
    try {
      await browser.storage.local.set(data);
      return true;
    } catch (error) {
      console.error('Secure storage failed:', error);
      return false;
    }
  },

  session: {
    async get(keys) {
      try {
        if (typeof browser !== 'undefined' && browser.storage && browser.storage.session) {
          return await browser.storage.session.get(keys);
        }
        // Fallback to sessionStorage, but skip sensitive data
        const result = {};
        const keyArray = Array.isArray(keys) ? keys : [keys];
        keyArray.forEach(key => {
          // Skip sensitive data
          if (containsSensitiveData(key, null)) {
            console.warn(`Attempted to access sensitive data '${key}' from sessionStorage, returning empty value`);
            return;
          }
          
          const value = sessionStorage.getItem(key);
          if (value) {
            try {
              result[key] = JSON.parse(value);
            } catch {
              result[key] = value;
            }
          }
        });
        return result;
      } catch (error) {
        console.warn('Session storage get failed:', error);
        return {};
      }
    },

    async set(data) {
      try {
        if (typeof browser !== 'undefined' && browser.storage && browser.storage.session) {
          await browser.storage.session.set(data);
        } else {
          // Skip sensitive data for sessionStorage
          Object.entries(data).forEach(([key, value]) => {
            if (containsSensitiveData(key, value)) {
              console.error(`Refusing to store sensitive data '${key}' in sessionStorage`);
              return;
            }
            sessionStorage.setItem(key, JSON.stringify(value));
          });
        }
      } catch (error) {
        console.warn('Session storage set failed:', error);
      }
    },

    async remove(keys) {
      try {
        if (typeof browser !== 'undefined' && browser.storage && browser.storage.session) {
          await browser.storage.session.remove(keys);
        } else {
          const keyArray = Array.isArray(keys) ? keys : [keys];
          keyArray.forEach(key => sessionStorage.removeItem(key));
        }
      } catch (error) {
        console.warn('Session storage remove failed:', error);
      }
    },

    async clear() {
      try {
        if (typeof browser !== 'undefined' && browser.storage && browser.storage.session) {
          await browser.storage.session.clear();
        } else {
          sessionStorage.clear();
        }
      } catch (error) {
        console.warn('Session storage clear failed:', error);
      }
    }
  }
};

export default storage;
