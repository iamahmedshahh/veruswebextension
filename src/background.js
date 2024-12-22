import browser from 'webextension-polyfill';
import { testConnection, getRPCConnection } from './utils/verus-rpc';

console.log('Background script loaded');

// Keep track of the extension's state
const extensionState = {
  isConnected: false,
  lastConnection: null,
  isInitialized: false,
  hasWallet: false,
  isLoggedIn: false,
  connectedSites: new Set(),
  pendingRequests: new Map()
};

// Wallet state
let walletState = {
  isLocked: true,
  address: null,
  network: 'testnet'
};

// Handle browser close/unload
browser.runtime.onSuspend.addListener(async () => {
  console.log('Extension is being suspended, clearing sensitive data...');
  try {
    // Clear session storage
    await browser.storage.session.clear();
    
    // Clear sensitive data from local storage
    const hasWallet = await browser.storage.local.get('hasWallet');
    await browser.storage.local.clear();
    if (hasWallet) {
      await browser.storage.local.set({ hasWallet: true });
    }
    
    // Reset extension state
    extensionState.isLoggedIn = false;
    extensionState.connectedSites.clear();
    walletState.isLocked = true;
    walletState.address = null;
    
    console.log('Successfully cleared data on suspend');
  } catch (error) {
    console.error('Error clearing data on suspend:', error);
  }
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
    
    // Load wallet state
    const { walletState: storedState, wallet, lastLoginTime } = await browser.storage.local.get(['walletState', 'wallet', 'lastLoginTime']);
    
    // Check if login has expired (24 hours)
    const loginExpired = !lastLoginTime || (Date.now() - lastLoginTime) > 24 * 60 * 60 * 1000;
    
    if (loginExpired) {
      console.log('Login expired, clearing session...');
      // Clear session storage
      await browser.storage.session.clear();
      // Update local storage
      await browser.storage.local.remove(['isLoggedIn', 'walletState', 'lastLoginTime']);
      // Keep wallet info but mark as logged out
      if (wallet) {
        await browser.storage.local.set({ hasWallet: true });
      }
      extensionState.isLoggedIn = false;
      walletState.isLocked = true;
      return;
    }
    
    if (storedState) {
      walletState = storedState;
    }
    extensionState.hasWallet = !!wallet;

    // Load session state
    const { isLoggedIn } = await browser.storage.session.get('isLoggedIn');
    extensionState.isLoggedIn = !!isLoggedIn;

    // If not logged in, ensure wallet is locked
    if (!extensionState.isLoggedIn) {
      walletState.isLocked = true;
      await browser.storage.local.set({ walletState });
    }

    // Load connected sites
    const { connectedSites = [] } = await browser.storage.local.get('connectedSites');
    connectedSites.forEach(site => {
      extensionState.connectedSites.add(site.origin);
    });

    console.log('State initialized:', {
      walletState,
      hasWallet: extensionState.hasWallet,
      isLoggedIn: extensionState.isLoggedIn,
      connectedSites: Array.from(extensionState.connectedSites)
    });
  } catch (error) {
    console.error('Failed to initialize state:', error);
  } finally {
    extensionState.isInitialized = true;
  }
}

