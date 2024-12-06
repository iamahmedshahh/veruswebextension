<template>
    <div class="currency-selector">
        <div class="header">
            <h3>Select Currencies</h3>
            <button class="btn-close" @click="$emit('close')">&times;</button>
        </div>

        <div v-if="loading" class="loading">
            Loading currencies...
        </div>

        <div v-else-if="error" class="error">
            {{ error }}
        </div>

        <div v-else class="currency-list">
            <div class="search-bar">
                <input 
                    type="text" 
                    v-model="searchQuery" 
                    placeholder="Search currencies..."
                    class="search-input"
                />
            </div>
            <div class="currencies">
                <div 
                    v-for="currency in filteredCurrencies" 
                    :key="currency.currencyid"
                    class="currency-item"
                    :class="{ selected: isSelected(currency.name) }"
                    @click="toggleCurrency(currency)"
                >
                    <div class="currency-info">
                        <span class="currency-name">{{ currency.name }}</span>
                        <span v-if="currency.fullyqualifiedname && currency.fullyqualifiedname !== currency.name" 
                              class="currency-fullname">({{ currency.fullyqualifiedname }})</span>
                    </div>
                    <span v-if="isSelected(currency.name)" class="selected-icon">✓</span>
                </div>
            </div>
        </div>

        <div class="footer">
            <span class="selection-info">
                {{ selectedCurrencies.length }}/7 currencies selected
            </span>
            <button class="btn-primary" @click="$emit('close')">Done</button>
        </div>
    </div>
</template>

<script>
import { ref, computed } from 'vue';
import { useStore } from 'vuex';

export default {
    name: 'CurrencySelector',
    
    emits: ['close', 'currency-selected'],

    setup(props, { emit }) {
        const store = useStore();
        const searchQuery = ref('');

        // Load currencies when component is mounted
        store.dispatch('currencies/fetchAvailableCurrencies');

        const availableCurrencies = computed(() => {
            const currencies = store.getters['currencies/getAvailableCurrencies'];
            return currencies.map(currency => {
                if (currency?.currencydefinition) {
                    const def = currency.currencydefinition;
                    return {
                        currencyid: def.currencyid,
                        name: def.name,
                        fullyqualifiedname: def.fullyqualifiedname,
                        systemid: def.systemid
                    };
                }
                return null;
            }).filter(c => c !== null);
        });

        const selectedCurrencies = computed(() => store.state.currencies.selectedCurrencies);
        const loading = computed(() => store.state.currencies.loading);
        const error = computed(() => store.state.currencies.error);
        const canAddMore = computed(() => store.getters['currencies/canAddMoreCurrencies']);

        const filteredCurrencies = computed(() => {
            const query = searchQuery.value.toLowerCase();
            return availableCurrencies.value.filter(currency => {
                const nameMatch = currency.name.toLowerCase().includes(query);
                const fullNameMatch = currency.fullyqualifiedname && 
                                    currency.fullyqualifiedname.toLowerCase().includes(query);
                return nameMatch || fullNameMatch;
            });
        });

        const isSelected = (currencyName) => {
            return selectedCurrencies.value.includes(currencyName);
        };

        const toggleCurrency = (currency) => {
            const currencyName = currency.name;
            if (isSelected(currencyName)) {
                store.dispatch('currencies/unselectCurrency', currencyName);
            } else if (canAddMore.value) {
                store.dispatch('currencies/selectCurrency', currencyName);
                emit('currency-selected', currencyName);
            }
        };

        return {
            searchQuery,
            filteredCurrencies,
            selectedCurrencies,
            loading,
            error,
            isSelected,
            toggleCurrency,
            canAddMore
        };
    }
};
</script>

<style scoped>
.currency-selector {
    background: white;
    border-radius: 8px;
    padding: 1rem;
    max-width: 500px;
    width: 100%;
    max-height: 80vh;
    display: flex;
    flex-direction: column;
}

.header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
    padding-bottom: 0.5rem;
    border-bottom: 1px solid #eee;
}

.header h3 {
    margin: 0;
}

.btn-close {
    background: none;
    border: none;
    font-size: 1.5rem;
    cursor: pointer;
    padding: 0.25rem 0.5rem;
}

.search-bar {
    margin-bottom: 1rem;
}

.search-input {
    width: 100%;
    padding: 0.5rem;
    border: 1px solid #ddd;
    border-radius: 4px;
}

.currency-list {
    flex: 1;
    overflow-y: auto;
}

.currencies {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
}

.currency-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.75rem;
    border: 1px solid #eee;
    border-radius: 4px;
    cursor: pointer;
    transition: background-color 0.2s;
}

.currency-item:hover {
    background-color: #f5f5f5;
}

.currency-item.selected {
    background-color: #e3f2fd;
    border-color: #2196f3;
}

.currency-info {
    display: flex;
    flex-direction: column;
}

.currency-name {
    font-weight: 500;
}

.currency-fullname {
    font-size: 0.85em;
    color: #666;
}

.selected-icon {
    color: #2196f3;
    font-weight: bold;
}

.footer {
    margin-top: 1rem;
    padding-top: 1rem;
    border-top: 1px solid #eee;
    display: flex;
    justify-content: space-between;
    align-items: center;
}

.selection-info {
    color: #666;
}

.btn-primary {
    background-color: #2196f3;
    color: white;
    border: none;
    padding: 0.5rem 1rem;
    border-radius: 4px;
    cursor: pointer;
}

.btn-primary:hover {
    background-color: #1976d2;
}

.loading, .error {
    text-align: center;
    padding: 2rem;
    color: #666;
}

.error {
    color: #f44336;
}
</style>
