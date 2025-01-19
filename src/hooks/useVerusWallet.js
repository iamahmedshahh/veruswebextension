import { ref, onMounted, onUnmounted } from 'vue';
import VerusWeb3 from '../verusweb3';

export function useVerusWallet() {
    const address = ref(null);
    const isConnected = ref(false);
    const error = ref(null);
    const isConnecting = ref(false);
    let verus = null;

    // Initialize verusweb3
    const initVerus = () => {
        if (!verus) {
            verus = new VerusWeb3();
        }
        return verus;
    };

    // Check if wallet is installed
    const checkWalletInstalled = () => {
        try {
            return !!window.verus || !!window.verusWallet;
        } catch (err) {
            console.error('[Verus] Wallet not installed:', err);
            return false;
        }
    };

    // Connect to wallet
    const connectWallet = async () => {
        try {
            const verus = initVerus();
            
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
            if (verus.isConnected()) {
                const accounts = await verus.getAccounts();
                if (accounts && accounts.length > 0) {
                    address.value = accounts[0];
                    isConnected.value = true;
                    return accounts[0];
                }
            }

            // Attempt connection
            console.log('[Verus] Initiating connection...');
            const result = await verus.connect();
            
            if (result?.address) {
                address.value = result.address;
                isConnected.value = true;
                return result.address;
            } else {
                throw new Error('No address received after connection');
            }
        } catch (err) {
            console.error('[Verus] Connection error:', err);
            error.value = err.message;
            throw err;
        } finally {
            isConnecting.value = false;
        }
    };

    // Send transaction
    const sendTransaction = async (to, amount, currency = 'VRSCTEST') => {
        try {
            const verus = initVerus();
            if (!isConnected.value) {
                throw new Error('Not connected');
            }

            const txid = await verus.sendTransaction({
                to,
                amount,
                currency
            });

            return txid;
        } catch (err) {
            console.error('[Verus] Transaction error:', err);
            error.value = err.message;
            throw err;
        }
    };

    // Get balance
    const getBalance = async (currency = 'VRSCTEST') => {
        try {
            const verus = initVerus();
            if (!isConnected.value) {
                throw new Error('Not connected');
            }

            return await verus.getBalance(currency);
        } catch (err) {
            console.error('[Verus] Balance error:', err);
            error.value = err.message;
            throw err;
        }
    };

    // Lifecycle hooks
    onMounted(() => {
        try {
            const verus = initVerus();
            if (verus.isConnected()) {
                verus.getAccounts().then(accounts => {
                    if (accounts && accounts.length > 0) {
                        address.value = accounts[0];
                        isConnected.value = true;
                    }
                }).catch(console.error);
            }
        } catch (err) {
            console.error('[Verus] Failed to initialize:', err);
        }
    });

    return {
        address,
        isConnected,
        isConnecting,
        error,
        connectWallet,
        sendTransaction,
        getBalance,
        checkWalletInstalled
    };
}