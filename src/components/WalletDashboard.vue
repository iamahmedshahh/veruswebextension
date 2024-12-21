<template>
    <div class="dashboard">
        <LoadingBar :show="isLoadingBalances" />
        
        <WalletHeader 
            :is-locked="isLocked"
            @settings-click="showSettings = true"
        />

        <div v-if="walletLoading" class="loading-container">
            <div class="loading-spinner"></div>
            <p>Loading wallet data...</p>
        </div>

        <div v-else class="dashboard-content">
            <div class="total-balance-section">
                <h2>Total Balance</h2>
                <div class="total-balance-amount">{{ formatBalance(totalBalance) }}</div>
            </div>
            <div class="currency-cards">
                <div 
                    v-for="currency in selectedCurrencies" 
                    :key="currency" 
                    class="currency-card"
                >
                    <div class="card-content" @click="$router.push(`/currency/${currency}`)">
                        <div class="card-header">
                            <h3>{{ currency }}</h3>
                            <button 
                                class="remove-currency" 
                                @click.stop="removeCurrency(currency)"
                                v-if="currency !== 'VRSCTEST'"
                            >
                                &times;
                            </button>
                        </div>
                        <div class="balance-section">
                            <div class="balance">
                                <span class="balance-label">Balance:</span>
                                <span class="balance-amount">{{ formatBalance(getBalance(currency)) }}</span>
                            </div>
                            <div class="address-section">
                                <span class="address-label">Address:</span>
                                <div class="address-value">
                                    <span class="address">{{ address }}</span>
                                    <button 
                                        class="copy-button"
                                        @click.stop="copyToClipboard(address)"
                                        title="Copy address"
                                    >
                                        📋
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="action-buttons">
                        <button class="action-btn send" @click.stop="handleSend(currency)">
                            <i class="fas fa-arrow-up"></i>
                            Send
                        </button>
                        <button class="action-btn receive" @click.stop="handleReceive(currency)">
                            <i class="fas fa-arrow-down"></i>
                            Receive
                        </button>
                    </div>
                </div>

                <div 
                    v-if="canAddMoreCurrencies" 
                    class="add-currency-card"
                    @click="showCurrencySelector = true"
                >
                    <div class="add-icon">+</div>
                    <span>Add Currency</span>
                </div>
            </div>
        </div>

        <div v-if="showSettings" class="modal-overlay">
            <div class="modal-container">
                <Settings 
                    @close="showSettings = false"
                />
            </div>
        </div>

        <div v-if="showCurrencySelector" class="modal-overlay">
            <div class="modal-container">
                <CurrencySelector 
                    @close="showCurrencySelector = false"
                    @currency-selected="handleCurrencySelected"
                />
            </div>
        </div>

        <div v-if="showSendModal" class="modal-overlay">
            <div class="modal-container send-modal">
                <div class="send-modal-header">
                    <h3>Send {{ selectedCurrencyForAction }}</h3>
                    <button class="close-button" @click="showSendModal = false">&times;</button>
                </div>
                <form @submit.prevent="executeSend" class="send-form">
                    <div class="form-group">
                        <label for="recipientAddress">Recipient Address:</label>
                        <input 
                            id="recipientAddress"
                            v-model="recipientAddress"
                            type="text"
                            placeholder="Enter recipient address"
                            :disabled="isLoading"
                            required
                        />
                    </div>
                    <div class="form-group">
                        <label for="amount">Amount</label>
                        <input 
                            id="amount"
                            v-model="amount"
                            type="number"
                            step="0.00000001"
                            placeholder="Enter amount"
                            :disabled="isLoading"
                            @input="updateEstimatedFee"
                            required
                        />
                    </div>
                    <div v-if="estimatedFee" class="fee-info">
                        Estimated Fee: {{ estimatedFee }} {{ selectedCurrencyForAction }}
                    </div>
                    <div v-if="error" class="error-message">{{ error }}</div>
                    <button 
                        type="submit"
                        class="send-button"
                        :disabled="isLoading || !recipientAddress || !amount"
                    >
                        <i v-if="isLoading" class="fas fa-spinner fa-spin"></i>
                        <span v-else>Send</span>
                    </button>
                </form>
            </div>
        </div>

        <div v-if="showReceiveModal" class="modal-overlay">
            <div class="modal-container">
                <div class="modal-header">
                    <h3>Receive {{ selectedCurrencyForAction }}</h3>
                    <button class="close-button" @click="showReceiveModal = false">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="qr-container">
                        <img :src="receiveQrCode" alt="Receive Address QR Code" class="qr-code" v-if="receiveQrCode" />
                    </div>
                    <div class="address-container">
                        <p class="address-label">Your receive address:</p>
                        <div class="address-value">
                            {{ address }}
                            <button class="copy-button" @click="copyToClipboard(address)" title="Copy address">
                                <i class="fas fa-copy"></i>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<script>
