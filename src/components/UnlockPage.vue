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
          placeholder="Enter your password"
          required
        />
      </div>
      <button type="submit" :disabled="isLoading">
        {{ isLoading ? 'Unlocking...' : 'Unlock' }}
      </button>
      <p v-if="error" class="error">{{ error }}</p>
    </form>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import browser from 'webextension-polyfill';

const password = ref('');
const error = ref('');
const isLoading = ref(false);

const handleUnlock = async () => {
  try {
    isLoading.value = true;
    error.value = '';
    
    const response = await browser.runtime.sendMessage({
      type: 'UNLOCK_WALLET',
      password: password.value
    });
    
    if (response.error) {
      throw new Error(response.error);
    }
    
    // Close the popup after successful unlock
    window.close();
  } catch (err) {
    error.value = err.message;
  } finally {
    isLoading.value = false;
  }
};
</script>

<style scoped>
.unlock-page {
  padding: 20px;
}

.form-group {
  margin-bottom: 15px;
}

label {
  display: block;
  margin-bottom: 5px;
}

input {
  width: 100%;
  padding: 8px;
  border: 1px solid #ddd;
  border-radius: 4px;
}

button {
  width: 100%;
  padding: 10px;
  background: #4CAF50;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

button:disabled {
  background: #ccc;
}

.error {
  color: red;
  margin-top: 10px;
}
</style>
