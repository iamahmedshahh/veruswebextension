import { VerusProvider } from './provider.js';

// Set the isVerusWalletInstalled flag
window.isVerusWalletInstalled = true;

// Initialize the Verus provider
const initVerusProvider = () => {
  try {
    // Check if provider already exists
    if (window.verus) {
      console.log('[Verus] Provider already exists');
      return;
    }

    // Create provider instance
    window.verus = new VerusProvider();
    
    // Dispatch provider ready event
    window.dispatchEvent(new Event('verusReady'));
    
    console.log('[Verus] Provider initialized successfully');
  } catch (error) {
    console.error('[Verus] Failed to initialize provider:', error);
  }
};

// Initialize provider
initVerusProvider();

// Handle provider reinitialization
window.addEventListener('VERUS_REINIT', () => {
  console.log('[Verus] Reinitializing provider');
  initVerusProvider();
});