// Initialize immediately when script loads
initializeState().catch(error => {
  console.error('Failed to initialize on load:', error);
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
browser.runtime.onMessage.addListener(async (message, sender) => {
  console.log('[Verus Background] Received message:', message.type, message.requestId);
  
  try {
    switch (message.type) {
      case 'CONNECT_REQUEST':
        try {
          const origin = message.origin;
          if (!origin) {
            throw new Error('Origin not provided');
          }

          // Get current wallet data
          const { wallet } = await browser.storage.local.get('wallet');
          if (!wallet || !wallet.address) {
            return { 
              error: 'No wallet found',
              requestId: message.requestId 
            };
          }

          // Check if site is already connected
          if (extensionState.connectedSites.has(origin)) {
            return {
              result: {
                connected: true,
                address: wallet.address,
                chainId: 'testnet'
              },
              requestId: message.requestId
            };
          }

          // Add to connected sites
          extensionState.connectedSites.add(origin);
          
          // Set session state
          await browser.storage.session.set({ isLoggedIn: true });
          
          return {
            result: {
              connected: true,
              address: wallet.address,
              chainId: 'testnet'
            },
            requestId: message.requestId
          };
        } catch (error) {
          console.error('[Verus Background] Connection error:', error);
          return { 
            error: error.message,
            requestId: message.requestId 
          };
        }
      case 'CONNECT_RESPONSE':
        try {
          console.log('[Verus Background] Received CONNECT_RESPONSE:', message);
          
          const pendingRequest = extensionState.pendingRequests.get(message.requestId);
          if (!pendingRequest) {
            throw new Error('No pending request found');
          }

          // Get the current wallet data
          const { wallet } = await browser.storage.local.get('wallet');
          if (!wallet || !wallet.address) {
            throw new Error('No wallet found');
          }
          
          if (message.approved) {
            // Add to connected sites
            extensionState.connectedSites.add(pendingRequest.origin);
            
            // Save connected sites
            await browser.storage.local.set({
              connectedSites: Array.from(extensionState.connectedSites)
            });
            
            // Update wallet state
            walletState.address = wallet.address;
            
            // Notify content script
            await browser.tabs.sendMessage(pendingRequest.tabId, {
              type: 'CONNECT_RESULT',
              status: 'connected',
              address: wallet.address,
              chainId: walletState.network,
              requestId: message.requestId
            });
            
            extensionState.pendingRequests.delete(message.requestId);
            return { success: true };
          } else {
            // Notify content script of rejection
            await browser.tabs.sendMessage(pendingRequest.tabId, {
              type: 'CONNECT_RESULT',
              status: 'rejected',
              requestId: message.requestId
            });
            
            extensionState.pendingRequests.delete(message.requestId);
            return { error: 'Connection rejected' };
          }
        } catch (error) {
          console.error('[Verus Background] Error handling connect response:', error);
          return { error: error.message };
        }

      case 'UNLOCK_REQUEST':
        try {
          console.log('[Verus Background] Processing unlock request');
          
          // Get the stored wallet data
          const { wallet } = await browser.storage.local.get('wallet');
          if (!wallet) {
            throw new Error('No wallet found');
          }

          // Set session storage to indicate logged in state
          await browser.storage.session.set({ isLoggedIn: true });
          
          // Update wallet state
          walletState.isLocked = false;
          walletState.address = wallet.address;

          console.log('[Verus Background] Wallet unlocked successfully');
          return { success: true };
        } catch (error) {
          console.error('[Verus Background] Unlock error:', error);
          return { error: error.message };
        }
      case 'VERUS_GET_ACCOUNTS':
        try {
          const origin = sender.origin || sender.url;
          const connectedSite = extensionState.connectedSites.has(origin);
          
          if (!connectedSite) {
            return { result: [] };
          }
          
          return {
            result: [walletState.address]
          };
        } catch (error) {
          console.error('[Verus Background] Error:', error);
          return { error: error.message };
        }
      case 'UNLOCK_RESULT':
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
      case 'VERUS_GET_BALANCE_REQUEST':
        try {
          const origin = new URL(sender.tab.url).origin;
          if (!extensionState.connectedSites.has(origin)) {
            return { error: 'Site not connected' };
          }
          
          // Get the current wallet data
          const { wallet } = await browser.storage.local.get('wallet');
          if (!wallet || !wallet.address) {
            return { error: 'No wallet found' };
          }
          
          // Get the balance from RPC
          const { getAddressBalance } = await import('./utils/verus-rpc.js');
          const balance = await getAddressBalance(wallet.address);
          
          return {
            result: balance
          };
        } catch (error) {
          console.error('[Verus Background] Error getting balance:', error);
          return { error: error.message };
        }
      case 'GET_BALANCE_REQUEST':
        try {
          const origin = new URL(sender.tab.url).origin;
          if (!extensionState.connectedSites.has(origin)) {
            throw new Error('Site not connected');
          }

          const currency = message.currency || 'VRSCTEST';
          console.log('[Verus Background] Getting balance for:', currency);
          
          // TODO: Implement actual balance fetching
          // For now, return a mock balance
          return {
            result: {
              balance: '0.00000000',
              currency
            }
          };
        } catch (err) {
          console.error('[Verus Background] Error getting balance:', err);
          return { error: err.message };
        }
      case 'VERUS_GET_BALANCES_REQUEST':
        try {
            const { balances } = await browser.storage.local.get('balances');
            console.log('[Verus Background] Got balances from storage:', balances);
            
            // Filter out any undefined keys
            const cleanBalances = {};
            if (balances) {
              Object.entries(balances).forEach(([currency, amount]) => {
                if (currency && currency !== 'undefined') {
                  cleanBalances[currency] = amount;
                }
              });
            }
            
            return { 
                balances: cleanBalances || {},
                requestId: message.requestId 
            };
        } catch (error) {
            console.error('[Verus Background] Error getting balances:', error);
            return { 
                error: error.message,
                requestId: message.requestId 
            };
        }

      case 'VERUS_GET_TOTAL_BALANCE_REQUEST':
        try {
            const { balances } = await browser.storage.local.get('balances');
            console.log('[Verus Background] Got balances from storage:', balances);
            
            if (!balances) {
                return { 
                    totalBalance: '0',
                    balances: {},
                    requestId: message.requestId 
                };
            }

            // Filter out undefined keys and calculate total
            const cleanBalances = {};
            let total = 0;
            Object.entries(balances).forEach(([currency, amount]) => {
                if (currency && currency !== 'undefined') {
                    cleanBalances[currency] = amount;
                    total += parseFloat(amount) || 0;
                }
            });

            return { 
                totalBalance: total.toString(),
                balances: cleanBalances,
                requestId: message.requestId 
            };
        } catch (error) {
            console.error('[Verus Background] Error getting total balance:', error);
            return { 
                error: error.message,
                requestId: message.requestId 
            };
        }
      case 'VERUS_SET_CONNECTING':
        try {
          await browser.storage.local.set({ isConnecting: message.payload.isConnecting });
          return { success: true };
        } catch (error) {
          console.error('Error setting connecting state:', error);
          return { error: error.message };
        }
      default:
        return false;
    }
  } catch (error) {
    console.error('[Verus Background] Error:', error);
    return { error: error.message };
  }
});
