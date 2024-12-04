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
                    :key="currency"
                    class="currency-item"
                    :class="{ selected: isSelected(currency) }"
                    @click="toggleCurrency(currency)"
                >
                    <span class="currency-name">{{ currency }}</span>
                    <span v-if="isSelected(currency)" class="selected-icon">✓</span>
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

        const availableCurrencies = computed(() => store.getters['currencies/getAvailableCurrencies']);
        const selectedCurrencies = computed(() => store.getters['currencies/getSelectedCurrencies']);
        const loading = computed(() => store.getters['currencies/isLoading']);
        const error = computed(() => store.getters['currencies/getError']);
        const canAddMore = computed(() => store.getters['currencies/canAddMoreCurrencies']);

        const filteredCurrencies = computed(() => {
            const query = searchQuery.value.toLowerCase();
            return availableCurrencies.value.filter(currency => 
                currency.toLowerCase().includes(query)
            );
        });

        const isSelected = (currency) => {
            return selectedCurrencies.value.includes(currency);
        };

        const toggleCurrency = (currency) => {
            if (isSelected(currency)) {
                store.dispatch('currencies/unselectCurrency', currency);
            } else if (canAddMore.value) {
                store.dispatch('currencies/selectCurrency', currency);
                emit('currency-selected', currency);
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
    padding: 1.5rem;
    display: flex;
    flex-direction: column;
    height: 100%;
}

.header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1.5rem;
}

.header h3 {
    margin: 0;
    font-size: 1.25rem;
}

.btn-close {
    background: none;
    border: none;
    font-size: 1.5rem;
    cursor: pointer;
    padding: 0.5rem;
}

.search-bar {
    margin-bottom: 1rem;
}

.search-input {
    width: 100%;
    padding: 0.75rem;
    border: 1px solid var(--border-color);
    border-radius: 0.375rem;
    font-size: 0.875rem;
}

.currency-list {
    flex: 1;
    overflow-y: auto;
}

.currencies {
    display: grid;
    gap: 0.5rem;
}

.currency-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.75rem;
    border: 1px solid var(--border-color);
    border-radius: 0.375rem;
    cursor: pointer;
    transition: all 0.2s ease;
}

.currency-item:hover {
    background-color: var(--hover-color);
}

.currency-item.selected {
    background-color: var(--primary-color);
    color: white;
    border-color: var(--primary-color);
}

.selected-icon {
    font-weight: bold;
}

.footer {
    margin-top: 1.5rem;
    display: flex;
    justify-content: space-between;
    align-items: center;
}

.selection-info {
    font-size: 0.875rem;
    color: var(--text-secondary);
}

.btn-primary {
    padding: 0.5rem 1rem;
    background-color: var(--primary-color);
    color: white;
    border: none;
    border-radius: 0.375rem;
    cursor: pointer;
}

.loading, .error {
    text-align: center;
    padding: 2rem;
    color: var(--text-secondary);
}

.error {
    color: var(--error-color);
}
</style>
