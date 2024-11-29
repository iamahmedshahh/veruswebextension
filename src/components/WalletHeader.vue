<script setup>
import { ref, onMounted } from 'vue'
import browser from 'webextension-polyfill'
import VerusLogo from '../assets/verus-logo.svg'

const props = defineProps({
  isLocked: {
    type: Boolean,
    required: true
  }
})

const isConnected = ref(false)
const networkName = ref('Verus Testnet')

// Check connection status
onMounted(async () => {
  try {
    const port = browser.runtime.connect({ name: 'popup' });
    port.postMessage({ type: 'VERUS_CHECK_CONNECTION' });
    
    port.onMessage.addListener((response) => {
      if (response.type === 'CONNECTION_STATUS') {
        isConnected.value = response.connected;
      }
    });
  } catch (error) {
    console.error('Failed to check connection:', error);
    isConnected.value = false;
  }
});
</script>

<template>
  <header class="wallet-header">
    <div class="logo-container">
      <img :src="VerusLogo" alt="Verus Logo" class="logo" />
      <span class="wallet-name">Verus Wallet</span>
    </div>
    <div class="status-container">
      <div class="network-status">
        <span class="status-dot" :class="{ 'connected': isConnected }"></span>
        {{ networkName }}
      </div>
      <div class="lock-status">
        <i class="fas" :class="isLocked ? 'fa-lock' : 'fa-lock-open'"></i>
      </div>
    </div>
  </header>
</template>

<style scoped>
.wallet-header {
  padding: 1rem;
  border-bottom: 1px solid var(--border-color);
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: white;
}

.logo-container {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.logo {
  width: 24px;
  height: 24px;
}

.wallet-name {
  font-weight: 600;
  font-size: 1.1rem;
}

.status-container {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.network-status {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.9rem;
  color: var(--text-color);
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #e74c3c;
}

.status-dot.connected {
  background: var(--secondary-color);
}

.lock-status {
  color: var(--text-color);
  cursor: pointer;
}

.lock-status:hover {
  color: var(--primary-color);
}
</style>
