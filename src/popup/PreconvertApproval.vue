<template>
  <div class="preconvert-approval">
    <header class="header">
      <h1>Approve Currency Conversion</h1>
      <div class="origin" v-if="origin">{{ origin }}</div>
    </header>

    <div class="transaction-details" v-if="transactionData">
      <div class="amount-section">
        <div class="from-amount">
          <span class="label">From:</span>
          <span class="amount">{{ transactionData.amount }}</span>
          <span class="currency">{{ transactionData.fromCurrency }}</span>
        </div>
        <div class="arrow">→</div>
        <div class="to-amount">
          <span class="label">To:</span>
          <span class="currency">{{ transactionData.toCurrency }}</span>
        </div>
      </div>

      <div class="via-section">
        <span class="label">Via Basket:</span>
        <span class="basket">{{ transactionData.via || 'SPORTS' }}</span>
      </div>

      <div class="memo-section" v-if="transactionData.memo">
        <span class="label">Memo:</span>
        <span class="memo">{{ transactionData.memo }}</span>
      </div>
    </div>

    <div class="actions">
      <button 
        class="approve-btn" 
        @click="handleApprove" 
        :disabled="loading"
      >
        {{ loading ? 'Processing...' : 'Approve' }}
      </button>
      <button 
        class="reject-btn" 
        @click="handleReject"
        :disabled="loading"
      >
        Reject
      </button>
    </div>

    <div class="error" v-if="error">
      {{ error }}
    </div>
  </div>
</template>

<script>
import { ref, onMounted } from 'vue';
import { useRoute } from 'vue-router';

export default {
  name: 'PreconvertApproval',
  setup() {
    const route = useRoute();
    const transactionData = ref(null);
    const loading = ref(false);
    const error = ref('');
    const origin = ref('');

    onMounted(async () => {
      try {
        // Get request data from storage
        const { requestId } = route.query;
        const data = await chrome.storage.local.get([`preconvertRequest_${requestId}`]);
        transactionData.value = data[`preconvertRequest_${requestId}`];
        origin.value = transactionData.value?.origin;
      } catch (err) {
        error.value = 'Failed to load transaction details';
        console.error('Error loading transaction:', err);
      }
    });

    const handleApprove = async () => {
      try {
        loading.value = true;
        error.value = '';
        
        const response = await chrome.runtime.sendMessage({
          type: 'VERUS_PRECONVERT_APPROVE',
          payload: {
            requestId: route.query.requestId
          }
        });

        if (!response.success) {
          throw new Error(response.error || 'Transaction failed');
        }

        // Close the popup after successful approval
        window.close();
      } catch (err) {
        error.value = err.message || 'Failed to process transaction';
        console.error('Approval error:', err);
      } finally {
        loading.value = false;
      }
    };

    const handleReject = async () => {
      try {
        const response = await chrome.runtime.sendMessage({
          type: 'VERUS_PRECONVERT_REJECT',
          payload: {
            requestId: route.query.requestId
          }
        });

        // Close the popup after rejection
        window.close();
      } catch (err) {
        error.value = 'Failed to reject transaction';
        console.error('Rejection error:', err);
      }
    };

    return {
      transactionData,
      loading,
      error,
      origin,
      handleApprove,
      handleReject
    };
  }
};
</script>

<style scoped>
.preconvert-approval {
  padding: 20px;
  max-width: 400px;
  margin: 0 auto;
}

.header {
  text-align: center;
  margin-bottom: 24px;
}

.header h1 {
  font-size: 1.5rem;
  margin-bottom: 8px;
}

.origin {
  color: #666;
  font-size: 0.9rem;
}

.transaction-details {
  background: #f5f5f5;
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 24px;
}

.amount-section {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.from-amount, .to-amount {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.arrow {
  color: #666;
  font-size: 1.2rem;
}

.via-section, .memo-section {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid #ddd;
}

.label {
  color: #666;
  font-size: 0.9rem;
  margin-right: 8px;
}

.amount, .currency {
  font-weight: 500;
}

.actions {
  display: flex;
  gap: 12px;
}

button {
  flex: 1;
  padding: 12px;
  border-radius: 6px;
  border: none;
  font-weight: 500;
  cursor: pointer;
  transition: background-color 0.2s;
}

button:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.approve-btn {
  background-color: #4CAF50;
  color: white;
}

.approve-btn:hover:not(:disabled) {
  background-color: #45a049;
}

.reject-btn {
  background-color: #f44336;
  color: white;
}

.reject-btn:hover:not(:disabled) {
  background-color: #da190b;
}

.error {
  margin-top: 16px;
  color: #f44336;
  text-align: center;
  font-size: 0.9rem;
}
</style>
