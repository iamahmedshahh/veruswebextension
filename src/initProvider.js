import { createVerusProvider } from './provider.js';

// Set the isVerusWalletInstalled flag
window.isVerusWalletInstalled = true;

// Create and expose the provider instance
window.verus = createVerusProvider();
