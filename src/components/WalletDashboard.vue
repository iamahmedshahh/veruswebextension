<template>
    <div class="dashboard">
        <div class="header">
            <h2>Wallet Dashboard</h2>
            <div class="actions">
                <button class="btn-secondary" @click="showCurrencySelector = true">
                    Add Currency
                </button>
                <button class="btn-secondary" @click="showSettings = true">
                    Settings
                </button>
            </div>
        </div>

        <div class="currency-cards">
            <div v-for="currency in selectedCurrencies" :key="currency" class="currency-card">
                <div class="currency-header">
                    <h3>{{ currency }}</h3>
                    <button 
                        v-if="selectedCurrencies.length > 1"
                        class="btn-remove" 
                        @click="removeCurrency(currency)"
                        title="Remove currency"
                    >
                        &times;
                    </button>
                </div>
                <div class="balance">
                    <span class="label">Balance:</span>
                    <span class="amount">{{ formatBalance(walletBalance) }} {{ currency }}</span>
                </div>
                <div class="address">
                    <span class="label">Address:</span>
                    <div class="address-value">
                        {{ walletAddress }}
                        <button class="btn-copy" @click="copyToClipboard(walletAddress)" title="Copy address">
                            📋
                        </button>
                    </div>
                </div>
                <div class="buttons">
                    <button class="btn-primary" @click="showSendModal = true">Send</button>
                    <button class="btn-secondary" @click="showReceiveModal = true">Receive</button>
                </div>
            </div>
        </div>

        <!-- Currency Selector Modal -->
        <div v-if="showCurrencySelector" class="modal">
            <div class="modal-content">
                <CurrencySelector @close="showCurrencySelector = false" />
            </div>
        </div>

        <!-- Settings Modal -->
        <div v-if="showSettings" class="modal">
            <div class="modal-content settings-modal">
                <Settings @close="showSettings = false" />
            </div>
        </div>

        <!-- Send Modal -->
        <div v-if="showSendModal" class="modal">
            <div class="modal-content">
                <h2>Send {{ selectedCurrencies[0] }}</h2>
                <form @submit.prevent="sendTransaction">
                    <div class="form-group">
                        <label>Recipient Address</label>
                        <input v-model="sendForm.to" type="text" required class="form-input" />
                    </div>
                    <div class="form-group">
                        <label>Amount ({{ selectedCurrencies[0] }})</label>
                        <input v-model="sendForm.amount" type="number" step="0.00000001" required class="form-input" />
                    </div>
                    <div class="modal-actions">
                        <button type="button" @click="showSendModal = false" class="btn btn-secondary">Cancel</button>
                        <button type="submit" class="btn btn-primary" :disabled="sending">Send</button>
                    </div>
                </form>
            </div>
        </div>

        <!-- Receive Modal -->
        <div v-if="showReceiveModal" class="modal">
            <div class="modal-content">
                <h2>Receive {{ selectedCurrencies[0] }}</h2>
                <div class="qr-code">
                    <!-- Add QR code component here -->
                </div>
                <div class="address-container" @click="copyAddress">
                    {{ address }}
                    <span class="copy-icon">📋</span>
                </div>
                <div class="modal-actions">
                    <button @click="showReceiveModal = false" class="btn btn-secondary">Close</button>
                </div>
            </div>
        </div>
    </div>
</template>

<script>
import { ref, computed, onMounted } from 'vue';
import { useStore } from 'vuex';
import Settings from './Settings.vue';
import CurrencySelector from './CurrencySelector.vue';

