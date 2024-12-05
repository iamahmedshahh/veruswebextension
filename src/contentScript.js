import browser from 'webextension-polyfill';

console.log('[Verus] Content script loaded');

// Initialize provider directly in the page context
const initProvider = async () => {
  try {
    // Fetch provider code
    const providerUrl = browser.runtime.getURL('provider.js');
    const initUrl = browser.runtime.getURL('initProvider.js');
    
    const [providerResponse, initResponse] = await Promise.all([
      fetch(providerUrl),
      fetch(initUrl)
    ]);
    
    const [providerCode, initCode] = await Promise.all([
      providerResponse.text(),
      initResponse.text()
    ]);
    
    // Create and inject the provider script
    const script = document.createElement('script');
    script.textContent = `
      ${providerCode}
      ${initCode}
    `;
    (document.head || document.documentElement).appendChild(script);
    script.remove(); // Remove the script tag after execution
    
    console.log('[Verus] Provider scripts injected successfully');
  } catch (error) {
    console.error('[Verus] Failed to inject provider scripts:', error);
  }
};

// Initialize connection to background script
let port;
try {
  port = browser.runtime.connect({ name: 'content-script' });
  console.log('[Verus] Connected to background script');
  
  // Initialize provider after connecting to background
  initProvider();
} catch (error) {
  console.error('[Verus] Failed to connect to background script:', error);
}

// Create a promise resolver map for handling async responses
const promiseResolvers = new Map();
let messageId = 0;

// Send message to background script and wait for response
const sendMessage = async (type, data = {}) => {
  console.log('[Verus] Sending message to background:', type, data);
  const id = messageId++;
  
  const promise = new Promise((resolve, reject) => {
    promiseResolvers.set(id, { resolve, reject });
    setTimeout(() => {
      if (promiseResolvers.has(id)) {
        promiseResolvers.delete(id);
        reject(new Error('Request timeout'));
      }
    }, 30000);
  });
  
  port.postMessage({ id, type, ...data });
  return promise;
};

// Handle messages from the background script
port.onMessage.addListener((message) => {
  console.log('[Verus] Received message from background:', message);
  
  if (message.id !== undefined && promiseResolvers.has(message.id)) {
    const { resolve, reject } = promiseResolvers.get(message.id);
    promiseResolvers.delete(message.id);
    
    if (message.error) {
      reject(new Error(message.error));
    } else {
      resolve(message.result);
    }
  }
  
  // Forward message to page context
  window.postMessage({
    type: message.type,
    error: message.error,
    result: message.result
  }, '*');
});

// Listen for messages from page context
window.addEventListener('message', async (event) => {
  if (event.source !== window) return;
  
  const { type, params } = event.data;
  if (!type) return;
  
  console.log('[Verus] Received message from page:', type, params);
  
  try {
    const result = await sendMessage(type, { params });
    window.postMessage({
      type: `${type}_RESPONSE`,
      result
    }, '*');
  } catch (error) {
    window.postMessage({
      type: `${type}_RESPONSE`,
      error: error.message
    }, '*');
  }
});

// Re-inject on visibility change for SPA navigation
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    console.log('[Verus] Page became visible, re-injecting provider');
    initProvider();
  }
});
