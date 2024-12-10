<script setup>
import { computed, onMounted } from 'vue';
import { useStore } from 'vuex';
import { useRoute } from 'vue-router';
import browser from 'webextension-polyfill';
import WalletDashboard from './components/WalletDashboard.vue';
import WalletSetup from './components/WalletSetup.vue';
import Login from './components/Login.vue';
import SessionService from './store/services/SessionService';

const store = useStore();
const route = useRoute();

// Computed properties from store
const isInitialized = computed(() => store.getters['wallet/isWalletInitialized']);
const hasWallet = computed(() => store.getters['wallet/hasWallet']);
const isLoggedIn = computed(() => store.getters['wallet/isLoggedIn']);
const error = computed(() => store.getters['wallet/errorMessage']);
const loading = computed(() => store.getters['wallet/isLoading']);

onMounted(async () => {
  try {
    console.log('App mounted, initializing...');
    
    // Initialize session service
    SessionService.init();
    
    // Load wallet data first
    await store.dispatch('wallet/loadWallet');
    
    // Get stored state - only wallet data from local storage
    const data = await browser.storage.local.get(['wallet', 'hasWallet']);
    console.log('Stored state:', data);
    
    if (data.wallet && data.hasWallet) {
      store.commit('wallet/setHasWallet', true);
    }
  } catch (err) {
    console.error('Error initializing app:', err);
    store.commit('wallet/setError', err.message);
  }
});
</script>

<template>
  <div class="app-container">
    <!-- Show router view for specific routes like /unlock -->
    <router-view v-if="route.name === 'unlock'"></router-view>
    
    <!-- Show normal wallet UI for other routes -->
    <template v-else>
      <div v-if="loading" class="loading">
        <div class="loading-spinner"></div>
        <div class="loading-text">Loading your wallet...</div>
      </div>
      <div v-else-if="error" class="error">
        {{ error }}
      </div>
      <div v-else class="content">
        <template v-if="hasWallet">
          <template v-if="isLoggedIn">
            <WalletDashboard />
          </template>
          <template v-else>
            <Login />
          </template>
        </template>
        <template v-else>
          <WalletSetup />
        </template>
      </div>
    </template>
  </div>
</template>

<style>
:root {
  --primary-color: #3498db;
  --secondary-color: #2ecc71;
  --background-color: #f8f9fa;
  --text-color: #2c3e50;
  --border-color: #e2e8f0;
  --extension-width: 360px;
  --extension-height: 600px;
  --error-color: #ef4444;
  --warning-color: #f1c40f;
  --input-background: #f3f4f6;
}

body {
  margin: 0;
  padding: 0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  background-color: var(--background-color);
  color: var(--text-color);
}

.app-container {
  width: var(--extension-width);
  height: var(--extension-height);
  overflow-y: auto;
  background-color: white;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.loading {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  height: 100%;
  padding: 2rem;
}

.loading-spinner {
  width: 40px;
  height: 40px;
  border: 3px solid var(--border-color);
  border-top-color: var(--primary-color);
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-bottom: 1rem;
}

.loading-text {
  font-size: 1.1rem;
  color: var(--text-color);
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.error {
  padding: 1rem;
  margin: 1rem;
  background-color: #fee2e2;
  border: 1px solid var(--error-color);
  border-radius: 0.375rem;
  color: #991b1b;
}

.content {
  height: 100%;
}

/* Common form styles */
.form-group {
  margin-bottom: 1rem;
}

.form-input {
  width: 100%;
  padding: 0.75rem;
  border: 1px solid var(--border-color);
  border-radius: 0.375rem;
  background: var(--input-background);
  color: var(--text-color);
}

.form-input:focus {
  outline: none;
  border-color: var(--primary-color);
  box-shadow: 0 0 0 2px rgba(52, 152, 219, 0.2);
}

/* Card styles */
.card {
  background: white;
  border: 1px solid var(--border-color);
  border-radius: 0.5rem;
  padding: 1.5rem;
  margin-bottom: 1rem;
}
</style>
