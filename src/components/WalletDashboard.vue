<template>
  <div class="wallet-dashboard">
    <div class="header">
      <h1>Verus Wallet</h1>
      <div class="header-actions">
        <button @click="showSettings = true" class="btn btn-secondary">Settings</button>
        <button @click="logout" class="btn btn-secondary">Logout</button>
      </div>
    </div>

    <div class="card balance-card">
      <h2>Balance</h2>
      <div class="balance-amount">
        {{ formattedBalance }} <span class="balance-currency">VRSC</span>
      </div>
    </div>

    <div class="actions">
      <button @click="showSendModal = true" class="btn btn-primary">Send</button>
      <button @click="showReceiveModal = true" class="btn btn-secondary">Receive</button>
    </div>

    <div class="card address-card">
      <h3>Your Address</h3>
      <div class="address-container" @click="copyAddress">
        {{ address }}
        <span class="copy-icon">📋</span>
      </div>
    </div>

    <!-- Send Modal -->
    <div v-if="showSendModal" class="modal">
      <div class="modal-content">
        <h2>Send VRSC</h2>
        <form @submit.prevent="sendTransaction">
          <div class="form-group">
            <label>Recipient Address</label>
            <input v-model="sendForm.to" type="text" required class="form-input" />
          </div>
          <div class="form-group">
            <label>Amount (VRSC)</label>
            <input v-model="sendForm.amount" type="number" step="0.00000001" required class="form-input" />
          </div>
          <div class="modal-actions">
            <button type="button" @click="showSendModal = false" class="btn btn-secondary">Cancel</button>
            <button type="submit" class="btn btn-primary" :disabled="sending">Send</button>
          </div>
        </form>
      </div>
    </div>

    <!-- Receive Modal -->
    <div v-if="showReceiveModal" class="modal">
      <div class="modal-content">
        <h2>Receive VRSC</h2>
        <div class="qr-code">
          <!-- Add QR code component here -->
        </div>
        <div class="address-container" @click="copyAddress">
          {{ address }}
          <span class="copy-icon">📋</span>
        </div>
        <div class="modal-actions">
          <button @click="showReceiveModal = false" class="btn btn-secondary">Close</button>
        </div>
      </div>
    </div>

    <!-- Settings Modal -->
    <div v-if="showSettings" class="modal">
      <div class="modal-content settings-modal">
        <Settings @close="showSettings = false" />
      </div>
    </div>
  </div>
</template>

<script>
import { ref, computed } from 'vue';
import { useStore } from 'vuex';
import Settings from './Settings.vue';

export default {
  name: 'WalletDashboard',
  components: {
    Settings
  },
  
  setup() {
    const store = useStore();
    const showSendModal = ref(false);
    const showReceiveModal = ref(false);
    const showSettings = ref(false);
    const sending = ref(false);
    const sendForm = ref({
      to: '',
      amount: ''
    });

    const address = computed(() => store.getters['wallet/currentAddress']);
    const balance = computed(() => store.getters['wallet/currentBalance']);
    
    const formattedBalance = computed(() => {
      if (balance.value === null) return '0.00000000';
      return (balance.value / 100000000).toFixed(8);
    });

    async function copyAddress() {
      try {
        await navigator.clipboard.writeText(address.value);
        // TODO: Show success toast
      } catch (error) {
        console.error('Failed to copy address:', error);
      }
    }

    async function sendTransaction() {
      if (!sendForm.value.to || !sendForm.value.amount) return;
      
      try {
        sending.value = true;
        // TODO: Implement send transaction
        await store.dispatch('wallet/sendTransaction', {
          to: sendForm.value.to,
          amount: parseFloat(sendForm.value.amount)
        });
        showSendModal.value = false;
        sendForm.value = { to: '', amount: '' };
      } catch (error) {
        console.error('Failed to send transaction:', error);
      } finally {
        sending.value = false;
      }
    }

    async function logout() {
      try {
        await store.dispatch('wallet/logout');
      } catch (error) {
        console.error('Failed to logout:', error);
      }
    }

    return {
      address,
      formattedBalance,
      showSendModal,
      showReceiveModal,
      showSettings,
      sendForm,
      sending,
      copyAddress,
      sendTransaction,
      logout
    };
  }
};
</script>

<style scoped>
.wallet-dashboard {
  padding: 1.5rem;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 2rem;
}

.header-actions {
  display: flex;
  gap: 1rem;
}

.header h1 {
  margin: 0;
  font-size: 1.5rem;
}

.balance-card {
  text-align: center;
  margin-bottom: 2rem;
}

.balance-amount {
  font-size: 2.5rem;
  font-weight: 600;
  margin: 1rem 0;
}

.balance-currency {
  font-size: 1rem;
  opacity: 0.7;
}

.actions {
  display: flex;
  gap: 1rem;
  margin-bottom: 2rem;
}

.actions button {
  flex: 1;
}

.address-card {
  margin-bottom: 1rem;
}

.address-card h3 {
  margin-bottom: 0.5rem;
}

.address-container {
  font-family: monospace;
  background: var(--input-background);
  padding: 1rem;
  border-radius: 0.375rem;
  word-break: break-all;
  cursor: pointer;
  position: relative;
}

.copy-icon {
  position: absolute;
  right: 1rem;
  top: 50%;
  transform: translateY(-50%);
}

.modal {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}

.modal-content {
  background: white;
  border-radius: 0.5rem;
  width: 90%;
  max-width: 600px;
  max-height: 90vh;
  overflow-y: auto;
  position: relative;
}

.settings-modal {
  width: 100%;
  max-width: 100%;
  height: 100%;
  max-height: 100vh;
  margin: 0;
  border-radius: 0;
  overflow: hidden;
}

@media (min-width: 768px) {
  .settings-modal {
    width: 90%;
    max-width: 600px;
    height: auto;
    max-height: 90vh;
    margin: 2rem auto;
    border-radius: 0.5rem;
  }
}

.qr-code {
  display: flex;
  justify-content: center;
  margin: 2rem 0;
  padding: 1rem;
  background: white;
}

.modal-actions {
  display: flex;
  gap: 1rem;
  margin-top: 1.5rem;
}
</style>