import { ref, computed, onMounted, watch, nextTick } from 'vue';
import { useStore } from 'vuex';
import QRCode from 'qrcode';
import WalletHeader from './WalletHeader.vue';
import LoadingBar from './LoadingBar.vue';
import Settings from './Settings.vue';
import CurrencySelector from './CurrencySelector.vue';
import { sendCurrency, estimateFee, validateAddress } from '../utils/transaction';

export default {
    name: 'WalletDashboard',
    
    components: {
        WalletHeader,
        LoadingBar,
        Settings,
        CurrencySelector
    },

    setup() {
        const store = useStore();
        const showSettings = ref(false);
        const showCurrencySelector = ref(false);
        const showSendModal = ref(false);
        const showReceiveModal = ref(false);
        const selectedCurrencyForAction = ref('');
        const recipientAddress = ref('');
        const amount = ref('');
        const error = ref('');
        const isLoading = ref(false);
        const estimatedFee = ref(0);
        const receiveQrCode = ref('');

        const walletLoading = computed(() => store.state.wallet.loading);
        const walletError = computed(() => store.state.wallet.error);
        const address = computed(() => store.state.wallet.address);
        const isLocked = computed(() => store.state.wallet.isLocked);
        const selectedCurrencies = computed(() => store.state.currencies.selectedCurrencies);
        const balances = computed(() => store.state.currencies.balances);
        const isLoadingBalances = computed(() => store.state.currencies.loading);
        const canAddMoreCurrencies = computed(() => store.getters['currencies/canAddMoreCurrencies']);

        const totalBalance = computed(() => {
            return Object.values(balances.value).reduce((acc, balance) => acc + balance, 0);
        });

        const getBalance = (currency) => {
            return balances.value[currency] || 0;
        };

        const formatBalance = (balance) => {
            return balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 8 });
        };

        const copyToClipboard = async (text) => {
            try {
                await navigator.clipboard.writeText(text);
                // Could add a toast notification here
                console.log('Address copied to clipboard');
            } catch (err) {
                console.error('Failed to copy address:', err);
            }
        };

        const handleCurrencySelected = (currency) => {
            store.dispatch('currencies/selectCurrency', currency);
            showCurrencySelector.value = false;
        };

        const removeCurrency = (currency) => {
            store.dispatch('currencies/unselectCurrency', currency);
        };

        const handleSend = (currency) => {
            selectedCurrencyForAction.value = currency;
            showSendModal.value = true;
        };

        const handleReceive = (currency) => {
            selectedCurrencyForAction.value = currency;
            showReceiveModal.value = true;
        };

        const executeSend = async () => {
            try {
                console.log('Starting send transaction...');
                error.value = '';
                isLoading.value = true;
                
                // Validate inputs
                console.log('Validating address:', recipientAddress.value);
                if (!validateAddress(recipientAddress.value)) {
                    throw new Error('Invalid recipient address');
                }
                
                const amountNum = parseFloat(amount.value);
                console.log('Validating amount:', amountNum);
                if (isNaN(amountNum) || amountNum <= 0) {
                    throw new Error('Invalid amount');
                }
                
                // Get current wallet data from store
                console.log('Getting wallet data...');
                const fromAddress = store.state.wallet.address;
                if (!fromAddress) {
                    throw new Error('Sender address not found in wallet');
                }
                
                console.log('Getting private key...');
                const privateKey = await store.dispatch('wallet/getPrivateKey');
                if (!privateKey) {
                    throw new Error('Private key not available. Please check if wallet is unlocked');
                }
                
                // Send transaction
                console.log('Sending transaction...');
                const result = await sendCurrency(
                    fromAddress,
                    recipientAddress.value,
                    amountNum,
                    privateKey,
                    selectedCurrencyForAction.value
                );
                
                console.log('Transaction sent successfully:', result);
                
                // Update balances after successful send
                await store.dispatch('currencies/updateBalances');
                
                // Close modal and reset form
                showSendModal.value = false;
                recipientAddress.value = '';
                amount.value = '';
                
                // Show success notification
                store.commit('notification/show', {
                    type: 'success',
                    message: `Transaction sent successfully! TXID: ${result.txid}`
                });
                
            } catch (err) {
                console.error('Send transaction failed:', err);
                error.value = err.message;
                store.commit('notification/show', {
                    type: 'error',
                    message: `Failed to send transaction: ${err.message}`
                });
            } finally {
                isLoading.value = false;
            }
        };

        const updateEstimatedFee = async () => {
            if (!amount.value || !address.value) return;
            
            try {
                const fee = await estimateFee(
                    address.value,
                    parseFloat(amount.value),
                    selectedCurrencyForAction.value
                );
                estimatedFee.value = fee;
            } catch (err) {
                console.error('Error estimating fee:', err);
            }
        };

        watch(showReceiveModal, async (isVisible) => {
            if (isVisible && address.value) {
                try {
                    receiveQrCode.value = await QRCode.toDataURL(address.value, {
                        width: 200,
                        margin: 1,
                        color: {
                            dark: '#000000',
                            light: '#ffffff'
                        }
                    });
                } catch (error) {
                    console.error('Error generating QR code:', error);
                }
            }
        });

        onMounted(async () => {
            try {
                await store.dispatch('wallet/loadWalletData');
                await store.dispatch('currencies/fetchAvailableCurrencies');
            } catch (error) {
                console.error('Failed to load initial data:', error);
            }
        });

        onMounted(async () => {
            if (address.value) {
                await store.dispatch('currencies/fetchBalances');
            }
        });

        // Watch for address changes to fetch balances
        watch(address, async (newAddress) => {
            if (newAddress) {
                await store.dispatch('currencies/fetchBalances');
            }
        });

        return {
            walletLoading,
            walletError,
            address,
            isLocked,
            showSettings,
            showCurrencySelector,
            showSendModal,
            showReceiveModal,
            selectedCurrencies,
            selectedCurrencyForAction,
            recipientAddress,
            amount,
            estimatedFee,
            isLoading,
            isLoadingBalances,
            canAddMoreCurrencies,
            getBalance,
            formatBalance,
            copyToClipboard,
            handleCurrencySelected,
            removeCurrency,
            handleSend,
            handleReceive,
            executeSend,
            updateEstimatedFee,
            receiveQrCode,
            totalBalance
        };
    }
};
</script>

