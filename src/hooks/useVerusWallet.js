/**
 * Example implementation of Verus Wallet integration for web applications
 * This file demonstrates how to connect to and interact with the Verus browser extension
 */

class VerusWalletIntegration {
    constructor() {
        this.provider = null;
        this.isInstalled = false;
        this.address = null;
        this.isConnected = false;
    }

    /**
     * Initialize the Verus wallet integration
     * This should be called when your app loads
     * @returns {Promise<boolean>} True if extension is installed
     */
    async initialize() {
        // Check if extension is installed
        if (typeof window.verus !== 'undefined') {
            this.provider = window.verus;
            this.isInstalled = true;
            
            // Check if already connected
            this.isConnected = this.provider.isConnected();
            if (this.isConnected) {
                const accounts = await this.provider.getAccounts();
                this.address = accounts[0];
            }
            
            return true;
        }
        return false;
    }

    /**
     * Connect to the Verus wallet
     * This will prompt the user to approve the connection
     * @returns {Promise<{address: string}>}
     * @throws {Error} If extension is not installed or user rejects connection
     */
    async connect() {
        if (!this.isInstalled) {
            throw new Error('Verus extension not installed');
        }

        try {
            const result = await this.provider.connect();
            this.isConnected = true;
            this.address = result.address;
            return result;
        } catch (error) {
            this.isConnected = false;
            this.address = null;
            throw error;
        }
    }

    /**
     * Get the connected account address
     * @returns {string|null} The connected address or null if not connected
     */
    getAddress() {
        return this.address;
    }

    /**
     * Check if connected to the wallet
     * @returns {boolean}
     */
    checkConnection() {
        return this.isConnected;
    }
}

// Usage example:
async function connectToVerusWallet() {
    try {
        // Create wallet integration instance
        const wallet = new VerusWalletIntegration();
        
        // Initialize and check if extension is installed
        const isInstalled = await wallet.initialize();
        if (!isInstalled) {
            console.error('Please install the Verus extension');
            return;
        }

        // Connect to wallet
        const { address } = await wallet.connect();
        console.log('Connected to Verus wallet:', address);

        // Check connection status
        const isConnected = wallet.checkConnection();
        console.log('Connection status:', isConnected);

        return wallet;
    } catch (error) {
        console.error('Failed to connect:', error.message);
    }
}

import { ref, onMounted, onUnmounted } from 'vue';

// Debounce helper
function debounce(fn, delay) {
    let timeoutId;
    return (...args) => {
        if (timeoutId) {
            clearTimeout(timeoutId);
        }
        timeoutId = setTimeout(() => {
            fn(...args);
            timeoutId = null;
        }, delay);
    };
}

/**
 * Check if the Verus extension is installed
 * @returns {boolean} True if the extension is installed
 */
export function isVerusInstalled() {
    return typeof window.verus !== 'undefined';
}

/**
 * Check if currently connected to Verus wallet
 * @returns {boolean} True if connected
 */
export function isVerusConnected() {
    return isVerusInstalled() && window.verus.isConnected();
}

/**
 * Get the current connected address
 * @returns {Promise<string|null>} The connected address or null if not connected
 */
export async function getVerusAddress() {
    if (!isVerusConnected()) return null;
    try {
        const accounts = await window.verus.getAccounts();
        return accounts[0] || null;
    } catch (error) {
        console.error('Failed to get Verus address:', error);
        return null;
    }
}

/**
 * Get balance for the connected address
 * @param {string} currency - Currency to get balance for (e.g., 'VRSCTEST', 'VRSC', etc.)
 * @returns {Promise<string|null>} Balance in smallest unit or null if not connected
 * @throws {Error} If currency parameter is not provided
 */
export async function getVerusBalance(currency) {
    if (!currency) {
        throw new Error('Currency parameter is required');
    }
    if (!isVerusConnected()) return null;
    try {
        return await window.verus.getBalance(currency);
    } catch (error) {
        console.error('Failed to get Verus balance:', error);
        return null;
    }
}

/**
 * Connect to Verus wallet
 * @returns {Promise<{address: string}>} Object containing the connected address
 * @throws {Error} If connection fails or extension is not installed
 */
export async function connectVerus() {
    if (!isVerusInstalled()) {
        throw new Error('Verus extension not installed');
    }
    return await window.verus.connect();
}

/**
 * Vue composable for Verus wallet integration
 * @returns {Object} Hook methods and state
 */
