import { ref, onMounted } from 'vue';

export function useVerusWallet() {
    const address = ref(null);
    const isConnected = ref(false);
    const error = ref(null);
    const balance = ref(null);
    const isConnecting = ref(false);

    // Check if Verus wallet is installed
    const checkWalletInstalled = () => {
        return window.verus?.isVerusWalletInstalled === true || window.verus?.verusWallet === true;
    };

    // Get balance for a specific currency
    const getBalance = async (currency = 'VRSCTEST') => {
        try {
            if (!isConnected.value || !address.value) {
                throw new Error('Not connected. Please connect first.');
            }

            console.log('Getting balance for currency:', currency);
            const result = await window.verus.getBalance(currency);
            if (result?.balance) {
                balance.value = result.balance;
            }
            return result;
        } catch (err) {
            console.error('[Verus] Failed to get balance:', err);
            error.value = err.message;
            throw err;
        }
    };

    // Connect to wallet
    const connectWallet = async () => {
        try {
            console.log('[Verus] Checking wallet provider:', window.verus);
            if (!checkWalletInstalled()) {
                throw new Error('Verus Wallet extension not installed');
            }

            if (isConnecting.value) {
                console.log('[Verus] Already connecting, waiting...');
                return;
            }

            isConnecting.value = true;

            // Use connect() first as it handles the connection flow
            console.log('[Verus] Attempting to connect...');
            const connectResult = await window.verus.connect();
            console.log('[Verus] Connect result:', connectResult);

            if (!connectResult?.address) {
                throw new Error('Connection failed: No address returned');
            }

            address.value = connectResult.address;
            isConnected.value = true;
            error.value = null;
            
            try {
                await getBalance();
            } catch (balanceError) {
                console.error('Failed to get initial balance:', balanceError);
            }

            return connectResult.address;
        } catch (err) {
            error.value = err.message;
            isConnected.value = false;
            throw err;
        } finally {
            isConnecting.value = false;
        }
    };

    // Get current account
    const getAccount = async () => {
        try {
            if (!checkWalletInstalled()) {
                throw new Error('Verus Wallet extension not installed');
            }

            const accounts = await window.verus.getAccounts();
            if (!accounts || accounts.length === 0) {
                isConnected.value = false;
                address.value = null;
                throw new Error('No accounts found');
            }

            address.value = accounts[0];
            isConnected.value = window.verus.isConnected();
            return accounts[0];
        } catch (err) {
            error.value = err.message;
            isConnected.value = false;
            throw err;
        }
    };

    // Initialize wallet state
    const initWallet = async () => {
        if (!checkWalletInstalled()) return;

        try {
            const accounts = await window.verus.getAccounts();
            if (accounts && accounts.length > 0) {
                address.value = accounts[0];
                isConnected.value = window.verus.isConnected();
                if (isConnected.value) {
                    try {
                        await getBalance();
                    } catch (err) {
                        console.error('Failed to get initial balance:', err);
                    }
                }
            }
        } catch (err) {
            console.error('Failed to initialize wallet:', err);
            isConnected.value = false;
        }
    };

    // Listen for wallet events
    onMounted(() => {
        if (checkWalletInstalled()) {
            // Initialize wallet state
            initWallet();

            // Listen for account changes
            window.verus.on('accountsChanged', async (accounts) => {
                console.log('Accounts changed:', accounts);
                if (accounts && accounts.length > 0) {
                    address.value = accounts[0];
                    isConnected.value = window.verus.isConnected();
                    try {
                        await getBalance();
                    } catch (err) {
                        console.error('Failed to get balance after account change:', err);
                    }
                } else {
                    address.value = null;
                    isConnected.value = false;
                    balance.value = null;
                }
            });

            // Listen for disconnect events
            window.verus.on('disconnect', () => {
                console.log('Wallet disconnected');
                address.value = null;
                isConnected.value = false;
                balance.value = null;
                error.value = null;
            });

            // Listen for connect events
            window.verus.on('connect', (connectInfo) => {
                console.log('Wallet connected:', connectInfo);
                if (connectInfo?.address) {
                    address.value = connectInfo.address;
                    isConnected.value = true;
                    error.value = null;
                    getBalance().catch(console.error);
                }
            });
        }
    });

    return {
        address,
        isConnected,
        isConnecting,
        error,
        balance,
        connectWallet,
        getAccount,
        getBalance,
        checkWalletInstalled
    };
}
