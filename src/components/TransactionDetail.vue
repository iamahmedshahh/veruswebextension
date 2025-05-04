<template>
  <div class="transaction-detail">
    <div class="transaction-overview">
      <div class="tx-icon" :class="transaction.type">
        <i :class="transaction.type === 'received' ? 'fas fa-arrow-down' : 'fas fa-arrow-up'"></i>
      </div>
      <div class="tx-summary">
        <div class="tx-summary-main">
          <span class="tx-type">{{ transaction.type === 'received' ? 'Received' : 'Sent' }}</span>
          <span class="tx-date">{{ formatDate(transaction.timestamp) }}</span>
        </div>
        <div class="tx-amount" :class="transaction.type === 'received' ? 'received' : 'sent'">
          {{ transaction.type === 'received' ? '+' : '-' }} {{ transaction.amount }} {{ transaction.currency }}
        </div>
      </div>
    </div>

    <div class="tx-status-container">
      <div class="tx-status-badge" :class="transaction.status">
        <i class="fas" :class="statusIcon"></i>
        {{ statusText }}
      </div>
    </div>

    <div class="tx-details-list">
      <div class="tx-detail-item">
        <div class="tx-detail-label">Transaction ID</div>
        <div class="tx-detail-value monospace">
          <div class="copy-container">
            {{ transaction.txid }}
            <button class="copy-button" @click="copyToClipboard(transaction.txid)" title="Copy to clipboard">
              <i class="fas fa-copy"></i>
            </button>
          </div>
        </div>
      </div>

      <div class="tx-detail-item">
        <div class="tx-detail-label">From</div>
        <div class="tx-detail-value monospace" :class="{ 'verus-id': transaction.isFromVerusId }">
          <div class="copy-container">
            {{ transaction.from }}
            <button class="copy-button" @click="copyToClipboard(transaction.from)" title="Copy to clipboard">
              <i class="fas fa-copy"></i>
            </button>
          </div>
        </div>
      </div>

      <div class="tx-detail-item">
        <div class="tx-detail-label">To</div>
        <div class="tx-detail-value monospace" :class="{ 'verus-id': transaction.isToVerusId }">
          <div class="copy-container">
            {{ transaction.to }}
            <button class="copy-button" @click="copyToClipboard(transaction.to)" title="Copy to clipboard">
              <i class="fas fa-copy"></i>
            </button>
          </div>
        </div>
      </div>

      <div class="tx-detail-item">
        <div class="tx-detail-label">Block</div>
        <div class="tx-detail-value monospace">
          {{ transaction.blockHeight || 'Pending confirmation' }}
        </div>
      </div>

      <div class="tx-detail-item">
        <div class="tx-detail-label">Fee</div>
        <div class="tx-detail-value">
          {{ transaction.fee || '0.0001' }} VRSCTEST
        </div>
      </div>

      <div v-if="transaction.memo" class="tx-detail-item">
        <div class="tx-detail-label">Memo</div>
        <div class="tx-detail-value memo">
          {{ transaction.memo }}
        </div>
      </div>

      <div class="tx-detail-item">
        <div class="tx-detail-label">Date & Time</div>
        <div class="tx-detail-value">
          {{ formatDate(transaction.timestamp) }}
        </div>
      </div>
    </div>

    <div class="tx-actions">
      <button @click="$emit('explorer')" class="tx-action-button explorer">
        <i class="fas fa-external-link-alt"></i>
        View in Explorer
      </button>
      <button v-if="transaction.status === 'pending'" class="tx-action-button resubmit">
        <i class="fas fa-redo-alt"></i>
        Resubmit
      </button>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  transaction: {
    type: Object,
    required: true
  }
});

const statusIcon = computed(() => {
  switch (props.transaction.status) {
    case 'confirmed':
      return 'fa-check-circle';
    case 'pending':
      return 'fa-clock';
    case 'failed':
      return 'fa-times-circle';
    default:
      return 'fa-question-circle';
  }
});

