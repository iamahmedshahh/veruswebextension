import browser from 'webextension-polyfill';

console.log('[Verus] Content script loaded');

// Initialize message passing between page and background
browser.runtime.onConnect.addListener((port) => {
  console.log('[Verus] Connected to background script');
});

// Handle messages from the page
window.addEventListener('message', async (event) => {
  // Only accept messages from the same frame
  if (event.source !== window) return;
  
  console.log('[Verus] Received message from page:', event.data.type, event.data.params);
  
  if (event.data.type === 'VERUS_CONNECT_REQUEST') {
    try {
      // Forward the request to the background script
      const response = await browser.runtime.sendMessage({
        type: 'VERUS_CONNECT_REQUEST',
        params: event.data.params
      });
      
      console.log('[Verus] Background response:', response);
      
      // Send the response back to the page
      window.postMessage({
        type: 'VERUS_CONNECT_REQUEST_RESPONSE',
        error: response.error,
        result: response.result
      }, '*');
    } catch (error) {
      console.error('[Verus] Error:', error);
      window.postMessage({
        type: 'VERUS_CONNECT_REQUEST_RESPONSE',
        error: error.message
      }, '*');
    }
  }
});

// Initialize provider directly in the page context
const initProvider = async () => {
  try {
    // Create and inject the provider script elements
    const providerScript = document.createElement('script');
    providerScript.src = browser.runtime.getURL('provider.js');
    providerScript.type = 'module';
    
    const initScript = document.createElement('script');
    initScript.src = browser.runtime.getURL('initProvider.js');
    initScript.type = 'module';
    
    // Inject the scripts in sequence
    await new Promise((resolve) => {
      providerScript.onload = resolve;
      (document.head || document.documentElement).appendChild(providerScript);
    });
    
    await new Promise((resolve) => {
      initScript.onload = resolve;
      (document.head || document.documentElement).appendChild(initScript);
    });
    
    console.log('[Verus] Provider scripts injected successfully');
  } catch (error) {
    console.error('[Verus] Failed to inject provider scripts:', error);
  }
};

// Initialize provider when the page loads
initProvider();

// Re-inject provider when the page becomes visible
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    console.log('[Verus] Page became visible, re-injecting provider');
    initProvider();
  }
});