export function useVerusWallet() {
    const address = ref(null);
    const balances = ref({});
    const isConnected = ref(false);
    const isInstalled = ref(false);
    const isLoading = ref(false);
    const error = ref(null);
    const refreshingCurrencies = new Set();

    // Initialize state
    const checkExtension = async () => {
        isInstalled.value = isVerusInstalled();
        if (isVerusInstalled() && isVerusConnected()) {
            isConnected.value = true;
            address.value = await getVerusAddress();
        }
    };

    // Connect to wallet
    const connect = async () => {
        if (!isInstalled.value) {
            error.value = 'Verus extension not installed';
            return;
        }

        try {
            isLoading.value = true;
            error.value = null;
            const result = await connectVerus();
            isConnected.value = true;
            address.value = result.address;
        } catch (err) {
            error.value = err.message;
            isConnected.value = false;
            address.value = null;
            balances.value = {};
        } finally {
            isLoading.value = false;
        }
    };

    /**
     * Get balance for specific currency
     * @param {string} currency - Currency to get balance for
     * @returns {Promise<string|null>} Balance in smallest unit or null if not connected
     */
    const getBalance = async (currency) => {
        if (!currency) {
            throw new Error('Currency parameter is required');
        }
        if (!isConnected.value) return null;

        // Prevent duplicate requests
        if (refreshingCurrencies.has(currency)) {
            return balances.value[currency];
        }

        try {
            refreshingCurrencies.add(currency);
            const balance = await getVerusBalance(currency);
            if (balance !== null) {
                balances.value[currency] = balance;
            }
            return balance;
        } catch (err) {
            console.error(`Failed to get balance for ${currency}:`, err);
            return null;
        } finally {
            refreshingCurrencies.delete(currency);
        }
    };

    /**
     * Refresh balances for specified currencies
     * @param {string[]} currencies - Array of currency codes to refresh
     * @returns {Promise<void>}
     */
    const refreshBalances = debounce(async (currencies) => {
        if (!isConnected.value || !currencies?.length) return;

        try {
            const results = await Promise.all(
                currencies
                    .filter(currency => !refreshingCurrencies.has(currency))
                    .map(async (currency) => ({
                        currency,
                        balance: await getVerusBalance(currency)
                    }))
            );

            results.forEach(({ currency, balance }) => {
                if (balance !== null) {
                    balances.value[currency] = balance;
                }
            });
        } catch (err) {
            console.error('Failed to refresh balances:', err);
        }
    }, 1000); // Debounce for 1 second

    // Get current connection status
    const getConnectionStatus = () => {
        if (!isInstalled.value) return 'not_installed';
        if (isLoading.value) return 'connecting';
        if (isConnected.value) return 'connected';
        return 'disconnected';
    };

    // Handle provider ready event
    const handleProviderReady = () => {
        checkExtension();
    };

    // Handle messages from content script
    const handleMessage = (event) => {
        if (event.source !== window) return;
        if (!event.data.type) return;

        switch (event.data.type) {
            case 'VERUS_PROVIDER_READY':
                handleProviderReady();
                break;
            case 'VERUS_BALANCE_UPDATED':
                if (event.data.currency && event.data.balance !== undefined) {
                    balances.value[event.data.currency] = event.data.balance;
                }
                break;
            case 'REFRESH_BALANCES':
                if (event.data.payload?.currency) {
                    refreshBalances([event.data.payload.currency]);
                }
                break;
        }
    };

    // Setup and cleanup
    onMounted(() => {
        window.addEventListener('message', handleMessage);
        checkExtension();

        // Start auto-refresh interval
        const refreshInterval = setInterval(() => {
            if (isConnected.value) {
                refreshBalances(['VRSCTEST']);
            }
        }, 10000); // 10 seconds

        // Clean up interval on unmount
        onUnmounted(() => {
            window.removeEventListener('message', handleMessage);
            clearInterval(refreshInterval);
        });
    });

    return {
        // State
        address,
        balances,
        isConnected,
        isInstalled,
        isLoading,
        error,

        // Methods
        connect,
        getBalance,
        refreshBalances,
        getConnectionStatus
    };
}

// Example usage in Vue component:
/*
import { useVerusWallet } from '@/hooks/useVerusWallet';

export default {
    setup() {
        const {
            address,
            balances,
            isConnected,
            isInstalled,
            isLoading,
            error,
            connect,
            getBalance,
            refreshBalances,
            getConnectionStatus
        } = useVerusWallet();

        // Define currencies you want to track
        const currencies = ['VRSCTEST'];

        // Get initial balances
        onMounted(async () => {
            if (isConnected.value) {
                await refreshBalances(currencies);
            }
        });

        // Watch for connection changes
        watch(isConnected, async (connected) => {
            if (connected) {
                await refreshBalances(currencies);
            }
        });

        return {
            address,
            balances,
            isConnected,
            isInstalled,
            isLoading,
            error,
            connect,
            getBalance,
            refreshBalances,
            getConnectionStatus
        };
    }
};
*/

export { 
    isVerusInstalled, 
    isVerusConnected, 
    getVerusAddress, 
    getVerusBalance, 
    connectVerus, 
    useVerusWallet 
};
