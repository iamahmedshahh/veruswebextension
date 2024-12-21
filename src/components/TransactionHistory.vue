<script setup>
import { ref, computed, defineProps } from 'vue'

const props = defineProps({
  currency: {
    type: String,
    required: true
  }
})

// Mock data - will be replaced with real transactions later
const transactions = ref([
  {
    id: 1,
    type: 'received',
    amount: `100 ${props.currency}`,
    from: 'tX...abc',
    to: 'tV...xyz',
    timestamp: '2024-01-20 10:30',
    status: 'confirmed'
  },
  {
    id: 2,
    type: 'sent',
    amount: `50 ${props.currency}`,
    from: 'tV...xyz',
    to: 'tA...123',
    timestamp: '2024-01-19 15:45',
    status: 'confirmed'
  }
])

// Later this will be connected to real transaction data from your store
const filteredTransactions = computed(() => transactions.value)
</script>

<template>
  <div class="history-container">
    <h3 class="history-title">Recent Transactions</h3>
    <div class="transactions-list">
      <div v-for="tx in filteredTransactions" :key="tx.id" class="transaction-item">
        <div class="tx-icon" :class="tx.type">
          {{ tx.type === 'received' ? '↓' : '↑' }}
        </div>
        <div class="tx-details">
          <div class="tx-primary">
            <span class="tx-type">{{ tx.type === 'received' ? 'Received' : 'Sent' }}</span>
            <span class="tx-amount">{{ tx.amount }}</span>
          </div>
          <div class="tx-secondary">
            <span class="tx-date">{{ tx.timestamp }}</span>
            <span class="tx-status" :class="tx.status">{{ tx.status }}</span>
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
  align-items: center;
  padding: 1rem;
  border-bottom: 1px solid var(--border-color);
}

.transaction-item:last-child {
  border-bottom: none;
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

.tx-icon.received {
  background: rgba(46, 204, 113, 0.1);
  color: var(--secondary-color);
}

.tx-icon.sent {
  background: rgba(52, 152, 219, 0.1);
  color: var(--primary-color);
}

.tx-details {
  flex: 1;
}

.tx-primary {
  display: flex;
  justify-content: space-between;
  margin-bottom: 0.25rem;
}

.tx-type {
  font-weight: 500;
}

.tx-amount {
  font-weight: 600;
}

.tx-secondary {
  display: flex;
  justify-content: space-between;
  font-size: 0.85rem;
  color: #666;
}

.tx-status {
  text-transform: capitalize;
}

.tx-status.confirmed {
  color: var(--secondary-color);
}

.tx-status.pending {
  color: #f39c12;
}
</style>
