<template>
  <div class="transaction-approval">
    <div v-if="loading" class="loading-container">
      <LoadingBar />
      <p>Loading transaction details...</p>
    </div>

    <div v-else-if="error" class="error-container">
      <div class="error-message">
        {{ error }}
      </div>
      <button @click="reject" class="button-danger">Close</button>
    </div>

    <div v-else class="approval-container">
      <h2>Approve Transaction</h2>
      
      <!-- Origin Info -->
      <div class="origin-info">
        <span class="origin-domain">{{ origin }}</span>
        <span class="origin-time">{{ formatTime(timestamp) }}</span>
      </div>

      <!-- Transaction Amount -->
      <div class="amount-section">
        <div class="amount-primary">
          <span class="amount">{{ amount }}</span>
          <span class="currency">{{ currency }}</span>
        </div>
        <div class="amount-details">
          <div class="fee-row">
            <span>Network Fee</span>
            <span>{{ fee }} {{ currency }}</span>
          </div>
          <div class="total-row">
            <span>Total</span>
            <span>{{ totalAmount }} {{ currency }}</span>
          </div>
        </div>
      </div>

      <!-- Balance Info -->
      <div class="balance-section" v-if="currentBalance !== null">
        <div class="balance-row">
          <span>Current Balance</span>
          <span>{{ currentBalance }} {{ currency }}</span>
        </div>
        <div class="balance-row">
          <span>Balance After</span>
          <span>{{ balanceAfter }} {{ currency }}</span>
        </div>
      </div>

      <!-- Address Details -->
      <div class="address-section">
        <div class="address-row">
          <div class="address-label">From</div>
          <div class="address-value">
            <span :class="{ 'verus-id': isFromAddressVerusId }">{{ fromAddress }}</span>
          </div>
        </div>
        <div class="address-row">
          <div class="address-label">To</div>
          <div class="address-value">
            <span :class="{ 'verus-id': isToAddressVerusId }">{{ toAddress }}</span>
            <span v-if="isNewAddress" class="new-address-warning">
              ⚠️ New Address
            </span>
          </div>
        </div>
      </div>

      <!-- Warning Messages -->
      <div v-if="warnings.length" class="warnings-section">
        <div v-for="(warning, index) in warnings" :key="index" class="warning-message">
          ⚠️ {{ warning }}
        </div>
      </div>

      <!-- Action Buttons -->
      <div class="action-buttons">
        <button 
          @click="reject" 
          class="button-secondary"
          :disabled="processing"
        >
          Reject
        </button>
        <button 
          @click="approve" 
          class="button-primary"
          :disabled="processing || !canApprove"
        >
          {{ processing ? 'Processing...' : 'Approve' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, computed, onMounted } from 'vue';
import browser from 'webextension-polyfill';
import { isVerusID, estimateFee } from '../utils/transaction';
import LoadingBar from './LoadingBar.vue';

export default {
  name: 'TransactionApproval',
  props: {
    requestId: {
      type: String,
      required: true
    },
    origin: {
      type: String,
      required: true
    }
  },
  components: {
    LoadingBar
  },
  setup(props) {
    // State
    const loading = ref(true);
    const error = ref(null);
    const processing = ref(false);
    const requestData = ref(null);
    const currentBalance = ref(null);
    const knownAddresses = ref(new Set());
    const knownOrigins = ref(new Set());
    const estimatedFee = ref(null);

    // Computed Properties
    const timestamp = computed(() => requestData.value?.timestamp || Date.now());
    const fromAddress = computed(() => requestData.value?.data?.fromAddress || '');
    const toAddress = computed(() => requestData.value?.data?.toAddress || '');
    const amount = computed(() => requestData.value?.data?.amount || 0);
    const currency = computed(() => requestData.value?.data?.currency || 'VRSCTEST');
    const fee = computed(() => estimatedFee.value);
    const totalAmount = computed(() => Number(amount.value) + Number(fee.value));
    const balanceAfter = computed(() => {
      if (currentBalance.value === null) return null;
      return Math.max(0, currentBalance.value - totalAmount.value);
    });

    const isFromAddressVerusId = computed(() => isVerusID(fromAddress.value));
    const isToAddressVerusId = computed(() => isVerusID(toAddress.value));
    const isNewAddress = computed(() => !knownAddresses.value.has(toAddress.value));
    const isKnownOrigin = computed(() => knownOrigins.value.has(origin));

    const sufficientBalance = computed(() => {
      return currentBalance.value !== null && totalAmount.value <= currentBalance.value;
    });

    const securityChecks = computed(() => {
      return isKnownOrigin.value && sufficientBalance.value;
    });

    const warnings = computed(() => {
      const msgs = [];
      if (isNewAddress.value) {
        msgs.push('You have not sent funds to this address before');
      }
      if (currentBalance.value !== null && totalAmount.value > currentBalance.value) {
        msgs.push('Insufficient balance for this transaction');
      }
      if (!isKnownOrigin.value) {
        msgs.push('Unknown origin');
      }
      return msgs;
    });

    const canApprove = computed(() => {
      return securityChecks.value && !processing.value;
    });

    // Methods
    const formatTime = (timestamp) => {
      return new Date(timestamp).toLocaleString();
    };

    const loadTransactionData = async () => {
      try {
        if (!props.requestId) {
          throw new Error('No transaction request ID provided');
        }

        // Get transaction request data from background
        const response = await browser.runtime.sendMessage({
          type: 'GET_TRANSACTION_REQUEST',
          requestId: props.requestId
        });

        if (response.error) {
          throw new Error(response.error);
        }

        requestData.value = response.request;

        // Calculate fee
        estimatedFee.value = await estimateFee(
          requestData.value.data.fromAddress,
          requestData.value.data.amount,
          requestData.value.data.currency
        );

        // Load current balance
        const balanceResponse = await browser.runtime.sendMessage({
          type: 'GET_BALANCE',
          currency: requestData.value.data.currency
        });

        if (balanceResponse.error) {
          throw new Error(balanceResponse.error);
        }

        currentBalance.value = balanceResponse.balance;

        // Load known addresses
        const addressesResponse = await browser.runtime.sendMessage({
          type: 'GET_KNOWN_ADDRESSES'
        });

        if (addressesResponse.addresses) {
          knownAddresses.value = new Set(addressesResponse.addresses);
        }

        // Load known origins
        const originsResponse = await browser.runtime.sendMessage({
          type: 'GET_CONNECTED_SITES'
        });

        if (originsResponse.sites) {
          knownOrigins.value = new Set(originsResponse.sites);
        }

        loading.value = false;
      } catch (err) {
        console.error('Failed to load transaction data:', err);
        error.value = err.message;
        loading.value = false;
      }
    };

    const approve = async () => {
      if (!canApprove.value) return;
      
      processing.value = true;
      try {
        const response = await browser.runtime.sendMessage({
          type: 'APPROVE_VERUS_TRANSACTION',
          requestId: props.requestId
        });

        if (response.error) {
          throw new Error(response.error);
        }

        // Close the popup
        window.close();
      } catch (err) {
        console.error('Failed to approve transaction:', err);
        error.value = err.message;
      } finally {
        processing.value = false;
      }
    };

    const reject = async () => {
      if (processing.value) return;
      
      try {
        if (props.requestId) {
          await browser.runtime.sendMessage({
            type: 'REJECT_VERUS_TRANSACTION',
            requestId: props.requestId
          });
        }
      } catch (err) {
        console.error('Error rejecting transaction:', err);
      }
      
      // Close the popup regardless of rejection success
      window.close();
    };

    // Lifecycle
    onMounted(() => {
      loadTransactionData();
    });

    return {
      loading,
      error,
      processing,
      origin,
      timestamp,
      fromAddress,
      toAddress,
      amount,
      currency,
      fee,
      totalAmount,
      currentBalance,
      balanceAfter,
      isFromAddressVerusId,
      isToAddressVerusId,
      isNewAddress,
      isKnownOrigin,
      sufficientBalance,
      securityChecks,
      warnings,
      canApprove,
      formatTime,
      approve,
      reject
    };
  }
};
</script>

<style scoped>
.transaction-approval {
  padding: 1rem;
  max-width: 100%;
  box-sizing: border-box;
}

.loading-container,
.error-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 200px;
  gap: 1rem;
}

