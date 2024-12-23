import { ref, onMounted, onUnmounted } from 'vue';

export function useVerusWallet() {
    const address = ref(null);
    const isConnected = ref(false);
    const error = ref(null);
    const balances = ref({});
    const totalBalance = ref('0');
    const isConnecting = ref(false);
    const chainId = ref(null);
    let provider = null;

    // Initialize provider
    const initProvider = () => {
        provider = window.verus || window.verusWallet;
        if (!provider) {
            throw new Error('Verus Wallet extension not installed');
        }
        return provider;
    };

    // Check if wallet is installed
    const checkWalletInstalled = () => {
        try {
            return !!initProvider();
        } catch (err) {
            console.error('[Verus] Wallet not installed:', err);
            return false;
        }
    };

    // Event handlers
    const handleAccountsChanged = (accounts) => {
        console.log('[Verus] Accounts changed:', accounts);
        if (accounts && accounts.length > 0 && accounts[0]) {
            address.value = accounts[0];
            isConnected.value = true;
            getAllBalances().catch(console.error);
        } else {
            address.value = null;
            isConnected.value = false;
            balances.value = {};
        }
    };

    const handleConnect = (connectInfo) => {
        console.log('[Verus] Connected:', connectInfo);
        if (connectInfo?.address) {
            address.value = connectInfo.address;
            chainId.value = connectInfo.chainId;
            isConnected.value = true;
            getAllBalances().catch(console.error);
        }
    };

    const handleDisconnect = () => {
        console.log('[Verus] Disconnected');
        address.value = null;
        isConnected.value = false;
        chainId.value = null;
        balances.value = {};
    };

    const handleError = (err) => {
        console.error('[Verus] Provider error:', err);
        error.value = err.message;
    };

    const handleBalancesChanged = (newBalances) => {
        console.log('[Verus] Balances changed:', newBalances);
        if (newBalances && typeof newBalances === 'object') {
            // Filter out any undefined keys
            const cleanBalances = {};
            Object.entries(newBalances).forEach(([currency, amount]) => {
                if (currency && currency !== 'undefined') {
                    cleanBalances[currency] = amount;
                }
            });
            balances.value = cleanBalances;
        }
    };

    // Set up event listeners
    const setupEventListeners = (provider) => {
        provider.on('accountsChanged', handleAccountsChanged);
        provider.on('connect', handleConnect);
        provider.on('disconnect', handleDisconnect);
        provider.on('error', handleError);
        provider.on('balancesChanged', handleBalancesChanged);
    };

    // Remove event listeners
    const removeEventListeners = (provider) => {
        provider.off('accountsChanged', handleAccountsChanged);
        provider.off('connect', handleConnect);
        provider.off('disconnect', handleDisconnect);
        provider.off('error', handleError);
        provider.off('balancesChanged', handleBalancesChanged);
    };

    // Get all balances
    const getAllBalances = async () => {
        try {
            const provider = initProvider();
            if (!address.value) {
                throw new Error('Not connected. Please connect first.');
            }

            console.log('[Verus] Getting all balances');
            const result = await provider.getAllBalances();
            console.log('[Verus] Balances result:', result);
            
            if (result?.balances) {
                // Filter out any undefined keys
                const cleanBalances = {};
                Object.entries(result.balances).forEach(([currency, amount]) => {
                    if (currency && currency !== 'undefined') {
                        cleanBalances[currency] = amount;
                    }
                });
                balances.value = cleanBalances;
            }

            return balances.value;
        } catch (err) {
            console.error('[Verus] Failed to get balances:', err);
            error.value = err.message;
            throw err;
        }
    };

    // Get total balance
    const getTotalBalance = async () => {
        try {
            const provider = initProvider();
            if (!address.value) {
                throw new Error('Not connected. Please connect first.');
            }

            console.log('[Verus] Getting total balance');
            const result = await provider.getTotalBalance();
            console.log('[Verus] Total balance result:', result);
            
            if (result?.totalBalance) {
                totalBalance.value = result.totalBalance;
            }
            if (result?.balances) {
                // Filter out any undefined keys
                const cleanBalances = {};
                Object.entries(result.balances).forEach(([currency, amount]) => {
                    if (currency && currency !== 'undefined') {
                        cleanBalances[currency] = amount;
                    }
                });
                balances.value = cleanBalances;
            }
            return totalBalance.value;
        } catch (err) {
            console.error('[Verus] Failed to get total balance:', err);
            error.value = err.message;
            throw err;
        }
    };

    // Get balance for a specific currency
    const getBalance = async (currency = 'VRSCTEST') => {
        try {
            const provider = initProvider();
            if (!address.value) {
                throw new Error('Not connected. Please connect first.');
            }

            console.log('[Verus] Getting balance for currency:', currency);
            const result = await provider.getBalance(currency);
            console.log('[Verus] Balance result:', result);
            
            if (result?.balance) {
                balances.value = { 
                    ...balances.value, 
                    [currency]: result.balance 
                };
                return result.balance;
            }
            return '0';
        } catch (err) {
            console.error('[Verus] Failed to get balance:', err);
            error.value = err.message;
            throw err;
        }
    };

    // Connect to wallet
    const connectWallet = async () => {
        try {
            const provider = initProvider();
            console.log('[Verus] Checking wallet provider:', provider);
            
            if (!checkWalletInstalled()) {
                throw new Error('Verus Wallet extension not installed');
            }

            if (isConnecting.value) {
                console.log('[Verus] Already connecting, waiting...');
                return;
            }

            isConnecting.value = true;
            error.value = null;

            // Check if already connected
            if (provider.isConnected()) {
                const accounts = await provider.getAccounts();
                console.log('[Verus] Already connected accounts:', accounts);
                if (accounts && accounts.length > 0 && accounts[0]) {
                    address.value = accounts[0];
                    isConnected.value = true;
                    await getAllBalances();
                    return accounts[0];
                }
            }

            // Attempt connection
            console.log('[Verus] Initiating connection...');
            const result = await provider.connect();
            console.log('[Verus] Connection result:', result);
            
            if (result?.address) {
                address.value = result.address;
                chainId.value = result.chainId;
                isConnected.value = true;
                await getAllBalances();
                return result.address;
            } else {
                throw new Error('No address received after connection');
            }
        } catch (err) {
            console.error('[Verus] Connection error:', err);
            if (err.message.includes('Awaiting approval')) {
                error.value = 'Please approve the connection request in your wallet';
            } else if (err.message.includes('rejected')) {
                error.value = 'Connection rejected by user';
            } else {
                error.value = err.message;
            }
            throw err;
        } finally {
            isConnecting.value = false;
        }
    };

    // Disconnect wallet
    const disconnectWallet = async () => {
        try {
            const provider = initProvider();
            await provider.disconnect();
            address.value = null;
            isConnected.value = false;
            chainId.value = null;
            balances.value = {};
            error.value = null;
        } catch (err) {
            console.error('[Verus] Disconnect error:', err);
            error.value = err.message;
            throw err;
        }
    };

    // Lifecycle hooks
    onMounted(() => {
        try {
            const provider = initProvider();
            setupEventListeners(provider);
            
            // Check initial connection
            if (provider.isConnected()) {
                provider.getAccounts().then(accounts => {
                    if (accounts && accounts.length > 0 && accounts[0]) {
                        address.value = accounts[0];
                        isConnected.value = true;
                        getAllBalances().catch(console.error);
                    }
                }).catch(console.error);
            }
        } catch (err) {
            console.error('[Verus] Failed to initialize:', err);
        }
    });

    onUnmounted(() => {
        try {
            const provider = initProvider();
            removeEventListeners(provider);
        } catch (err) {
            console.error('[Verus] Failed to cleanup:', err);
        }
    });

    return {
        address,
        isConnected,
        isConnecting,
        error,
        balances,
        totalBalance,
        chainId,
        connectWallet,
        disconnectWallet,
        getAllBalances,
        getBalance,
        getTotalBalance,
        checkWalletInstalled
    };
}