const statusText = computed(() => {
  switch (props.transaction.status) {
    case 'confirmed':
      return 'Confirmed';
    case 'pending':
      return 'Pending';
    case 'failed':
      return 'Failed';
    default:
      return 'Unknown';
  }
});

const formatDate = (timestamp) => {
  const options = { 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric', 
    hour: '2-digit', 
    minute: '2-digit',
    second: '2-digit'
  };
  return new Date(timestamp).toLocaleString(undefined, options);
};

const copyToClipboard = (text) => {
  navigator.clipboard.writeText(text)
    .then(() => {
      // Could show a toast notification here
      console.log('Copied to clipboard');
    })
    .catch(err => {
      console.error('Could not copy text: ', err);
    });
};

defineEmits(['explorer']);
</script>

<style scoped>
.transaction-detail {
  padding: 1.5rem;
}

.transaction-overview {
  display: flex;
  align-items: center;
  margin-bottom: 2rem;
}

.tx-icon {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-right: 1rem;
  font-size: 1.25rem;
}

.tx-icon.sent {
  background: #ffebee;
  color: #f44336;
}

.tx-icon.received {
  background: #e8f5e9;
  color: #4caf50;
}

.tx-summary {
  flex: 1;
}

.tx-summary-main {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-bottom: 0.5rem;
}

.tx-type {
  font-weight: 600;
  font-size: 1.1rem;
}

.tx-date {
  color: #666;
  font-size: 0.9rem;
}

.tx-amount {
  font-size: 1.5rem;
  font-weight: 700;
}

.tx-amount.received {
  color: #4caf50;
}

.tx-amount.sent {
  color: #f44336;
}

.tx-status-container {
  display: flex;
  justify-content: center;
  margin: 1.5rem 0;
}

.tx-status-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1.5rem;
  border-radius: 20px;
  font-weight: 500;
}

.tx-status-badge.confirmed {
  background: #e8f5e9;
  color: #2e7d32;
}

.tx-status-badge.pending {
  background: #fff3e0;
  color: #f57c00;
}

.tx-status-badge.failed {
  background: #ffebee;
  color: #c62828;
}

.tx-details-list {
  margin-bottom: 2rem;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  overflow: hidden;
}

.tx-detail-item {
  display: flex;
  padding: 1rem;
  border-bottom: 1px solid var(--border-color);
}

.tx-detail-item:last-child {
  border-bottom: none;
}

.tx-detail-label {
  width: 120px;
  font-weight: 500;
  color: #666;
}

.tx-detail-value {
  flex: 1;
  word-break: break-all;
}

.tx-detail-value.monospace {
  font-family: monospace;
  font-size: 0.9rem;
}

.tx-detail-value.verus-id {
  color: #2196f3;
  font-weight: 500;
}

.tx-detail-value.memo {
  background: #f9f9f9;
  padding: 0.75rem;
  border-radius: 4px;
  font-style: italic;
}

.copy-container {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.copy-button {
  background: none;
  border: none;
  color: #666;
  cursor: pointer;
  font-size: 0.9rem;
  padding: 0.25rem;
  border-radius: 50%;
  transition: background-color 0.2s;
}

.copy-button:hover {
  background-color: rgba(0, 0, 0, 0.05);
  color: #2196f3;
}

.tx-actions {
  display: flex;
  justify-content: center;
  gap: 1rem;
}

.tx-action-button {
  padding: 0.75rem 1.5rem;
  border-radius: 20px;
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-weight: 500;
  transition: background-color 0.2s;
}

.tx-action-button.explorer {
  background: #f5f5f5;
  color: #333;
}

.tx-action-button.explorer:hover {
  background: #e0e0e0;
}

.tx-action-button.resubmit {
  background: #e3f2fd;
  color: #1976d2;
}

.tx-action-button.resubmit:hover {
  background: #bbdefb;
}
</style>
