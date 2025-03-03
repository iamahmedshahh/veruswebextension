<template>
  <header class="wallet-header">
    <div class="actions-container">
      <div class="network-status">
        <span class="status-dot" :class="{ 'connected': isConnected }"></span>
        <select v-model="selectedNetwork" @change="onNetworkChange" class="network-selector" :disabled="!isInitialized">
          <option v-for="(network, key) in networks" :key="key" :value="key">
            {{ network.name }}
          </option>
        </select>
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
        <div 
          class="icon-wrapper"
          @click="openGitHub"
          title="View Source Code"
        >
          <i class="fab fa-github"></i>
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
          <p>Thank you for supporting this project's development!</p>
          
          <div class="donate-tabs">
            <div 
              class="tab" 
              :class="{ active: activeTab === 'btc' }"
              @click="activeTab = 'btc'"
            >
              BTC Legacy
            </div>
            <div 
              class="tab" 
              :class="{ active: activeTab === 'segwit' }"
              @click="activeTab = 'segwit'"
            >
              BTC SegWit
            </div>
            <div 
              class="tab" 
              :class="{ active: activeTab === 'vrsc' }"
              @click="activeTab = 'vrsc'"
            >
              VRSC
            </div>
          </div>

          <div class="tab-content">
            <div v-if="activeTab === 'btc'" class="donate-section">
              <img :src="btcQrCode" alt="BTC QR Code" class="qr-code" v-if="btcQrCode" />
              <div class="donate-address">
                <div class="address-container">
                  <code>1H86CKo3877NrWKT2zwLgkLsj3PR2WJa21</code>
                  <div class="copy-icon" @click="copyAddress('btc')" title="Copy Address">
                    <i class="fas fa-copy"></i>
                  </div>
                </div>
              </div>
            </div>

            <div v-if="activeTab === 'segwit'" class="donate-section">
              <img :src="segwitQrCode" alt="BTC SegWit QR Code" class="qr-code" v-if="segwitQrCode" />
              <div class="donate-address">
                <div class="address-container">
                  <code>bc1qkrv595awwt4jgwp928vy6h47cj2s8fhsdgdrwy</code>
                  <div class="copy-icon" @click="copyAddress('segwit')" title="Copy Address">
                    <i class="fas fa-copy"></i>
                  </div>
                </div>
              </div>
            </div>

            <div v-if="activeTab === 'vrsc'" class="donate-section">
              <img :src="vrscQrCode" alt="VRSC QR Code" class="qr-code" v-if="vrscQrCode" />
              <div class="donate-address">
                <div class="address-container">
                  <code>{{ donateAddress }}</code>
                  <div class="copy-icon" @click="copyAddress('vrsc')" title="Copy Address">
                    <i class="fas fa-copy"></i>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </header>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useStore } from 'vuex'
import browser from 'webextension-polyfill'
import QRCode from 'qrcode'
import ConnectedSites from './ConnectedSites.vue'
import { NETWORKS } from '../config/networks'

const store = useStore()
const showDonateModal = ref(false)
const isConnected = computed(() => store.state.wallet.isConnected)
const isLocked = computed(() => store.state.wallet.isLocked)
const networkName = computed(() => store.getters['network/currentNetworkName'])
const donateAddress = 'RRQHGqgKivuwvWgeWAvTnGg5VJr1aWNRx5'
const connectedSitesRef = ref(null)
const activeTab = ref('vrsc')
const btcQrCode = ref(null)
const segwitQrCode = ref(null)
const vrscQrCode = ref(null)

const networks = computed(() => NETWORKS)
const selectedNetwork = computed({
  get: () => store.getters['network/currentNetwork'],
  set: (value) => store.dispatch('network/changeNetwork', value)
})
const isInitialized = computed(() => store.getters['network/isInitialized'])

