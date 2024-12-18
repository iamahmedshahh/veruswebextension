<template>
  <div class="wallet-actions">
    <!-- Currency Cards -->
    <div class="currency-list">
      <CurrencyCard
        v-for="(balance, currency) in balances"
        :key="currency"
        :currency="currency"
        :balance="balance"
        @send="handleSendCurrency"
        @receive="handleReceiveCurrency"
      />
    </div>

    <!-- Send Modal -->
    <div v-if="showSendModal" class="modal">
      <div class="modal-content">
        <div class="modal-header">
          <h3>Send {{ selectedCurrency }}</h3>
          <button class="close-btn" @click="showSendModal = false">×</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>Recipient Address</label>
            <input 
              v-model="recipientAddress"
              type="text"
              placeholder="Enter recipient address"
              :disabled="loading"
            />
          </div>
          <div class="form-group">
            <label>Amount</label>
            <input 
              v-model="amount"
              type="number"
              step="0.00000001"
              placeholder="Enter amount"
              :disabled="loading"
            />
          </div>
          <div class="fee-info" v-if="estimatedFee">
            Estimated Fee: {{ estimatedFee }} {{ selectedCurrency }}
          </div>
          <div class="error" v-if="error">{{ error }}</div>
          <button 
            class="send-btn"
            @click="handleSend"
            :disabled="loading || !recipientAddress || !amount"
          >
            <i class="fas fa-spinner fa-spin" v-if="loading"></i>
            <span v-else>Send</span>
          </button>
        </div>
      </div>
    </div>

    <!-- Receive Modal -->
    <div v-if="showReceiveModal" class="modal">
      <div class="modal-content">
        <div class="modal-header">
          <h3>Receive {{ selectedCurrency }}</h3>
          <button class="close-btn" @click="showReceiveModal = false">×</button>
        </div>
        <div class="modal-body">
          <div class="qr-code">
            <!-- Add QR code component here -->
          </div>
          <div class="address-display">
            <p>Your Address:</p>
            <div class="address-box">
              <span>{{ walletAddress }}</span>
              <button class="copy-btn" @click="copyAddress">
                <i class="fas fa-copy"></i>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useStore } from 'vuex'
import { sendCurrency, estimateFee, validateAddress } from '../utils/transaction'
import CurrencyCard from './CurrencyCard.vue'

const store = useStore()
const showSendModal = ref(false)
const showReceiveModal = ref(false)
const recipientAddress = ref('')
const amount = ref('')
const selectedCurrency = ref('VRSCTEST')
const error = ref('')
const loading = ref(false)
const estimatedFee = ref(0)

// Computed properties
const balances = computed(() => store.state.wallet.balances)
const walletAddress = computed(() => store.state.wallet.address)

// Handle send currency button click
function handleSendCurrency(currency) {
  selectedCurrency.value = currency
  showSendModal.value = true
}

// Handle receive currency button click
function handleReceiveCurrency(currency) {
  selectedCurrency.value = currency
  showReceiveModal.value = true
}

// Copy address to clipboard
async function copyAddress() {
  try {
    await navigator.clipboard.writeText(walletAddress.value)
    store.commit('notification/show', {
      type: 'success',
      message: 'Address copied to clipboard'
    })
  } catch (err) {
    store.commit('notification/show', {
      type: 'error',
      message: 'Failed to copy address'
    })
  }
}

async function handleSend() {
  try {
    error.value = ''
    loading.value = true
    
    // Validate inputs
    if (!validateAddress(recipientAddress.value)) {
      throw new Error('Invalid recipient address')
    }
    
    const amountNum = parseFloat(amount.value)
    if (isNaN(amountNum) || amountNum <= 0) {
      throw new Error('Invalid amount')
    }
    
    // Get current wallet data from store
    const fromAddress = store.state.wallet.address
    const privateKey = await store.dispatch('wallet/getPrivateKey')
    
    // Send transaction
    const result = await sendCurrency(
      fromAddress,
      recipientAddress.value,
      amountNum,
      privateKey,
      selectedCurrency.value
    )
    
    // Update balances after successful send
    await store.dispatch('wallet/updateBalances')
    
    // Close modal and reset form
    showSendModal.value = false
    recipientAddress.value = ''
    amount.value = ''
    
    // Show success notification
    store.commit('notification/show', {
      type: 'success',
      message: `Transaction sent successfully! TXID: ${result.txid}`
    })
    
  } catch (err) {
    error.value = err.message
    store.commit('notification/show', {
      type: 'error',
      message: `Failed to send transaction: ${err.message}`
    })
  } finally {
    loading.value = false
  }
}

async function updateEstimatedFee() {
  if (!amount.value || !store.state.wallet.address) return
  
  try {
    const fee = await estimateFee(
      store.state.wallet.address,
      parseFloat(amount.value),
      selectedCurrency.value
    )
    estimatedFee.value = fee
  } catch (err) {
    console.error('Error estimating fee:', err)
  }
}

// Watch amount changes to update fee estimation
import { watch } from 'vue'
watch(amount, updateEstimatedFee)
watch(selectedCurrency, updateEstimatedFee)
</script>

<style scoped>
.wallet-actions {
  padding: 16px;
}

.currency-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.modal {
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

.modal-content {
  background: white;
  border-radius: 12px;
  width: 90%;
  max-width: 400px;
}

.modal-header {
  padding: 16px;
  border-bottom: 1px solid #eee;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.modal-header h3 {
  margin: 0;
}

.close-btn {
  background: none;
  border: none;
  font-size: 24px;
  cursor: pointer;
  color: #666;
}

.modal-body {
  padding: 16px;
}

.form-group {
  margin-bottom: 16px;
}

.form-group label {
  display: block;
  margin-bottom: 8px;
  color: #666;
}

.form-group input {
  width: 100%;
  padding: 8px;
  border: 1px solid #ddd;
  border-radius: 4px;
}

.fee-info {
  margin-bottom: 16px;
  color: #666;
  font-size: 14px;
}

.error {
  color: #f44336;
  margin-bottom: 16px;
  font-size: 14px;
}

.send-btn {
  width: 100%;
  padding: 12px;
  background: #4CAF50;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

.send-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.address-display {
  margin-top: 16px;
}

.address-box {
  display: flex;
  align-items: center;
  gap: 8px;
  background: #f5f5f5;
  padding: 8px;
  border-radius: 4px;
}

.address-box span {
  flex: 1;
  word-break: break-all;
}

.copy-btn {
  background: none;
  border: none;
  color: #2196F3;
  cursor: pointer;
  padding: 4px;
}

.copy-btn:hover {
  color: #1976D2;
}
</style>
