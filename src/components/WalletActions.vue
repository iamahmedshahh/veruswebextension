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
              @input="validateRecipientAddress"
            />
            <span class="validation-message" v-if="addressValidationMessage">
              {{ addressValidationMessage }}
            </span>
          </div>
          <div class="form-group">
            <label>Amount</label>
            <input 
              v-model="amount"
              type="number"
              step="0.00000001"
              placeholder="Enter amount"
              :disabled="loading"
              @input="handleAmountChange"
            />
            <span class="validation-message" v-if="amountValidationMessage">
              {{ amountValidationMessage }}
            </span>
          </div>
          <div class="fee-info" v-if="estimatedFee">
            <div>Estimated Fee: {{ estimatedFee }} {{ selectedCurrency }}</div>
            <div>Total Amount: {{ totalAmount }} {{ selectedCurrency }}</div>
          </div>
          <div class="error" v-if="error">{{ error }}</div>
          <button 
            class="send-btn"
            @click="handleSend"
            :disabled="loading || !isValidForm"
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
import { ref, computed, watch } from 'vue'
import { useStore } from 'vuex'
import { sendCurrency, estimateFee, validateAddress } from '../utils/transaction'
import CurrencyCard from './CurrencyCard.vue'
import debounce from 'lodash/debounce'

const store = useStore()
const showSendModal = ref(false)
const showReceiveModal = ref(false)
const recipientAddress = ref('')
const amount = ref('')
const selectedCurrency = ref('VRSCTEST')
const error = ref('')
const loading = ref(false)
const estimatedFee = ref(0)
const addressValidationMessage = ref('')
const amountValidationMessage = ref('')

// Computed properties
const balances = computed(() => store.state.wallet.balances)
const walletAddress = computed(() => store.state.wallet.address)
const currentBalance = computed(() => balances.value[selectedCurrency.value] || 0)

const totalAmount = computed(() => {
  if (!amount.value || !estimatedFee.value) return 0
  return (parseFloat(amount.value) + parseFloat(estimatedFee.value)).toFixed(8)
})

const isValidForm = computed(() => {
  return (
    recipientAddress.value &&
    amount.value &&
    !addressValidationMessage.value &&
    !amountValidationMessage.value &&
    parseFloat(totalAmount.value) <= currentBalance.value
  )
})

// Validation functions
async function validateRecipientAddress() {
  if (!recipientAddress.value) {
    addressValidationMessage.value = ''
    return
  }
  
  try {
    const isValid = await validateAddress(recipientAddress.value)
    addressValidationMessage.value = isValid ? '' : 'Invalid address format'
  } catch (err) {
    addressValidationMessage.value = 'Error validating address'
  }
}

async function handleAmountChange() {
  if (!amount.value) {
    amountValidationMessage.value = ''
    estimatedFee.value = 0
    return
  }

  const amountNum = parseFloat(amount.value)
  if (isNaN(amountNum) || amountNum <= 0) {
    amountValidationMessage.value = 'Invalid amount'
    return
  }

  // Check if amount exceeds balance
  if (amountNum > currentBalance.value) {
    amountValidationMessage.value = 'Insufficient balance'
    return
  }

  amountValidationMessage.value = ''
  await updateEstimatedFee()
}

const updateEstimatedFee = debounce(async () => {
  if (!amount.value || !recipientAddress.value || !store.state.wallet.address) return
  
  try {
    const fee = await estimateFee(
      store.state.wallet.address,
      recipientAddress.value,
      parseFloat(amount.value),
      selectedCurrency.value
    )
    estimatedFee.value = fee

    // Validate total amount after fee
    const total = parseFloat(amount.value) + fee
    if (total > currentBalance.value) {
      amountValidationMessage.value = 'Insufficient balance for amount + fee'
    }
  } catch (err) {
    console.error('Error estimating fee:', err)
    estimatedFee.value = 0
  }
}, 500)

async function handleSend() {
  try {
    error.value = ''
    loading.value = true
    
    // Final validation
    if (!isValidForm.value) {
      throw new Error('Please fix validation errors before sending')
    }
    
    // Get current wallet data from store
    const fromAddress = store.state.wallet.address
    const privateKey = await store.dispatch('wallet/getPrivateKey')
    
    // Send transaction
    const result = await sendCurrency(
      fromAddress,
      recipientAddress.value,
      parseFloat(amount.value),
      privateKey,
      selectedCurrency.value
    )
    
    // Update balances after successful send
    await store.dispatch('wallet/updateBalances')
    
    // Close modal and reset form
    showSendModal.value = false
    recipientAddress.value = ''
    amount.value = ''
    estimatedFee.value = 0
    
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

// Watch for modal open/close to reset form
watch(showSendModal, (newVal) => {
  if (!newVal) {
    // Reset form when modal closes
    recipientAddress.value = ''
    amount.value = ''
    error.value = ''
    estimatedFee.value = 0
    addressValidationMessage.value = ''
    amountValidationMessage.value = ''
  }
})

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

.validation-message {
  color: #f44336;
  font-size: 12px;
  margin-top: 4px;
}
</style>