<style scoped>
.dashboard {
    height: 100%;
    padding: 1rem;
    display: flex;
    flex-direction: column;
}

.modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
}

.modal-container {
    background: white;
    border-radius: 8px;
    width: 90%;
    max-width: 500px;
    max-height: 90vh;
    overflow-y: auto;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
}

.loading-container {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
}

.loading-spinner {
    border: 4px solid var(--border-color);
    border-top: 4px solid var(--primary-color);
    border-radius: 50%;
    width: 40px;
    height: 40px;
    animation: spin 1s linear infinite;
    margin-bottom: 1rem;
}

@keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
}

.dashboard-content {
    flex: 1;
    overflow-y: auto;
    padding: 1rem 0;
}

.total-balance-section {
    margin-bottom: 1rem;
    padding: 1rem;
    background-color: #f5f5f5;
    border-radius: 8px;
}

.total-balance-amount {
    font-size: 1.5rem;
    font-weight: 600;
}

.currency-cards {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 1rem;
}

.currency-card {
    background: var(--card-bg);
    border: 1px solid var(--border-color);
    border-radius: 0.5rem;
    padding: 1rem;
}

.card-content {
    cursor: pointer;
}

.card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
}

.card-header h3 {
    margin: 0;
    font-size: 1.25rem;
}

