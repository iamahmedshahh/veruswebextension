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
    const data = await browser.storage.local.get(['wallet', 'hasWallet', 'connectedSites']);
    const sessionData = await browser.storage.session.get(['isLoggedIn']);
    
    // Update extension state
    extensionState.hasWallet = !!data.wallet;
    extensionState.isLoggedIn = !!sessionData.isLoggedIn;
    extensionState.isInitialized = true;
    
    if (data.connectedSites) {
      extensionState.connectedSites = new Map(JSON.parse(data.connectedSites));
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
  
  // Create connection request
  const requestId = Date.now().toString();
  const connectionRequest = {
    id: requestId,
    origin,
    type: 'CONNECT_REQUEST',
    timestamp: Date.now()
  };
  
  extensionState.pendingRequests.set(requestId, connectionRequest);
  
  // Open popup for approval
  await browser.windows.create({
    url: 'popup.html#/connect?' + new URLSearchParams({
      request: requestId,
      origin
    }).toString(),
    type: 'popup',
    width: 400,
    height: 600
  });
  
  // Wait for response
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      extensionState.pendingRequests.delete(requestId);
      reject(new Error('Connection request timeout'));
    }, 30000);
    
    extensionState.pendingRequests.set(requestId, {
      ...connectionRequest,
      resolve,
      reject,
      timeout
    });
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

// Handle response from popup
browser.runtime.onMessage.addListener(async (message, sender) => {
  if (message.type === 'CONNECT_RESPONSE' || message.type === 'SIGN_RESPONSE') {
    const origin = message.origin;
    const request = extensionState.pendingRequests.get(message.requestId);
    
    if (!request) {
      console.warn('No pending request found:', message.requestId);
      return;
    }
    
    clearTimeout(request.timeout);
    extensionState.pendingRequests.delete(message.requestId);
    
    if (message.approved) {
      if (message.type === 'CONNECT_RESPONSE') {
        extensionState.connectedSites.set(origin, {
          connected: Date.now()
        });
        
        // Save connected sites
        await browser.storage.local.set({
          connectedSites: JSON.stringify([...extensionState.connectedSites])
        });
      }
      
      request.resolve(message.data);
    } else {
      request.reject(new Error(message.error || 'Request rejected'));
    }
  }
});
