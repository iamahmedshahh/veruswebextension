<script setup>
import { computed, onMounted, ref } from 'vue';
import { useStore } from 'vuex';
import { useRoute } from 'vue-router';
import storage from './store/services/StorageService';
import WalletDashboard from './components/WalletDashboard.vue';
import WalletSetup from './components/WalletSetup.vue';
import Login from './components/Login.vue';

const store = useStore();
const route = useRoute();
const isPopupAction = ref(false);

// Computed properties from store
const isInitialized = computed(() => store.getters['wallet/isWalletInitialized']);
const hasWallet = computed(() => store.getters['wallet/hasWallet']);
const isLoggedIn = computed(() => store.getters['wallet/isLoggedIn']);
const error = computed(() => store.getters['wallet/errorMessage']);
const loading = computed(() => store.getters['wallet/isLoading']);
const networkInitialized = computed(() => store.getters['network/isInitialized']);

onMounted(async () => {
  try {
    console.log('App mounted, initializing...');
    
    // Check if this is opened as a popup action (no route)
    isPopupAction.value = !route.name && window.location.hash === '';
    
    // Initialize store
    await store.dispatch('initialize');
    
    // Initialize wallet state after store is initialized
    await store.dispatch('wallet/initializeState');
    
    // Load wallet data if we're logged in
    if (store.getters['wallet/isLoggedIn']) {
      await store.dispatch('wallet/loadWallet');
    }
  } catch (err) {
    console.error('Error initializing app:', err);
    store.commit('wallet/setError', err.message);
  }
});
</script>

<template>
  <div class="app-container">
    <!-- Show router view for extension popup flows -->
    <router-view v-if="route.name"></router-view>
    
    <!-- Show normal wallet UI -->
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
.app-container {
  width: 360px;
  height: 600px;
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
  border: 4px solid #f3f3f3;
  border-top: 4px solid #3498db;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-bottom: 1rem;
}

.loading-text {
  color: #666;
  font-size: 1.1rem;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.error {
  margin: 1rem;
  padding: 1rem;
  background-color: #fee2e2;
  border: 1px solid #ef4444;
  border-radius: 0.375rem;
  color: #991b1b;
}

.content {
  height: 100%;
}
</style>