.remove-currency {
    background: none;
    border: none;
    font-size: 1.25rem;
    cursor: pointer;
    padding: 0.25rem;
    color: var(--text-secondary);
}

.remove-currency:hover {
    color: var(--error-color);
}

.balance-section {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
}

.balance {
    display: flex;
    justify-content: space-between;
    align-items: center;
}

.balance-label {
    color: var(--text-secondary);
}

.balance-amount {
    font-weight: 600;
    font-size: 1.125rem;
}

.address-section {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
}

.address-label {
    color: var(--text-secondary);
    font-size: 0.875rem;
}

.address-value {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    background: var(--bg-secondary);
    padding: 0.5rem;
    border-radius: 0.25rem;
}

.address {
    font-family: monospace;
    font-size: 0.875rem;
    overflow: hidden;
    text-overflow: ellipsis;
}

.copy-button {
    background: none;
    border: none;
    cursor: pointer;
    padding: 0.25rem;
    font-size: 1rem;
}

.add-currency-card {
    border: 2px dashed var(--border-color);
    border-radius: 0.5rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 2rem;
    cursor: pointer;
    transition: all 0.2s ease;
}

.add-currency-card:hover {
    border-color: var(--primary-color);
    color: var(--primary-color);
}

.add-icon {
    font-size: 2rem;
    margin-bottom: 0.5rem;
}

.action-buttons {
    display: flex;
    gap: 8px;
    margin-top: 12px;
}

.action-btn {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 8px;
    border: none;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: opacity 0.2s;
}

.action-btn:hover {
    opacity: 0.9;
}

.action-btn.send {
    background-color: #4CAF50;
    color: white;
}

.action-btn.receive {
    background-color: #2196F3;
    color: white;
}

.action-btn i {
    font-size: 12px;
}

.send-modal {
    background: white;
    border-radius: 12px;
    padding: 20px;
    width: 90%;
    max-width: 400px;
}

.send-modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20px;
}

.send-modal-header h3 {
    margin: 0;
}

.close-button {
    background: none;
    border: none;
    font-size: 20px;
    cursor: pointer;
}

.form-group {
    margin-bottom: 15px;
}

.form-group label {
    display: block;
    margin-bottom: 5px;
    color: #666;
}

.form-group input {
    width: 100%;
    padding: 8px;
    border: 1px solid #ddd;
    border-radius: 4px;
}

.fee-info {
    font-size: 14px;
    color: #666;
    margin-bottom: 15px;
}

.error-message {
    color: #f44336;
    font-size: 14px;
    margin-bottom: 15px;
}

.send-button {
    width: 100%;
    padding: 10px;
    background: #4CAF50;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
}

.send-button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
}

.qr-container {
    display: flex;
    justify-content: center;
    margin-bottom: 1.5rem;
}

.qr-code {
    width: 200px;
    height: 200px;
    background: white;
    padding: 1rem;
    border-radius: 8px;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.address-container {
    text-align: center;
}

.address-label {
    font-size: 0.9rem;
    color: #666;
    margin-bottom: 0.5rem;
}

.address-value {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    font-family: monospace;
    background-color: #f5f5f5;
    padding: 0.75rem;
    border-radius: 4px;
    word-break: break-all;
}

.copy-button {
    background: none;
    border: none;
    padding: 4px 8px;
    cursor: pointer;
    color: #666;
    transition: color 0.2s;
}

.copy-button:hover {
    color: var(--primary-color);
}
</style>