.approval-container {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.origin-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.9rem;
  color: #666;
}

.amount-section {
  text-align: center;
  padding: 1rem 0;
}

.amount-primary {
  font-size: 2rem;
  font-weight: bold;
  margin-bottom: 1rem;
}

.amount-details {
  font-size: 0.9rem;
  color: #666;
}

.fee-row,
.total-row,
.balance-row {
  display: flex;
  justify-content: space-between;
  padding: 0.5rem 0;
}

.total-row {
  border-top: 1px solid #eee;
  margin-top: 0.5rem;
  padding-top: 0.5rem;
  font-weight: bold;
}

.address-section {
  background: #f8f9fa;
  border-radius: 8px;
  padding: 1rem;
}

.address-row {
  margin-bottom: 0.5rem;
}

.address-label {
  font-size: 0.8rem;
  color: #666;
  margin-bottom: 0.25rem;
}

.address-value {
  word-break: break-all;
  font-family: monospace;
}

.verus-id {
  color: #2196f3;
}

.new-address-warning {
  font-size: 0.8rem;
  color: #ff9800;
  margin-left: 0.5rem;
}

.warnings-section {
  background: #fff3e0;
  border-radius: 8px;
  padding: 1rem;
}

.warning-message {
  color: #f57c00;
  margin-bottom: 0.5rem;
}

.action-buttons {
  display: flex;
  gap: 1rem;
  margin-top: 1rem;
}

button {
  flex: 1;
  padding: 0.75rem;
  border-radius: 8px;
  border: none;
  font-weight: bold;
  cursor: pointer;
  transition: opacity 0.2s;
}

button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.button-primary {
  background: #4caf50;
  color: white;
}

.button-secondary {
  background: #f5f5f5;
  color: #333;
}

.button-danger {
  background: #f44336;
  color: white;
}

.error-message {
  color: #f44336;
  text-align: center;
}
</style>