onMounted(async () => {
  await store.dispatch('network/initialize')
  await checkConnection()
  // Check connection every 30 seconds
  setInterval(checkConnection, 30000)
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

async function toggleLock() {
  try {
    console.log('Toggle lock called, current state:', isLocked.value);
    if (!isLocked.value) {
      // If unlocked, lock the wallet
      console.log('Locking wallet...');
      await store.dispatch('wallet/lock');
    } else {
      // If locked, go to login
      window.location.hash = '#/login';
    }
  } catch (error) {
    console.error('Error in toggleLock:', error);
  }
}

function showConnectedSites() {
  connectedSitesRef.value?.open()
}

async function copyAddress(type) {
  const addresses = {
    btc: '1H86CKo3877NrWKT2zwLgkLsj3PR2WJa21',
    segwit: 'bc1qkrv595awwt4jgwp928vy6h47cj2s8fhsdgdrwy',
    vrsc: donateAddress
  }

  try {
    await navigator.clipboard.writeText(addresses[type])
    console.log('Address copied!')
  } catch (error) {
    console.error('Failed to copy address:', error)
  }
}

function openGitHub() {
  window.open('https://github.com/iamahmedshahh/veruswebextension', '_blank');
}

// Watch for tab changes to generate QR codes
watch([activeTab, showDonateModal], async ([newTab, isVisible]) => {
  if (isVisible) {
    await generateQRCode(newTab)
  }
})

async function generateQRCode(type) {
  const addresses = {
    btc: '1H86CKo3877NrWKT2zwLgkLsj3PR2WJa21',
    segwit: 'bc1qkrv595awwt4jgwp928vy6h47cj2s8fhsdgdrwy',
    vrsc: donateAddress
  }

  try {
    const qrCodeUrl = await QRCode.toDataURL(addresses[type], {
      width: 200,
      margin: 1,
      color: {
        dark: '#000000',
        light: '#ffffff'
      }
    })

    if (type === 'btc') {
      btcQrCode.value = qrCodeUrl
    } else if (type === 'segwit') {
      segwitQrCode.value = qrCodeUrl
    } else if (type === 'vrsc') {
      vrscQrCode.value = qrCodeUrl
    }
  } catch (error) {
    console.error('Error generating QR code:', error)
  }
}

const onNetworkChange = async (event) => {
  try {
    await store.dispatch('network/changeNetwork', event.target.value)
  } catch (error) {
    console.error('Failed to change network:', error)
    // Revert the selection
    event.target.value = store.getters['network/currentNetwork']
  }
}
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
  background: rgba(255, 255, 255, 0.1);
}

.icon-wrapper i {
  color: #000000;
  font-size: 16px;
}

.icon-wrapper:hover {
  background: var(--hover-color);
}

.icon-wrapper:hover i {
  color: var(--primary-color);
}

.icon-wrapper.disconnected i {
  color: var(--error-color);
}

.donate-icon i {
  color: var(--accent-color);
}

.donate-icon:hover i {
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

.donate-tabs {
  display: flex;
  gap: 1rem;
  margin-bottom: 1rem;
}

.tab {
  padding: 0.5rem 1rem;
  border-radius: 4px 4px 0 0;
  cursor: pointer;
  transition: background-color 0.2s;
}

.tab.active {
  background: var(--background-color);
}

.tab-content {
  padding: 1rem;
  border: 1px solid var(--border-color);
  border-radius: 0 4px 4px 4px;
}

.donate-section {
  margin-bottom: 1rem;
}

.qr-code {
  width: 200px;
  height: 200px;
  margin: 1rem auto;
  display: block;
  background: white;
  padding: 1rem;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
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

.network-selector {
  background: transparent;
  border: none;
  color: inherit;
  font-size: inherit;
  padding: 2px 5px;
  margin-left: 5px;
  border-radius: 4px;
  cursor: pointer;
}

.network-selector:focus {
  outline: none;
  background: rgba(255, 255, 255, 0.1);
}

.network-selector:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

:root {
  --accent-color: #ff6b6b;
  --accent-color-hover: #ff5252;
  --hover-color: rgba(0, 0, 0, 0.05);
  --text-color-light: #666;
}
</style>
