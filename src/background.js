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
  address: null,
  network: 'testnet'
};

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
      walletState = {
        ...data.walletState,
        network: 'testnet'  // Ensure we're on testnet
      };
    }

    // Load the wallet data if available
    if (data.wallet) {
      walletState.address = data.wallet.address;
    }
    
    console.log('Extension state initialized:', extensionState);
  } catch (error) {
    console.error('Failed to initialize extension state:', error);
    // Even if there's an error, mark as initialized to prevent blocking
    extensionState.isInitialized = true;
  }
}

// Initialize immediately when script loads
initializeState().catch(error => {
  console.error('Failed to initialize on load:', error);
  // Ensure we're initialized even on error
  extensionState.isInitialized = true;
});

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

// Create a promise resolver map for handling async responses
const promiseResolvers = new Map();
let requestId = 0;

// Message handling
browser.runtime.onMessage.addListener((message, sender) => {
  console.log('[Verus Background] Received message:', message);
  
  if (message.type === 'VERUS_CONNECT_REQUEST') {
    return (async () => {
      try {
        if (!extensionState.isInitialized) {
          console.log('Extension not initialized yet, initializing now...');
          await initializeState();
        }
        
        if (!extensionState.hasWallet) {
          return { error: 'No wallet configured' };
        }
        
        // Create a unique request ID
        const id = requestId++;
        
        // Create a promise that will resolve when the connection is approved/rejected
        const connectionPromise = new Promise((resolve, reject) => {
          const timeoutId = setTimeout(() => {
            promiseResolvers.delete(id);
            reject(new Error('Connection request timed out'));
          }, 300000); // 5 minute timeout
          
          promiseResolvers.set(id, {
            resolve: (result) => {
              clearTimeout(timeoutId);
              promiseResolvers.delete(id);
              resolve(result);
            },
            reject: (error) => {
              clearTimeout(timeoutId);
              promiseResolvers.delete(id);
              reject(error);
            }
          });
        });
        
        if (!extensionState.isLoggedIn) {
          // Open the unlock popup with the request ID
          await browser.windows.create({
            url: `popup.html#/unlock?id=${id}&origin=${encodeURIComponent(sender.tab.url)}`,
            type: 'popup',
            width: 400,
            height: 600
          });
        } else {
          // If already logged in, show connect approval directly
          await browser.windows.create({
            url: `popup.html#/connect?id=${id}&origin=${encodeURIComponent(sender.tab.url)}`,
            type: 'popup',
            width: 400,
            height: 600
          });
        }
        
        try {
          // Wait for the connection approval
          await connectionPromise;
          
          // Get the current wallet data
          const { wallet } = await browser.storage.local.get('wallet');
          if (!wallet || !wallet.address) {
            return { error: 'No wallet address available' };
          }
          
          // Store the connected site
          const origin = new URL(sender.tab.url).origin;
          const { connectedSites = [] } = await browser.storage.local.get('connectedSites');
          
          if (!connectedSites.some(site => site.origin === origin)) {
            const favicon = sender.tab.favIconUrl || null;
            const updatedSites = [...connectedSites, { 
              origin, 
              favicon,
              connectedAt: Date.now() 
            }];
            
            await browser.storage.local.set({ connectedSites: updatedSites });
          }
          
          return {
            result: {
              address: wallet.address,
              network: walletState.network
            }
          };
        } catch (error) {
          return { error: error.message };
        }
      } catch (error) {
        console.error('[Verus Background] Error:', error);
        return { error: error.message };
      }
    })();
  }
  
  if (message.type === 'CONNECT_RESPONSE') {
    const resolver = promiseResolvers.get(parseInt(message.id));
    if (resolver) {
      if (message.approved) {
        resolver.resolve();
      } else {
        resolver.reject(new Error('Connection rejected by user'));
      }
    }
    return true;
  }
  
  if (message.type === 'VERUS_GET_ACCOUNTS') {
    return (async () => {
      try {
        const origin = sender.origin || sender.url;
        if (!extensionState.connectedSites.has(origin)) {
          return { result: [] };
        }
        
        // Get the current wallet data
        const { wallet } = await browser.storage.local.get('wallet');
        if (!wallet || !wallet.address) {
          return { result: [] };
        }
        
        return {
          result: [wallet.address]
        };
      } catch (error) {
        console.error('[Verus Background] Error:', error);
        return { error: error.message };
      }
    })();
  }
  
  if (message.type === 'UNLOCK_RESULT') {
    const { id, success, error } = message;
    console.log('[Verus Background] Unlock result:', { id, success, error });
    
    const resolver = promiseResolvers.get(id);
    if (resolver) {
      if (success) {
        resolver.resolve();
      } else {
        resolver.reject(new Error(error || 'Unlock failed'));
      }
    }
    return true;
  }
  
  return false;
});
