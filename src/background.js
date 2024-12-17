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
browser.runtime.onMessage.addListener((message, sender) => {
  console.log('[Verus Background] Received message:', message, 'from sender:', sender);
  
  if (message.type === 'CONNECT_REQUEST') {
    return (async () => {
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
          return { error: 'No wallet configured' };
        }

        // Check if wallet is locked
        if (walletState.isLocked) {
          console.log('[Verus Background] Wallet is locked');
          await browser.windows.create({
            url: 'popup.html#/unlock',
            type: 'popup',
            width: 400,
            height: 600
          });
          return { error: 'Wallet is locked' };
        }

        // Check if site is already connected
        if (extensionState.connectedSites.has(sender.origin)) {
          console.log('[Verus Background] Site already connected');
          return { 
            result: {
              connected: true,
              address: walletState.address
            }
          };
        }

        // Generate unique request ID
        const requestId = Math.random().toString(36).substring(7);
        console.log('[Verus Background] Generated request ID:', requestId);
        
        // Store the pending request with tab info
        extensionState.pendingRequests.set(requestId, {
          origin: sender.origin,
          tabId: sender.tab.id,
          timestamp: Date.now()
        });
        console.log('[Verus Background] Stored pending request:', extensionState.pendingRequests.get(requestId));

        // Open connect approval window with request ID
        const popup = await browser.windows.create({
          url: `popup.html#/connect?origin=${encodeURIComponent(sender.origin)}&requestId=${requestId}`,
          type: 'popup',
          width: 400,
          height: 600
        });
        console.log('[Verus Background] Opened popup window:', popup);
        
        return { status: 'WAITING', message: 'Awaiting connection approval' };
      } catch (err) {
        console.error('[Verus Background] Error handling connect request:', err);
        return { error: err.message };
      }
    })();
  }

  // Handle connection approval from popup
  if (message.type === 'CONNECT_RESPONSE') {
    return (async () => {
      try {
        console.log('[Verus Background] Received CONNECT_RESPONSE:', message);
        
        // Extract requestId from sender URL if not provided in message
        let requestId = message.requestId;
        if (!requestId && sender.url) {
          const url = new URL(sender.url);
          const hashParams = new URLSearchParams(url.hash.replace('#/connect?', ''));
          requestId = hashParams.get('requestId');
          console.log('[Verus Background] Extracted requestId from URL hash:', requestId);
        }

        if (!requestId) {
          console.error('[Verus Background] No requestId found in message or URL');
          throw new Error('Invalid connection request: missing requestId');
        }

        const request = extensionState.pendingRequests.get(requestId);
        if (!request) {
          // Request might have been already handled
          console.log('[Verus Background] Request already handled for ID:', requestId);
          return { success: true };
        }

        console.log('[Verus Background] Found pending request:', request);

        // Clean up the pending request AFTER we handle it
        const approved = message.approved;
        if (!approved) {
          console.log('[Verus Background] Connection rejected');
          extensionState.pendingRequests.delete(requestId);
          // Notify content script of rejection
          await browser.tabs.sendMessage(request.tabId, {
            type: 'CONNECT_RESULT',
            error: 'Connection rejected'
          });
          
          // Close the popup
          if (sender.tab && sender.tab.windowId) {
            await browser.windows.remove(sender.tab.windowId);
          }
          
          return { success: false, error: 'Connection rejected' };
        }

        console.log('[Verus Background] Connection approved');
        // Add to connected sites
        extensionState.connectedSites.set(request.origin, {
          connectedAt: Date.now(),
          address: walletState.address
        });

        // Persist connection state
        await browser.storage.local.set({
          connectedSites: Array.from(extensionState.connectedSites.entries())
        });

        console.log('[Verus Background] Sending approval to tab:', request.tabId);
        // Notify content script of approval
        await browser.tabs.sendMessage(request.tabId, {
          type: 'CONNECT_RESULT',
          result: {
            connected: true,
            address: walletState.address
          }
        });

        // Clean up the request only after successful handling
        extensionState.pendingRequests.delete(requestId);
        
        // Close the popup
        if (sender.tab && sender.tab.windowId) {
          await browser.windows.remove(sender.tab.windowId);
        }

        return { success: true };
      } catch (err) {
        console.error('[Verus Background] Error handling connect response:', err);
        return { error: err.message };
      }
    })();
  }

  if (message.type === 'VERUS_GET_ACCOUNTS') {
    return (async () => {
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
  
  if (message.type === 'VERUS_GET_BALANCE_REQUEST') {
    return (async () => {
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
    })();
  }

  if (message.type === 'GET_BALANCE_REQUEST') {
    return (async () => {
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
    })();
  }
  
  return false;
});
