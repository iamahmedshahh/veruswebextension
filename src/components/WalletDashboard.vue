<template>
    <div class="dashboard">
        <LoadingBar :show="isLoadingBalances" />
        
        <WalletHeader 
            :is-locked="isLocked"
            @settings-click="showSettings = true"
        />

        <div v-if="loading" class="loading-container">
            <div class="loading-spinner"></div>
            <p>Loading wallet data...</p>
        </div>

        <div v-else class="dashboard-content">
            <div class="currency-cards">
                <div 
                    v-for="currency in selectedCurrencies" 
                    :key="currency" 
                    class="currency-card"
                >
                    <div class="card-header">
                        <h3>{{ currency }}</h3>
                        <button 
                            class="remove-currency" 
                            @click="removeCurrency(currency)"
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
                                    @click="copyToClipboard(address)"
                                    title="Copy address"
                                >
                                    📋
                                </button>
                            </div>
                        </div>
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
    </div>
</template>

<script>
import { ref, computed, onMounted } from 'vue';
import { useStore } from 'vuex';
import WalletHeader from './WalletHeader.vue';
import LoadingBar from './LoadingBar.vue';
import Settings from './Settings.vue';
import CurrencySelector from './CurrencySelector.vue';

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

        const loading = computed(() => store.state.wallet.loading);
        const error = computed(() => store.state.wallet.error);
        const address = computed(() => store.state.wallet.address);
        const isLocked = computed(() => store.state.wallet.isLocked);
        const selectedCurrencies = computed(() => store.state.currencies.selectedCurrencies);
        const balances = computed(() => store.state.currencies.balances);
        const isLoadingBalances = computed(() => store.state.currencies.loading);
        const canAddMoreCurrencies = computed(() => store.getters['currencies/canAddMoreCurrencies']);

        const getBalance = (currency) => {
            return balances.value[currency] || 0;
        };

        const formatBalance = (balance) => {
            return balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 8 });
        };

        const copyToClipboard = (text) => {
            navigator.clipboard.writeText(text);
            // Could add a toast notification here
        };

        const handleCurrencySelected = (currency) => {
            store.dispatch('currencies/selectCurrency', currency);
            showCurrencySelector.value = false;
        };

        const removeCurrency = (currency) => {
            store.dispatch('currencies/unselectCurrency', currency);
        };

        onMounted(async () => {
            try {
                await store.dispatch('wallet/loadWalletData');
                await store.dispatch('currencies/fetchAvailableCurrencies');
            } catch (error) {
                console.error('Failed to load initial data:', error);
            }
        });

        return {
            loading,
            error,
            address,
            isLocked,
            showSettings,
            showCurrencySelector,
            selectedCurrencies,
            isLoadingBalances,
            canAddMoreCurrencies,
            getBalance,
            formatBalance,
            copyToClipboard,
            handleCurrencySelected,
            removeCurrency
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
</style>
