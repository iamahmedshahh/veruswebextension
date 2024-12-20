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
    const { walletState: storedState, wallet } = await browser.storage.local.get(['walletState', 'wallet']);
    if (storedState) {
      walletState = storedState;
    }
    extensionState.hasWallet = !!wallet;

    // Load session state
    const { isLoggedIn } = await browser.storage.session.get('isLoggedIn');
    extensionState.isLoggedIn = !!isLoggedIn;

    // Load connected sites
    const { connectedSites = [] } = await browser.storage.local.get('connectedSites');
    connectedSites.forEach(site => {
      extensionState.connectedSites.set(site.origin, site);
    });

    console.log('State initialized:', {
      walletState,
      hasWallet: extensionState.hasWallet,
      isLoggedIn: extensionState.isLoggedIn,
      connectedSites: Array.from(extensionState.connectedSites.keys())
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
          // Check if wallet exists
          const { wallet } = await browser.storage.local.get('wallet');
          if (!wallet) {
            console.log('[Verus Background] No wallet configured');
            await browser.windows.create({
              url: 'popup.html#/setup',
              type: 'popup',
              width: 400,
              height: 600
            });
            return { 
              error: 'No wallet configured',
              requestId: message.requestId
            };
          }

          // Check if site is already connected
          if (extensionState.connectedSites.has(sender.origin)) {
            console.log('[Verus Background] Site already connected');
            return { 
              result: {
                connected: true,
                address: wallet.address,
                chainId: walletState.network
              },
              requestId: message.requestId
            };
          }

          // Check login state from session storage
          const { isLoggedIn } = await browser.storage.session.get('isLoggedIn');
          
          if (!isLoggedIn) {
            console.log('[Verus Background] Wallet is locked, showing unlock page');
            
            // Store the pending request
            extensionState.pendingRequests.set(message.requestId, {
              type: 'connect',
              origin: sender.origin,
              tabId: sender.tab.id,
              timestamp: Date.now()
            });
            
            // Open unlock page with the request ID
            await browser.windows.create({
              url: `popup.html#/unlock?requestId=${message.requestId}&origin=${encodeURIComponent(sender.origin)}`,
              type: 'popup',
              width: 400,
              height: 600
            });
            
            return { 
              status: 'awaitingApproval',
              requestId: message.requestId
            };
          }

          // If wallet is unlocked, show connection approval
          console.log('[Verus Background] Wallet is unlocked, showing approval page');
          
          // Store the pending request
          extensionState.pendingRequests.set(message.requestId, {
            type: 'connect',
            origin: sender.origin,
            tabId: sender.tab.id,
            timestamp: Date.now()
          });
          
          // Open approval page
          await browser.windows.create({
            url: `popup.html#/approve?requestId=${message.requestId}&origin=${encodeURIComponent(sender.origin)}`,
            type: 'popup',
            width: 400,
            height: 600
          });
          
          return { 
            status: 'awaitingApproval',
            requestId: message.requestId
          };
        } catch (error) {
          console.error('[Verus Background] Error handling connect request:', error);
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
            extensionState.connectedSites.set(pendingRequest.origin, {
              origin: pendingRequest.origin,
              lastConnected: Date.now(),
              address: wallet.address
            });
            
            // Save connected sites
            await browser.storage.local.set({
              connectedSites: Array.from(extensionState.connectedSites.values())
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
          const connectedSite = extensionState.connectedSites.get(origin);
          
          if (!connectedSite) {
            return { result: [] };
          }
          
          return {
            result: [connectedSite.address]
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
      case 'GET_BALANCES':
        try {
            const origin = new URL(sender.tab.url).origin;
            if (!extensionState.connectedSites.has(origin)) {
                throw new Error('Site not connected');
            }

            // Get balances from local storage
            const { balances } = await browser.storage.local.get('balances');
            return { balances: balances || {} };
        } catch (error) {
            console.error('[Verus Background] Error getting balances:', error);
            return { error: error.message };
        }
      case 'GET_TOTAL_BALANCE':
        try {
            const origin = new URL(sender.tab.url).origin;
            if (!extensionState.connectedSites.has(origin)) {
                throw new Error('Site not connected');
            }

            // Get balances from local storage
            const { balances } = await browser.storage.local.get('balances');
            if (!balances) {
                return { totalBalance: '0', balances: {} };
            }

            // Calculate total balance
            const total = Object.values(balances).reduce((sum, balance) => {
                const value = typeof balance === 'string' ? parseFloat(balance) : balance;
                return sum + (isNaN(value) ? 0 : value);
            }, 0);

            return { 
                totalBalance: total.toString(),
                balances: balances 
            };
        } catch (error) {
            console.error('[Verus Background] Error getting total balance:', error);
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
