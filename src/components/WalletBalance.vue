<script setup>
import { ref, onMounted, onUnmounted, computed } from 'vue';
import { useStore } from 'vuex';

const props = defineProps({
  address: {
    type: String,
    required: true
  },
  currency: {
    type: String,
    default: 'VRSCTEST'
  }
});

const store = useStore();
const isLoading = ref(false);
const error = ref('');

// Get balance from store
const balance = computed(() => {
  const balances = store.state.wallet.balances;
  const currencyBalance = balances[props.currency] || 0;
  return currencyBalance.toFixed(8); // Format to 8 decimal places
});

// Update balance periodically
let balanceInterval;

onMounted(() => {
  updateBalance();
  balanceInterval = setInterval(updateBalance, 30000); // Update every 30 seconds
});

onUnmounted(() => {
  if (balanceInterval) {
    clearInterval(balanceInterval);
  }
});

async function updateBalance() {
  if (!props.address) return;
  
  isLoading.value = true;
  error.value = '';
  
  try {
    await store.dispatch('wallet/updateBalances');
  } catch (err) {
    console.error('Failed to update balance:', err);
    error.value = 'Failed to update balance';
  } finally {
    isLoading.value = false;
  }
}

async function copyAddress() {
  try {
    await navigator.clipboard.writeText(props.address);
  } catch (err) {
    console.error('Failed to copy address:', err);
  }
}
</script>

<template>
  <div class="balance-container">
    <div class="balance-header">
      <h2>Balance</h2>
      <div v-if="isLoading" class="loading-spinner"></div>
    </div>
    
    <div class="balance-amount" :class="{ loading: isLoading }">
      {{ balance }} <span class="currency">{{ props.currency }}</span>
    </div>
    
    <div v-if="error" class="error-message">
      {{ error }}
    </div>
    
    <div class="address-container">
      <div class="address-label">Address</div>
      <div class="address-value" @click="copyAddress" title="Click to copy">
        {{ props.address }}
      </div>
    </div>
  </div>
</template>

<style scoped>
.balance-container {
  padding: 1.5rem;
  background-color: white;
  border-radius: 0.5rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.balance-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}

.balance-header h2 {
  margin: 0;
  color: var(--text-color);
  font-size: 1.25rem;
}

.balance-amount {
  font-size: 2rem;
  font-weight: bold;
  color: var(--text-color);
  margin-bottom: 1rem;
}

.balance-amount.loading {
  opacity: 0.7;
}

.currency {
  font-size: 1rem;
  color: var(--text-color);
  opacity: 0.7;
}

.loading-spinner {
  width: 20px;
  height: 20px;
  border: 2px solid var(--border-color);
  border-top-color: var(--primary-color);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

.error-message {
  color: #ef4444;
  font-size: 0.875rem;
  margin-bottom: 1rem;
}

.address-container {
  margin-top: 1.5rem;
  padding-top: 1rem;
  border-top: 1px solid var(--border-color);
}

.address-label {
  font-size: 0.875rem;
  color: var(--text-color);
  opacity: 0.7;
  margin-bottom: 0.5rem;
}

.address-value {
  font-family: monospace;
  font-size: 0.875rem;
  padding: 0.5rem;
  background-color: var(--background-color);
  border-radius: 0.25rem;
  cursor: pointer;
  word-break: break-all;
  transition: background-color 0.2s;
}

.address-value:hover {
  background-color: #e2e8f0;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
