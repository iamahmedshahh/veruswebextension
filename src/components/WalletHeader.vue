<template>
  <header class="wallet-header">
    <div class="logo-container">
      <img :src="VerusLogo" alt="Verus Logo" class="logo" />
      <span class="wallet-name">Verus Wallet</span>
    </div>
    <div class="actions-container">
      <div class="network-status">
        <span class="status-dot" :class="{ 'connected': isConnected }"></span>
        {{ networkName }}
      </div>
      <div class="icon-buttons">
        <div 
          class="icon-wrapper"
          @click="showConnectedSites"
          title="Connected Sites"
        >
          <i class="fas fa-link"></i>
        </div>
        <div 
          class="icon-wrapper"
          :class="{ 'disconnected': !isConnected }"
          @click="checkConnection"
          :title="isConnected ? 'Connected' : 'Not Connected'"
        >
          <i class="fas fa-globe"></i>
        </div>
        <div 
          class="icon-wrapper"
          @click="toggleLock"
          :title="isLocked ? 'Unlock Wallet' : 'Lock Wallet'"
        >
          <i class="fas" :class="isLocked ? 'fa-lock' : 'fa-lock-open'"></i>
        </div>
        <div 
          class="icon-wrapper"
          @click="$emit('settings-click')"
          title="Settings"
        >
          <i class="fas fa-cog"></i>
        </div>
        <div 
          class="icon-wrapper donate-icon"
          @click="showDonateModal = true"
          title="Donate"
        >
          <i class="fas fa-heart"></i>
        </div>
      </div>
    </div>

    <!-- Connected Sites Component -->
    <ConnectedSites ref="connectedSitesRef" />

    <!-- Donate Modal -->
    <div v-if="showDonateModal" class="modal">
      <div class="modal-content">
        <div class="modal-header">
          <h3>Support Verus Development</h3>
          <div class="close-icon" @click="showDonateModal = false">
            <i class="fas fa-times"></i>
          </div>
        </div>
        <div class="modal-body">
          <p>Thank you for considering a donation to support Verus development!</p>
          <div class="donate-address">
            <span class="label">VRSC and KMD Address:</span>
            <div class="address-container">
              <code>{{ donateAddress }}</code>
              <div class="copy-icon" @click="copyDonateAddress" title="Copy Address">
                <i class="fas fa-copy"></i>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </header>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue'
import { useStore } from 'vuex'
import browser from 'webextension-polyfill'
import VerusLogo from '../assets/verus-logo.svg'
import ConnectedSites from './ConnectedSites.vue'

const store = useStore()
const isConnected = ref(false)
const networkName = ref('Verus Testnet')
const showDonateModal = ref(false)
const donateAddress = 'RRQHGqgKivuwvWgeWAvTnGg5VJr1aWNRx5'
const connectedSitesRef = ref(null)

const props = defineProps({
  isLocked: {
    type: Boolean,
    required: true
  }
})

async function checkConnection() {
  try {
    const connected = await store.dispatch('wallet/checkConnection')
    isConnected.value = connected
  } catch (error) {
    console.error('Connection check failed:', error)
    isConnected.value = false
  }
}

function toggleLock() {
  if (props.isLocked) {
    store.dispatch('wallet/unlock')
  } else {
    store.dispatch('wallet/lock')
  }
}

function showConnectedSites() {
  connectedSitesRef.value?.open()
}

async function copyDonateAddress() {
  try {
    await navigator.clipboard.writeText(donateAddress)
    // You could add a toast notification here
    console.log('Donate address copied!')
  } catch (error) {
    console.error('Failed to copy address:', error)
  }
}

// Initial connection check
onMounted(async () => {
  await checkConnection()
  // Check connection every 30 seconds
  setInterval(checkConnection, 30000)
})
</script>

<style scoped>
.wallet-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.75rem 1rem;
  background: var(--background-color);
  border-bottom: 1px solid var(--border-color);
}

.logo-container {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.logo {
  height: 24px;
  width: auto;
}

.wallet-name {
  font-weight: 600;
  font-size: 1.125rem;
}

.actions-container {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.network-status {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.875rem;
  color: var(--text-color);
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--error-color);
}

.status-dot.connected {
  background: var(--success-color);
}

.icon-buttons {
  display: flex;
  gap: 0.5rem;
}

.icon-wrapper {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s ease;
  color: var(--text-color);
}

.icon-wrapper:hover {
  background: var(--hover-color);
  color: var(--primary-color);
}

.icon-wrapper.disconnected {
  color: var(--error-color);
}

.donate-icon {
  color: var(--accent-color);
}

.donate-icon:hover {
  color: var(--accent-color-hover);
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
  border-radius: 8px;
  width: 90%;
  max-width: 480px;
  padding: 1.5rem;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}

.modal-header h3 {
  margin: 0;
  font-size: 1.25rem;
}

.close-icon {
  cursor: pointer;
  padding: 0.5rem;
  margin: -0.5rem;
  border-radius: 4px;
  transition: background-color 0.2s;
}

.close-icon:hover {
  background: var(--hover-color);
}

.modal-body {
  color: var(--text-color);
}

.donate-address {
  margin-top: 1rem;
}

.label {
  display: block;
  font-size: 0.875rem;
  color: var(--text-color-light);
  margin-bottom: 0.5rem;
}

.address-container {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  background: var(--input-background);
  padding: 0.75rem;
  border-radius: 4px;
}

.address-container code {
  flex: 1;
  font-family: monospace;
  font-size: 0.875rem;
}

.copy-icon {
  cursor: pointer;
  padding: 0.25rem;
  border-radius: 4px;
  transition: all 0.2s ease;
}

.copy-icon:hover {
  background: var(--hover-color);
  color: var(--primary-color);
}

:root {
  --accent-color: #ff6b6b;
  --accent-color-hover: #ff5252;
  --hover-color: rgba(0, 0, 0, 0.05);
  --text-color-light: #666;
}
</style>
