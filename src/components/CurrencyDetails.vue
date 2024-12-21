<template>
  <div class="currency-details">
    <div class="header">
      <button class="back-button" @click="$router.go(-1)">
        <i class="fas fa-arrow-left"></i>
      </button>
      <h2>{{ currency }}</h2>
    </div>

    <div class="balance-card">
      <div class="total-balance">
        <span class="label">Total Balance</span>
        <span class="amount">{{ formatBalance(balance) }}</span>
      </div>
      
      <div class="action-buttons">
        <button class="action-btn send" @click="handleSend">
          <i class="fas fa-arrow-up"></i>
          Send
        </button>
        <button class="action-btn receive" @click="handleReceive">
          <i class="fas fa-arrow-down"></i>
          Receive
        </button>
      </div>
    </div>

    <TransactionHistory :currency="currency" class="transactions" />

    <!-- Send Modal -->
    <div v-if="showSendModal" class="modal-overlay">
      <div class="modal-container send-modal">
        <div class="send-modal-header">
          <h3>Send {{ currency }}</h3>
          <button class="close-button" @click="showSendModal = false">&times;</button>
        </div>
        <form @submit.prevent="executeSend" class="send-form">
          <div class="form-group">
            <label for="recipient">Recipient Address</label>
            <input
              id="recipient"
              v-model="recipientAddress"
              type="text"
              placeholder="Enter recipient's address"
              required
            />
          </div>
          <div class="form-group">
            <label for="amount">Amount</label>
            <input
              id="amount"
              v-model="amount"
              type="number"
              step="0.00000001"
              placeholder="Enter amount"
              required
            />
          </div>
          <div v-if="error" class="error-message">{{ error }}</div>
          <div class="estimated-fee" v-if="estimatedFee">
            Estimated Fee: {{ estimatedFee }}
          </div>
          <button type="submit" class="submit-button" :disabled="isLoading">
            {{ isLoading ? 'Sending...' : 'Send' }}
          </button>
        </form>
      </div>
    </div>

    <!-- Receive Modal -->
    <div v-if="showReceiveModal" class="modal-overlay">
      <div class="modal-container receive-modal">
        <div class="modal-header">
          <h3>Receive {{ currency }}</h3>
          <button class="close-button" @click="showReceiveModal = false">&times;</button>
        </div>
        <div class="qr-container" v-if="receiveQrCode">
          <img :src="receiveQrCode" alt="QR Code" />
        </div>
        <div class="address-container">
          <p class="address-label">Your Address:</p>
          <div class="address-value">
            <span class="address">{{ address }}</span>
            <button class="copy-button" @click="copyToClipboard(address)">
              📋
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useStore } from 'vuex'
import { useRoute } from 'vue-router'
import TransactionHistory from './TransactionHistory.vue'
import QRCode from 'qrcode'

const store = useStore()
const route = useRoute()

// State
const showSendModal = ref(false)
const showReceiveModal = ref(false)
const recipientAddress = ref('')
const amount = ref('')
const error = ref('')
const isLoading = ref(false)
const estimatedFee = ref(0)
const receiveQrCode = ref('')

// Computed
const currency = computed(() => route.params.currency)
const balances = computed(() => store.state.currencies.balances)
const balance = computed(() => balances.value[currency.value] || 0)
const address = computed(() => store.state.wallet.address)

// Methods
const formatBalance = (amount) => {
  return amount.toLocaleString(undefined, { 
    minimumFractionDigits: 2, 
    maximumFractionDigits: 8 
  }) + ` ${currency.value}`
}

const handleSend = () => {
  showSendModal.value = true
}

const handleReceive = async () => {
  showReceiveModal.value = true
  try {
    receiveQrCode.value = await QRCode.toDataURL(address.value)
  } catch (err) {
    console.error('Error generating QR code:', err)
  }
}

const executeSend = async () => {
  if (!recipientAddress.value || !amount.value) {
    error.value = 'Please fill in all fields'
    return
  }

  try {
    isLoading.value = true
    error.value = ''
    
    // TODO: Implement actual send transaction
    await new Promise(resolve => setTimeout(resolve, 1000)) // Simulated delay
    
    showSendModal.value = false
    recipientAddress.value = ''
    amount.value = ''
  } catch (err) {
    error.value = err.message || 'Failed to send transaction'
  } finally {
    isLoading.value = false
  }
}

const copyToClipboard = async (text) => {
  try {
    await navigator.clipboard.writeText(text)
  } catch (err) {
    console.error('Failed to copy:', err)
  }
}
</script>

<style scoped>
.currency-details {
  padding: 1rem;
  max-width: 800px;
  margin: 0 auto;
}

.header {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-bottom: 1.5rem;
}

.back-button {
  background: none;
  border: none;
  font-size: 1.2rem;
  cursor: pointer;
  padding: 0.5rem;
  color: var(--text-color);
}

.balance-card {
  background: white;
  border-radius: 12px;
  padding: 1.5rem;
  margin-bottom: 1.5rem;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.total-balance {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-bottom: 1.5rem;
}

.label {
  font-size: 0.9rem;
  color: var(--text-secondary);
  margin-bottom: 0.5rem;
}

.amount {
  font-size: 2rem;
  font-weight: bold;
  color: var(--text-color);
}

.action-buttons {
  display: flex;
  gap: 1rem;
  justify-content: center;
}

.action-btn {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1.5rem;
  border: none;
  border-radius: 8px;
  font-size: 1rem;
  cursor: pointer;
  transition: all 0.2s;
}

.action-btn.send {
  background: var(--primary-color);
  color: white;
}

.action-btn.receive {
  background: var(--secondary-color);
  color: white;
}

.transactions {
  margin-top: 1.5rem;
}

/* Modal Styles */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}

.modal-container {
  background: white;
  border-radius: 12px;
  padding: 1.5rem;
  width: 90%;
  max-width: 500px;
  max-height: 90vh;
  overflow-y: auto;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.5rem;
}

.close-button {
  background: none;
  border: none;
  font-size: 1.5rem;
  cursor: pointer;
  padding: 0.5rem;
}

.send-form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.form-group label {
  font-size: 0.9rem;
  color: var(--text-secondary);
}

.form-group input {
  padding: 0.75rem;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  font-size: 1rem;
}

.error-message {
  color: red;
  font-size: 0.9rem;
}

.estimated-fee {
  font-size: 0.9rem;
  color: var(--text-secondary);
}

.submit-button {
  background: var(--primary-color);
  color: white;
  padding: 0.75rem;
  border: none;
  border-radius: 8px;
  font-size: 1rem;
  cursor: pointer;
}

.submit-button:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.address-container {
  margin-top: 1rem;
}

.address-value {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  background: var(--background-color);
  padding: 0.75rem;
  border-radius: 8px;
  word-break: break-all;
}

.copy-button {
  background: none;
  border: none;
  cursor: pointer;
  padding: 0.25rem;
}

.qr-container {
  display: flex;
  justify-content: center;
  margin: 1.5rem 0;
}

.qr-container img {
  max-width: 200px;
  height: auto;
}
</style>