export default {
    name: 'WalletDashboard',
    
    components: {
        Settings,
        CurrencySelector
    },

    setup() {
        const store = useStore();
        const showSettings = ref(false);
        const showCurrencySelector = ref(false);
        const showSendModal = ref(false);
        const showReceiveModal = ref(false);
        const sending = ref(false);
        const sendForm = ref({
            to: '',
            amount: ''
        });

        // Get currencies from store
        const selectedCurrencies = computed(() => store.getters['currencies/getSelectedCurrencies']);

        // Your existing computed properties
        const walletAddress = computed(() => store.state.wallet.address);
        const walletBalance = computed(() => store.state.wallet.balance);
        const address = computed(() => store.getters['wallet/currentAddress']);
        const balance = computed(() => store.getters['wallet/currentBalance']);
        const formattedBalance = computed(() => {
            if (balance.value === null) return '0.00000000';
            return (balance.value / 100000000).toFixed(8);
        });

        const formatBalance = (balance) => {
            if (balance === null || balance === undefined) return '0.00000000';
            return (parseFloat(balance) / 100000000).toFixed(8);
        };

        const removeCurrency = (currency) => {
            store.dispatch('currencies/unselectCurrency', currency);
        };

        const copyToClipboard = async (text) => {
            try {
                await navigator.clipboard.writeText(text);
                // You might want to show a success toast here
            } catch (err) {
                console.error('Failed to copy:', err);
            }
        };

        const copyAddress = async () => {
            try {
                await navigator.clipboard.writeText(address.value);
                // TODO: Show success toast
            } catch (error) {
                console.error('Failed to copy address:', error);
            }
        };

        const sendTransaction = async () => {
            if (!sendForm.value.to || !sendForm.value.amount) return;
            
            try {
                sending.value = true;
                // TODO: Implement send transaction
                await store.dispatch('wallet/sendTransaction', {
                    to: sendForm.value.to,
                    amount: parseFloat(sendForm.value.amount)
                });
                showSendModal.value = false;
                sendForm.value = { to: '', amount: '' };
            } catch (error) {
                console.error('Failed to send transaction:', error);
            } finally {
                sending.value = false;
            }
        };

        const logout = async () => {
            try {
                await store.dispatch('wallet/logout');
            } catch (error) {
                console.error('Failed to logout:', error);
            }
        };

        return {
            showSettings,
            showCurrencySelector,
            showSendModal,
            showReceiveModal,
            selectedCurrencies,
            walletAddress,
            walletBalance,
            address,
            balance,
            formattedBalance,
            removeCurrency,
            copyToClipboard,
            copyAddress,
            sendForm,
            sending,
            sendTransaction,
            logout,
            formatBalance
        };
    }
};
</script>

<style scoped>
.dashboard {
    padding: 1.5rem;
}

.header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 2rem;
}

.header h2 {
    margin: 0;
}

.actions {
    display: flex;
    gap: 1rem;
}

.currency-cards {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: 1.5rem;
    margin-bottom: 2rem;
}

.currency-card {
    background: white;
    border-radius: 0.5rem;
    padding: 1.5rem;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.currency-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
}

.currency-header h3 {
    margin: 0;
    font-size: 1.25rem;
}

.btn-remove {
    background: none;
    border: none;
    font-size: 1.25rem;
    cursor: pointer;
    padding: 0.25rem;
    color: var(--text-secondary);
}

.balance {
    margin-bottom: 1rem;
}

.label {
    color: var(--text-secondary);
    font-size: 0.875rem;
}

.amount {
    display: block;
    font-size: 1.5rem;
    font-weight: bold;
    margin-top: 0.25rem;
}

.address {
    margin-bottom: 1.5rem;
}

.address-value {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-top: 0.25rem;
    font-family: monospace;
    font-size: 0.875rem;
    word-break: break-all;
}

.btn-copy {
    background: none;
    border: none;
    cursor: pointer;
    padding: 0.25rem;
}

.buttons {
    display: flex;
    gap: 1rem;
}

.btn-primary,
.btn-secondary {
    flex: 1;
    padding: 0.75rem;
    border: none;
    border-radius: 0.375rem;
    cursor: pointer;
    font-size: 0.875rem;
}

.btn-primary {
    background-color: var(--primary-color);
    color: white;
}

.btn-secondary {
    background-color: var(--secondary-color);
    color: white;
}

.modal {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 1000;
}

.modal-content {
    background: white;
    border-radius: 0.5rem;
    width: 90%;
    max-width: 600px;
    max-height: 90vh;
    overflow-y: auto;
}

.settings-modal {
    width: 100%;
    max-width: 100%;
    height: 100%;
    max-height: 100vh;
    margin: 0;
    border-radius: 0;
    overflow: hidden;
}

@media (min-width: 768px) {
    .settings-modal {
        width: 90%;
        max-width: 600px;
        height: auto;
        max-height: 90vh;
        margin: 2rem auto;
        border-radius: 0.5rem;
    }
}

@media (max-width: 768px) {
    .dashboard {
        padding: 1rem;
    }

    .header {
        flex-direction: column;
        align-items: flex-start;
        gap: 1rem;
    }

    .actions {
        width: 100%;
    }

    .btn-secondary {
        flex: 1;
    }

    .currency-cards {
        grid-template-columns: 1fr;
    }
}
</style>
