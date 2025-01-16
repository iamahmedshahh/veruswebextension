<script setup>
import { ref, computed, defineProps, onMounted } from 'vue'
import { useStore } from 'vuex'

const store = useStore()
const props = defineProps({
  currency: {
    type: String,
    required: true
  }
})

// Load transactions from store
onMounted(() => {
  store.dispatch('transactions/loadTransactions')
})

const transactions = computed(() => store.getters['transactions/getTransactions'](props.currency))

const openTxInExplorer = (txid) => {
  const url = `https://testex.verus.io/tx/${txid}`
  window.open(url, '_blank')
}

const formatDate = (timestamp) => {
  return new Date(timestamp).toLocaleString()
}

// Later this will be connected to real transaction data from your store
const filteredTransactions = computed(() => transactions.value)
</script>

<template>
  <div class="history-container">
    <h3 class="history-title">Recent Transactions</h3>
    <div v-if="transactions.length === 0" class="empty-state">
      No transactions yet
    </div>
    <div v-else class="transactions-list">
      <div v-for="tx in transactions" 
           :key="tx.txid" 
           class="transaction-item"
           @click="openTxInExplorer(tx.txid)">
        <div class="tx-icon" :class="tx.type">
          {{ tx.type === 'received' ? '↓' : '↑' }}
        </div>
        <div class="tx-details">
          <div class="tx-primary">
            <span class="tx-type">{{ tx.type === 'received' ? 'Received' : 'Sent' }}</span>
            <span class="tx-amount">{{ tx.amount }} {{ tx.currency }}</span>
          </div>
          <div class="tx-addresses">
            <div class="tx-address">
              <span class="address-label">From:</span>
              <span :class="{ 'verus-id': tx.isFromVerusId }">{{ tx.from }}</span>
            </div>
            <div class="tx-address">
              <span class="address-label">To:</span>
              <span :class="{ 'verus-id': tx.isToVerusId }">{{ tx.to }}</span>
            </div>
          </div>
          <div class="tx-secondary">
            <span class="tx-date">{{ formatDate(tx.timestamp) }}</span>
            <span class="tx-status" :class="tx.status">{{ tx.status }}</span>
          </div>
          <div class="tx-id">
            {{ tx.txid.substring(0, 8) }}...{{ tx.txid.substring(tx.txid.length - 8) }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.history-container {
  background: white;
  border-radius: 12px;
  padding: 1rem;
  margin-top: 1rem;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
}

.history-title {
  margin: 0;
  padding: 0.5rem;
  font-size: 1rem;
  color: var(--text-color);
}

.transactions-list {
  margin-top: 0.5rem;
}

.transaction-item {
  display: flex;
  align-items: flex-start;
  padding: 1rem;
  border-bottom: 1px solid var(--border-color);
  cursor: pointer;
  transition: background-color 0.2s;
}

.transaction-item:last-child {
  border-bottom: none;
}

.transaction-item:hover {
  background-color: rgba(0, 0, 0, 0.02);
}

.tx-icon {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-right: 1rem;
  font-size: 1.2rem;
}

.tx-icon.sent {
  background: #ffebee;
  color: #f44336;
}

.tx-icon.received {
  background: #e8f5e9;
  color: #4caf50;
}

.tx-details {
  flex: 1;
}

.tx-primary {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.5rem;
}

.tx-addresses {
  margin: 0.5rem 0;
  font-size: 0.9rem;
}

.tx-address {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 0.25rem;
  word-break: break-all;
}

.address-label {
  color: #666;
  min-width: 3rem;
}

.verus-id {
  color: #2196f3;
  font-weight: 500;
}

.tx-type {
  font-weight: 500;
}

.tx-amount {
  font-weight: bold;
}

.tx-secondary {
  display: flex;
  justify-content: space-between;
  font-size: 0.85rem;
  color: #666;
  margin-top: 0.5rem;
}

.tx-date {
  color: #666;
}

.tx-status {
  padding: 0.25rem 0.5rem;
  border-radius: 12px;
  font-size: 0.8rem;
}

.tx-status.confirmed {
  background: #e8f5e9;
  color: #2e7d32;
}

.tx-status.pending {
  background: #fff3e0;
  color: #f57c00;
}

.tx-id {
  font-family: monospace;
  font-size: 0.85rem;
  color: #666;
  margin-top: 0.25rem;
}

.empty-state {
  text-align: center;
  padding: 2rem;
  color: #666;
}
</style>
