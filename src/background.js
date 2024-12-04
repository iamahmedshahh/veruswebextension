import browser from 'webextension-polyfill';
import { testConnection } from './utils/verus-rpc';

console.log('Background script loaded');

// Keep track of the extension's state
const extensionState = {
  isConnected: false,
  lastConnection: null,
  isInitialized: false,
  hasWallet: false,
  isLoggedIn: false
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
    
    // Load wallet state
    const data = await browser.storage.local.get(['wallet', 'isLoggedIn', 'hasWallet']);
    
    // Update extension state
    extensionState.hasWallet = !!data.wallet;
    extensionState.isLoggedIn = !!data.isLoggedIn;
    extensionState.isInitialized = true;
    
    if (data.wallet) {
      // Preserve wallet and login state
      await browser.storage.local.set({ 
        wallet: data.wallet,
        hasWallet: true,
        isInitialized: true,
        isLoggedIn: !!data.isLoggedIn
      });
    }

    console.log('Extension state initialized:', extensionState);
    return { 
      success: true, 
      hasWallet: extensionState.hasWallet,
      isLoggedIn: extensionState.isLoggedIn
    };
  } catch (error) {
    console.error('Initialization error:', error);
    extensionState.isConnected = false;
    extensionState.isInitialized = false;
    throw error;
  }
}

// Handle messages from the popup
browser.runtime.onMessage.addListener(async (request, sender) => {
  console.log('Background script received message:', request);
  
  switch (request.type) {
    case 'INITIALIZE':
      return initializeState();
    case 'CHECK_SESSION':
      return {
        isActive: extensionState.isLoggedIn
      };
    case 'SET_LOGIN_STATE':
      extensionState.isLoggedIn = request.isLoggedIn;
      await browser.storage.local.set({ isLoggedIn: request.isLoggedIn });
      return { success: true };
    default:
      return { error: 'Unknown message type' };
  }
});

// Initialize state when extension starts
browser.runtime.onStartup.addListener(async () => {
  await initializeState();
});

// Handle window removal
browser.windows.onRemoved.addListener(async (windowId) => {
  const windows = await browser.windows.getAll();
  if (windows.length === 0) {
    // Preserve wallet and login state
    const data = await browser.storage.local.get(['wallet', 'isLoggedIn']);
    if (data.wallet) {
      await browser.storage.local.set({
        wallet: data.wallet,
        hasWallet: true,
        isInitialized: true,
        isLoggedIn: data.isLoggedIn // Preserve login state
      });
    }
  }
});

// Initialize on install
browser.runtime.onInstalled.addListener(async () => {
  await initializeState();
});
