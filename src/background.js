import browser from 'webextension-polyfill';
import { testConnection } from './utils/verus-rpc';

console.log('Background script loaded');

// Keep track of the extension's state
const extensionState = {
  isConnected: false,
  lastConnection: null,
  isInitialized: false,
  hasWallet: false,
  isLoggedIn: false,
  connectedSites: new Map(),
  pendingRequests: new Map()
};

// Wallet state
let walletState = {
  isLocked: true,
  address: null
};

// Handle browser startup
browser.runtime.onStartup.addListener(async () => {
  console.log('Browser started, initializing...');
  await initializeState();
});

// Initialize when installed or updated
browser.runtime.onInstalled.addListener(async (details) => {
  console.log('Extension installed/updated:', details.reason);
  await initializeState();
});

// Initialize connection and state
async function initializeState() {
  try {
    console.log('Initializing extension state...');
    
    // Check connection
    const isConnected = await testConnection();
    extensionState.isConnected = isConnected;
    extensionState.lastConnection = Date.now();
    
    console.log('RPC connection status:', isConnected ? 'Connected' : 'Failed to connect');
    
    // Load wallet state and connected sites
    const data = await browser.storage.local.get(['wallet', 'hasWallet', 'connectedSites', 'walletState']);
    const sessionData = await browser.storage.session.get(['isLoggedIn']);
    
    // Update extension state
    extensionState.hasWallet = !!data.wallet;
    extensionState.isLoggedIn = !!sessionData.isLoggedIn;
    extensionState.isInitialized = true;
    
    if (data.connectedSites) {
      extensionState.connectedSites = new Map(JSON.parse(data.connectedSites));
    }
    
    if (data.walletState) {
      walletState = data.walletState;
    }
    
    console.log('Extension state initialized:', extensionState);
  } catch (error) {
    console.error('Failed to initialize extension state:', error);
  }
}

// Handle content script connection
browser.runtime.onConnect.addListener((port) => {
  console.log('New connection from content script:', port.name);
  
  port.onMessage.addListener(async (message) => {
    console.log('Received message from content script:', message);
    
    try {
      let response;
      
      switch (message.type) {
        case 'VERUS_CONNECT_REQUEST':
          response = await handleConnect(message, port.sender);
          break;
          
        case 'VERUS_GET_ACCOUNTS':
          response = await handleGetAccounts(port.sender);
          break;
          
        default:
          console.warn('Unknown message type:', message.type);
          return;
      }
      
      port.postMessage({
        id: message.id,
        result: response
      });
    } catch (error) {
      console.error('Error handling content script message:', error);
      port.postMessage({
        id: message.id,
        error: error.message
      });
    }
  });
  
  port.onDisconnect.addListener(() => {
    console.log('Content script disconnected:', port.name);
  });
});

// Handle connection request
async function handleConnect(request, sender) {
  const origin = sender.origin || sender.url;
  console.log('Processing connect request from:', origin);
  
  if (!extensionState.isInitialized) {
    throw new Error('Extension not initialized');
  }
  
  if (!extensionState.hasWallet) {
    throw new Error('No wallet configured');
  }
  
  if (!extensionState.isLoggedIn) {
    throw new Error('Wallet is locked');
  }
  
  return browser.runtime.sendMessage({
    type: 'VERUS_CONNECT_REQUEST'
  });
}

// Handle get accounts request
async function handleGetAccounts(sender) {
  const origin = sender.origin || sender.url;
  
  if (!extensionState.connectedSites.has(origin)) {
    return [];
  }
  
  const wallet = await browser.storage.local.get('wallet');
  return wallet.address ? [wallet.address] : [];
}

// Message handling
browser.runtime.onMessage.addListener((message, sender) => {
  console.log('[Verus Background] Received message:', message);
  
  if (message.type === 'VERUS_CONNECT_REQUEST') {
    if (walletState.isLocked) {
      // Create a popup to unlock the wallet
      return browser.windows.create({
        url: 'popup.html#/unlock',
        type: 'popup',
        width: 400,
        height: 600
      }).then((popup) => {
        // Return a promise that resolves when the wallet is unlocked
        return new Promise((resolve) => {
          const listener = (changes, namespace) => {
            if (namespace === 'local' && changes.walletState) {
              const newState = changes.walletState.newValue;
              if (!newState.isLocked) {
                browser.storage.onChanged.removeListener(listener);
                browser.windows.remove(popup.id);
                resolve({
                  result: {
                    address: newState.address
                  }
                });
              }
            }
          };
          
          browser.storage.onChanged.addListener(listener);
          
          // Also listen for popup close
          browser.windows.onRemoved.addListener(function closeListener(windowId) {
            if (windowId === popup.id) {
              browser.storage.onChanged.removeListener(listener);
              browser.windows.onRemoved.removeListener(closeListener);
              resolve({
                error: 'User cancelled'
              });
            }
          });
        });
      }).catch(error => {
        console.error('[Verus Background] Error creating popup:', error);
        return {
          error: error.message
        };
      });
    } else {
      return Promise.resolve({
        result: {
          address: walletState.address
        }
      });
    }
  }
  
  if (message.type === 'UNLOCK_WALLET') {
    try {
      // Here you would normally verify the password
      // For now, we'll just simulate unlocking
      walletState = {
        isLocked: false,
        address: 'RTest1234567890'
      };
      
      // Save state
      return browser.storage.local.set({ walletState }).then(() => ({
        result: {
          success: true
        }
      }));
    } catch (error) {
      console.error('[Verus Background] Error unlocking wallet:', error);
      return Promise.resolve({
        error: error.message
      });
    }
  }
  
  // Return true to indicate we'll respond asynchronously
  return true;
});

// Initialize wallet state from storage
browser.storage.local.get('walletState').then((result) => {
  if (result.walletState) {
    walletState = result.walletState;
  }
});
