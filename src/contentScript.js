import browser from 'webextension-polyfill';

console.log('Verus Wallet content script loaded');

// Initialize connection to background script
const port = browser.runtime.connect({ name: 'content-script' });

// Create a promise resolver map for handling async responses
const promiseResolvers = new Map();
let messageId = 0;

// Listen for messages from the background script
port.onMessage.addListener((message) => {
  console.log('Content script received message:', message);
  
  // Find and resolve the corresponding promise
  if (message.id && promiseResolvers.has(message.id)) {
    const { resolve, reject } = promiseResolvers.get(message.id);
    promiseResolvers.delete(message.id);
    
    if (message.error) {
      reject(new Error(message.error));
    } else {
      resolve(message.result);
    }
  }
  
  // Forward response to the page
  window.postMessage({
    type: `${message.type}_RESPONSE`,
    result: message.result,
    error: message.error
  }, '*');
});

// Inject the Verus provider into the page
const injectProvider = () => {
  const script = document.createElement('script');
  script.textContent = `
    window.verus = {
      isVerusWallet: true,
      version: '1.0.0',
      
      // Request account access
      requestAccounts: async () => {
        return new Promise((resolve, reject) => {
          window.addEventListener('message', function handler(event) {
            if (event.source !== window) return;
            if (event.data.type === 'VERUS_REQUEST_ACCOUNTS_RESPONSE') {
              window.removeEventListener('message', handler);
              if (event.data.error) {
                reject(new Error(event.data.error));
              } else {
                resolve(event.data.result);
              }
            }
          });
          window.postMessage({ type: 'VERUS_REQUEST_ACCOUNTS' }, '*');
        });
      },
      
      // Get connected account
      getAccount: async () => {
        return new Promise((resolve, reject) => {
          window.addEventListener('message', function handler(event) {
            if (event.source !== window) return;
            if (event.data.type === 'VERUS_GET_ACCOUNT_RESPONSE') {
              window.removeEventListener('message', handler);
              if (event.data.error) {
                reject(new Error(event.data.error));
              } else {
                resolve(event.data.result);
              }
            }
          });
          window.postMessage({ type: 'VERUS_GET_ACCOUNT' }, '*');
        });
      },
      
      // Send transaction
      sendTransaction: async (params) => {
        return new Promise((resolve, reject) => {
          window.addEventListener('message', function handler(event) {
            if (event.source !== window) return;
            if (event.data.type === 'VERUS_SEND_TRANSACTION_RESPONSE') {
              window.removeEventListener('message', handler);
              if (event.data.error) {
                reject(new Error(event.data.error));
              } else {
                resolve(event.data.result);
              }
            }
          });
          window.postMessage({ 
            type: 'VERUS_SEND_TRANSACTION',
            params
          }, '*');
        });
      }
    };
    
    console.log('Verus provider injected');
  `;
  
  document.documentElement.appendChild(script);
  script.remove();
};

// Listen for messages from the injected provider
window.addEventListener('message', (event) => {
  if (event.source !== window) return;
  
  const { type, params } = event.data;
  
  if (type && type.startsWith('VERUS_')) {
    // Create a unique message ID
    const id = messageId++;
    
    // Create a promise resolver
    const messagePromise = new Promise((resolve, reject) => {
      promiseResolvers.set(id, { resolve, reject });
      
      // Cleanup if no response is received
      setTimeout(() => {
        if (promiseResolvers.has(id)) {
          promiseResolvers.delete(id);
          reject(new Error('Request timeout'));
        }
      }, 30000); // 30 second timeout
    });
    
    // Send message to background script
    port.postMessage({ id, type, params });
  }
});

// Inject provider when the content script loads
injectProvider();
