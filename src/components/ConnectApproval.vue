<template>
  <div class="connect-approval">
    <div class="header">
      <h2>Connect to Site</h2>
      <div class="site-info">
        <img :src="favicon || defaultFavicon" class="site-favicon" />
        <span class="site-origin">{{ origin }}</span>
      </div>
    </div>

    <div class="content">
      <p>This site is requesting to:</p>
      <ul class="permissions">
        <li>
          <i class="fas fa-wallet"></i>
          View your wallet address
        </li>
        <li>
          <i class="fas fa-signature"></i>
          Request transaction signatures
        </li>
      </ul>
    </div>

    <div class="actions">
      <button class="reject-btn" @click="reject">
        Reject
      </button>
      <button class="approve-btn" @click="approve">
        Connect
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import browser from 'webextension-polyfill'
import defaultFavicon from '../assets/default-favicon.svg'

const route = useRoute()
const origin = ref('')
const favicon = ref(null)

onMounted(async () => {
  // Get origin from URL params
  const params = new URLSearchParams(window.location.hash.slice(1))
  origin.value = decodeURIComponent(params.get('origin') || '')
  
  // Try to get favicon
  try {
    const tabs = await browser.tabs.query({ url: origin.value + '/*' })
    if (tabs[0]?.favIconUrl) {
      favicon.value = tabs[0].favIconUrl
    }
  } catch (error) {
    console.error('Failed to get favicon:', error)
  }
})

const approve = async () => {
  // Send approval message
  await browser.runtime.sendMessage({
    type: 'CONNECT_RESPONSE',
    origin: origin.value,
    approved: true
  })
  window.close()
}

const reject = async () => {
  // Send rejection message
  await browser.runtime.sendMessage({
    type: 'CONNECT_RESPONSE',
    origin: origin.value,
    approved: false
  })
  window.close()
}
</script>

<style scoped>
.connect-approval {
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.header {
  text-align: center;
}

.header h2 {
  margin: 0 0 1rem;
  font-size: 1.5rem;
}

.site-info {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 0.5rem;
  background: var(--card-bg);
  border-radius: 0.5rem;
}

.site-favicon {
  width: 16px;
  height: 16px;
  object-fit: contain;
}

.site-origin {
  font-size: 1rem;
  font-weight: 500;
}

.content {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.content p {
  margin: 0;
  font-size: 1rem;
  color: var(--text-secondary);
}

.permissions {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.permissions li {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.9rem;
}

.permissions i {
  color: var(--primary-color);
}

.actions {
  display: flex;
  gap: 1rem;
}

button {
  flex: 1;
  padding: 0.75rem;
  border: none;
  border-radius: 0.5rem;
  font-size: 1rem;
  font-weight: 500;
  cursor: pointer;
  transition: background-color 0.2s;
}

.reject-btn {
  background: var(--error-bg);
  color: var(--error-color);
}

.approve-btn {
  background: var(--primary-color);
  color: white;
}

.reject-btn:hover {
  background: var(--error-bg-hover);
}

.approve-btn:hover {
  filter: brightness(1.1);
}
</style>
