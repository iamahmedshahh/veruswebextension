<script setup>
import { computed, onMounted, onBeforeUnmount, ref, watch } from 'vue';
import { useStore } from 'vuex';
import { useRoute } from 'vue-router';
import storage from './store/services/StorageService';
import securityUtils from './utils/securityUtils';
import WalletDashboard from './components/WalletDashboard.vue';
import WalletSetup from './components/WalletSetup.vue';
import Login from './components/Login.vue';

const store = useStore();
const route = useRoute();
const isPopupAction = ref(false);
const lastActivityTime = ref(Date.now());
const inactivityCheckInterval = ref(null);
const inactivityTimeout = ref(securityUtils.SECURITY_POLICY.SESSION_TIMEOUT_MS);
const autoLockEnabled = ref(true);

// Computed properties from store
const isInitialized = computed(() => store.getters['wallet/isWalletInitialized']);
const hasWallet = computed(() => store.getters['wallet/hasWallet']);
const isLoggedIn = computed(() => store.getters['wallet/isLoggedIn']);
const error = computed(() => store.getters['wallet/errorMessage']);
const loading = computed(() => store.getters['wallet/isLoading']);
const networkInitialized = computed(() => store.getters['network/isInitialized']);

// Record user activity
const recordUserActivity = () => {
  lastActivityTime.value = Date.now();
  if (isLoggedIn.value) {
    // Extend the session when user is active
    store.dispatch('wallet/extendSession');
  }
};

// Check for inactivity and lock wallet if needed
const checkInactivity = () => {
  if (!autoLockEnabled.value || !isLoggedIn.value) return;
  
  const currentTime = Date.now();
  const inactiveTime = currentTime - lastActivityTime.value;
  
  if (inactiveTime >= inactivityTimeout.value) {
    console.log('User inactive for too long, locking wallet');
    store.dispatch('wallet/lockWallet');
  }
};

// Setup inactivity detection
const setupInactivityDetection = () => {
  // Clear any existing interval
  if (inactivityCheckInterval.value) {
    clearInterval(inactivityCheckInterval.value);
  }
  
  // Track user activity events
  window.addEventListener('mousemove', recordUserActivity);
  window.addEventListener('mousedown', recordUserActivity);
  window.addEventListener('keypress', recordUserActivity);
  window.addEventListener('touchstart', recordUserActivity);
  window.addEventListener('scroll', recordUserActivity);
  
  // Set interval to check for inactivity
  inactivityCheckInterval.value = setInterval(checkInactivity, 30000); // Check every 30 seconds
};

// Apply anti-debugging measures
const setupAntiDebugProtection = () => {
  // Initial check
  securityUtils.applyAntiDebugMeasures();
  
  // Set up periodic checks
  setInterval(() => {
    securityUtils.applyAntiDebugMeasures();
  }, 5000); // Check every 5 seconds
};

// Track when user leaves/returns to the page
const handleVisibilityChange = () => {
  if (document.visibilityState === 'visible') {
    // User returned to the page
    recordUserActivity();
  } else {
    // User left the page - this might be a good time to secure sensitive data
    if (isLoggedIn.value) {
      store.dispatch('wallet/cleanupSensitiveData');
    }
  }
};

// Clean up event listeners and intervals
const cleanupResources = () => {
  if (inactivityCheckInterval.value) {
    clearInterval(inactivityCheckInterval.value);
  }
  
  window.removeEventListener('mousemove', recordUserActivity);
  window.removeEventListener('mousedown', recordUserActivity);
  window.removeEventListener('keypress', recordUserActivity);
  window.removeEventListener('touchstart', recordUserActivity);
  window.removeEventListener('scroll', recordUserActivity);
  document.removeEventListener('visibilitychange', handleVisibilityChange);
  
  // Final cleanup of sensitive data
  if (isLoggedIn.value) {
    store.dispatch('wallet/cleanupSensitiveData');
  }
};

// Watch for changes in logged in state
watch(isLoggedIn, (newValue) => {
  if (newValue) {
    // User just logged in
    setupInactivityDetection();
    recordUserActivity();
  } else {
    // Clean up sensitive data when logged out
    store.dispatch('wallet/cleanupSensitiveData');
  }
});

onMounted(async () => {
  try {
    console.log('App mounted, initializing...');
    
    // Check if this is opened as a popup action (no route)
    isPopupAction.value = !route.name && window.location.hash === '';
    
    // Set up visibility change detection
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    // Set up inactivity detection if auto-lock is enabled
    if (autoLockEnabled.value) {
      setupInactivityDetection();
    }
    
    // Set up anti-debugging protection
    setupAntiDebugProtection();
    
    // Initialize store
    await store.dispatch('initialize');
    
    // Initialize wallet state after store is initialized
    await store.dispatch('wallet/initializeState');
    
    // Load wallet data if we're logged in
    if (store.getters['wallet/isLoggedIn']) {
      await store.dispatch('wallet/loadWallet');
      recordUserActivity(); // Record initial activity
    }

    // Load user preferences (including security settings)
    const preferences = await storage.get('userPreferences');
    if (preferences && preferences.security) {
      autoLockEnabled.value = preferences.security.autoLockEnabled !== false;
      
      // Use custom timeout if set, otherwise use default
      if (preferences.security.inactivityTimeoutMs) {
        inactivityTimeout.value = preferences.security.inactivityTimeoutMs;
      }
    }
  } catch (err) {
    console.error('Error initializing app:', err);
    store.commit('wallet/setError', err.message);
  }
});

onBeforeUnmount(() => {
  // Clean up event listeners and intervals
  cleanupResources();
});
</script>

<template>
  <div class="app-container" @click="recordUserActivity" @keydown="recordUserActivity">
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
:root {
  --primary-color: #3498db;
  --secondary-color: #2980b9;
  --background-color: #f9f9f9;
  --text-color: #333333;
  --border-color: #dddddd;
  --input-background: #f5f5f5;
  --error-color: #e74c3c;
  --warning-color: #f39c12;
  --success-color: #2ecc71;
}

*, *::before, *::after {
  box-sizing: border-box;
}

body {
  margin: 0;
  padding: 0;
  font-family: 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
  font-size: 16px;
  line-height: 1.5;
  color: var(--text-color);
  background-color: var(--background-color);
}

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
  border-top: 4px solid var(--primary-color);
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
  border: 1px solid var(--error-color);
  border-radius: 0.375rem;
  color: #991b1b;
}

.content {
  height: 100%;
}

input, button, select, textarea {
  font-family: inherit;
  font-size: inherit;
  line-height: inherit;
}

button {
  cursor: pointer;
}

button:disabled {
  cursor: not-allowed;
  opacity: 0.7;
}

/* Accessibility improvements */
:focus {
  outline: 2px solid var(--primary-color);
  outline-offset: 2px;
}

/* High contrast focus for keyboard navigation */
:focus-visible {
  outline: 3px solid var(--primary-color);
  outline-offset: 3px;
}
</style>
