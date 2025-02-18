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
    const transactionStatus = ref(null);

    // Constants
    const DEFAULT_CURRENCY = 'VRSCTEST';

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
            const result = await window.verus.connect();
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
     * Get balance for connected address
     * @param {string} [currency=VRSCTEST] - Currency to get balance for
     * @returns {Promise<string>} Balance in smallest unit
     */
    const getBalance = async (currency) => {
        if (!isConnected.value) return null;

        try {
            const response = await window.verus.getBalance(currency);
            if (response !== null) {
                balances.value[currency] = response;
            }
            return response;
        } catch (err) {
            console.error(`Failed to get balance for ${currency}:`, err);
            error.value = err.message;
            return null;
        }
    };

    /**
     * Refresh balances for specified currencies
     * @param {string[]} [currencies=['VRSCTEST']] - Array of currency codes to refresh
     * @returns {Promise<void>}
     */
    const refreshBalances = debounce(async (currencies = [DEFAULT_CURRENCY]) => {
        if (!isConnected.value || !currencies?.length) return;

        try {
            const results = await Promise.all(
                currencies
                    .filter(currency => !refreshingCurrencies.has(currency))
                    .map(async (currency) => ({
                        currency,
                        balance: await getBalance(currency)
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
    }, 1000);

    /**
     * Send transaction
     * @param {Object} params - Transaction parameters
     * @param {string} params.to - Recipient address
     * @param {string|number} params.amount - Amount to send
     * @param {string} [params.currency=VRSCTEST] - Currency to send
     * @param {string} [params.memo] - Optional memo/note
     * @returns {Promise<string>} Transaction ID
     */
    const sendTransaction = async (params) => {
        if (!isConnected.value) {
            throw new Error('Not connected');
        }

        try {
            transactionStatus.value = 'pending';
            const result = await window.verus.sendTransaction({
                to: params.to,
                amount: params.amount.toString(),
                currency: params.currency || DEFAULT_CURRENCY,
                memo: params.memo
            });
            
            if (result.error) {
                throw new Error(result.error);
            }
            
            if (result.txid) {
                transactionStatus.value = 'success';
                return result.txid;
            }
            
            throw new Error('Transaction failed');
        } catch (err) {
            transactionStatus.value = 'error';
            error.value = err.message;
            throw err;
        }
    };

    /**
     * Estimate transaction fee
     * @param {Object} params - Transaction parameters
     * @param {string|number} params.amount - Amount to send
     * @param {string} [params.currency='VRSCTEST'] - Currency to send
     * @returns {Promise<string>} Estimated fee
     */
    const estimateFee = async (params) => {
        if (!isConnected.value) {
            throw new Error('Not connected');
        }

        try {
            return await window.verus.estimateFee(params);
        } catch (err) {
            error.value = err.message;
            throw err;
        }
    };

    /**
     * Validate address
     * @param {string} address - Address to validate
     * @returns {Promise<boolean>} True if address is valid
     */
    const validateAddress = async (address) => {
        try {
            return await window.verus.validateAddress(address);
        } catch (err) {
            console.error('Address validation error:', err);
            return false;
        }
    };

    // Setup and cleanup
    onMounted(() => {
        window.addEventListener('message', handleMessage);
        checkExtension();

        // Start auto-refresh interval
        const refreshInterval = setInterval(() => {
            if (isConnected.value) {
                refreshBalances([DEFAULT_CURRENCY]);
            }
        }, 10000); // 10 seconds

        // Clean up interval on unmount
        onUnmounted(() => {
            window.removeEventListener('message', handleMessage);
            clearInterval(refreshInterval);
        });
    });

    // Handle messages from content script
    const handleMessage = (event) => {
        if (event.source !== window) return;
        if (!event.data.type) return;

        switch (event.data.type) {
            case 'VERUS_PROVIDER_READY':
                checkExtension();
                break;
            case 'VERUS_BALANCE_UPDATED':
                if (event.data.currency && event.data.balance !== undefined) {
                    balances.value[event.data.currency] = event.data.balance;
                }
                break;
            case 'VERUS_TRANSACTION_APPROVED':
                transactionStatus.value = 'success';
                break;
            case 'VERUS_TRANSACTION_REJECTED':
                transactionStatus.value = 'error';
                error.value = event.data.error;
                break;
        }
    };

    return {
        // State
        address,
        balances,
        isConnected,
        isInstalled,
        isLoading,
        error,
        transactionStatus,

        // Methods
        connect,
        getBalance,
        sendTransaction
    };
}

export { 
    isVerusInstalled, 
    isVerusConnected, 
    getVerusAddress, 
    useVerusWallet 
};
