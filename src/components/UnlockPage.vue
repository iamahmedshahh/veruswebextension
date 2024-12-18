<template>
  <div class="unlock-page">
    <h2>Unlock Wallet</h2>
    <form @submit.prevent="handleUnlock">
      <div class="form-group">
        <label for="password">Password</label>
        <input 
          type="password" 
          id="password" 
          v-model="password"
          required
          placeholder="Enter your wallet password"
          :disabled="isLoading"
        >
      </div>
      <div class="error" v-if="error">{{ error }}</div>
      <button type="submit" :disabled="isLoading">
        {{ isLoading ? 'Unlocking...' : 'Unlock' }}
      </button>
    </form>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import browser from 'webextension-polyfill';

const router = useRouter();
const route = useRoute();

const password = ref('');
const error = ref('');
const isLoading = ref(false);
const requestId = ref(null);
const origin = ref(null);

onMounted(() => {
  requestId.value = route.query.requestId;
  origin.value = route.query.origin;
  console.log('Request ID:', requestId.value, 'Origin:', origin.value);
});

async function handleUnlock() {
  if (isLoading.value) return;
  
  isLoading.value = true;
  error.value = '';
  
  try {
    console.log('Unlocking wallet...');
    
    // Send unlock request to background script
    const response = await browser.runtime.sendMessage({
      type: 'UNLOCK_REQUEST',
      password: password.value
    });
    
    if (!response.success) {
      throw new Error(response.error || 'Failed to unlock wallet');
    }
    
    // If this was part of a connection request, redirect to approval
    if (requestId.value && origin.value) {
      router.push({
        name: 'approve',
        query: { 
          requestId: requestId.value,
          origin: origin.value
        }
      });
    } else {
      // Close the popup if it was just a normal unlock
      window.close();
    }
  } catch (err) {
    console.error('Unlock error:', err);
    error.value = err.message || 'Failed to unlock wallet';
  } finally {
    isLoading.value = false;
  }
}
</script>

<style scoped>
.unlock-page {
  padding: 1.5rem;
}

.form-group {
  margin-bottom: 1rem;
}

label {
  display: block;
  margin-bottom: 0.5rem;
  color: #374151;
}

input {
  width: 100%;
  padding: 0.5rem;
  border: 1px solid #d1d5db;
  border-radius: 0.375rem;
  margin-bottom: 1rem;
}

button {
  width: 100%;
  padding: 0.75rem;
  background-color: #3b82f6;
  color: white;
  border: none;
  border-radius: 0.375rem;
  cursor: pointer;
}

button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.error {
  color: #dc2626;
  margin-bottom: 1rem;
  font-size: 0.875rem;
}
</style>
