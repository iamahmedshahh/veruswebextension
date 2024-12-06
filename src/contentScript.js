import browser from 'webextension-polyfill';

console.log('[Verus] Content script loaded');

let isProviderInjected = false;

// Initialize provider directly in the page context
const initProvider = async () => {
  if (isProviderInjected) {
    console.log('[Verus] Provider already injected, skipping');
    return;
  }

  try {
    // Remove any existing scripts first
    const existingScripts = document.querySelectorAll('script[data-verus-provider]');
    existingScripts.forEach(script => script.remove());

    // Create and inject the provider script elements
    const providerScript = document.createElement('script');
    providerScript.src = browser.runtime.getURL('provider.js');
    providerScript.type = 'module';
    providerScript.dataset.verusProvider = 'true';
    
    const initScript = document.createElement('script');
    initScript.src = browser.runtime.getURL('initProvider.js');
    initScript.type = 'module';
    initScript.dataset.verusProvider = 'true';
    
    // Inject the scripts in sequence
    await new Promise((resolve) => {
      providerScript.onload = resolve;
      (document.head || document.documentElement).appendChild(providerScript);
    });
    
    await new Promise((resolve) => {
      initScript.onload = resolve;
      (document.head || document.documentElement).appendChild(initScript);
    });
    
    isProviderInjected = true;
    console.log('[Verus] Provider scripts injected successfully');
  } catch (error) {
    console.error('[Verus] Failed to inject provider scripts:', error);
    isProviderInjected = false;
  }
};

// Handle messages from the extension
browser.runtime.onMessage.addListener((message) => {
  if (message.type === 'DISCONNECT_SITE') {
    // Notify the page that it has been disconnected
    window.postMessage({
      type: 'VERUS_DISCONNECT',
      origin: message.origin
    }, '*');
  }
});

// Handle messages from the page
window.addEventListener('message', async (event) => {
  // Only accept messages from the same frame
  if (event.source !== window) return;
  
  console.log('[Verus] Received message from page:', event.data.type, event.data.params);
  
  if (event.data.type === 'VERUS_CONNECT_REQUEST') {
    try {
      // Check if extension context is valid
      if (!browser.runtime?.id) {
        throw new Error('Extension context invalidated');
      }

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
      
      // If extension context is invalid, try to reinject the provider
      if (error.message.includes('Extension context invalidated')) {
        isProviderInjected = false;
        await initProvider();
      }

      window.postMessage({
        type: 'VERUS_CONNECT_REQUEST_RESPONSE',
        error: error.message
      }, '*');
    }
  }
});

// Initialize provider when the page loads
initProvider();

// Re-inject provider when the page becomes visible
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && !isProviderInjected) {
    console.log('[Verus] Page became visible, checking provider');
    initProvider();
  }
});

// Handle extension reload/update
browser.runtime.onConnect.addListener((port) => {
  console.log('[Verus] Connected to background script');
  port.onDisconnect.addListener(() => {
    console.log('[Verus] Background disconnected, reinitializing provider');
    isProviderInjected = false;
    initProvider();
  });
});
