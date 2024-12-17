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

<script>
import browser from 'webextension-polyfill';

export default {
  name: 'UnlockPage',
  data() {
    return {
      password: '',
      error: '',
      isLoading: false,
      requestId: null
    };
  },
  created() {
    // Get the request ID from the URL if available
    const params = new URLSearchParams(window.location.hash.split('?')[1]);
    this.requestId = params.get('id');
    console.log('Request ID:', this.requestId);
  },
  methods: {
    async handleUnlock() {
      if (this.isLoading) return;
      
      this.isLoading = true;
      this.error = '';
      
      try {
        console.log('Unlocking wallet...');
        
        // Get the stored wallet data
        const { wallet } = await browser.storage.local.get('wallet');
        if (!wallet) {
          throw new Error('No wallet found');
        }
        
        // Update wallet state
        await browser.storage.local.set({ 
          walletState: {
            isLocked: false,
            address: wallet.address
          }
        });
        
        // Update session state
        await browser.storage.session.set({ isLoggedIn: true });
        
        console.log('Wallet unlocked, sending result...');
        
        // Send success message back to background script
        if (this.requestId) {
          await browser.runtime.sendMessage({
            type: 'UNLOCK_RESULT',
            id: parseInt(this.requestId),
            success: true
          });

          // Get origin from URL params
          const params = new URLSearchParams(window.location.hash.split('?')[1]);
          const origin = decodeURIComponent(params.get('origin'));

          // Check if we're already connected to this site
          const { connectedSites = [] } = await browser.storage.local.get('connectedSites');
          const isAlreadyConnected = connectedSites.some(site => site.origin === origin);

          if (isAlreadyConnected) {
            // If already connected, send auto-approval
            await browser.runtime.sendMessage({
              type: 'CONNECT_RESPONSE',
              id: parseInt(this.requestId),
              approved: true
            });

            // Close the window
            const currentWindow = await browser.windows.getCurrent();
            if (currentWindow) {
              await browser.windows.remove(currentWindow.id);
            } else {
              window.close();
            }
          } else {
            // If not connected, show the connect approval page
            window.location.hash = `/connect?id=${this.requestId}&origin=${encodeURIComponent(origin)}`;
          }
        } else {
          // If no request ID, just close the window
          const currentWindow = await browser.windows.getCurrent();
          if (currentWindow) {
            await browser.windows.remove(currentWindow.id);
          } else {
            window.close();
          }
        }
      } catch (error) {
        console.error('Unlock failed:', error);
        this.error = error.message;
      } finally {
        this.isLoading = false;
      }
    }
  }
};
</script>

<style scoped>
.unlock-page {
  padding: 2rem;
  max-width: 400px;
  margin: 0 auto;
}

h2 {
  text-align: center;
  margin-bottom: 2rem;
  color: #333;
}

.form-group {
  margin-bottom: 1.5rem;
}

label {
  display: block;
  margin-bottom: 0.5rem;
  color: #666;
}

input {
  width: 100%;
  padding: 0.75rem;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 1rem;
}

input:focus {
  outline: none;
  border-color: #4CAF50;
  box-shadow: 0 0 0 2px rgba(76, 175, 80, 0.2);
}

input:disabled {
  background-color: #f5f5f5;
  cursor: not-allowed;
}

button {
  width: 100%;
  padding: 0.75rem;
  background-color: #4CAF50;
  color: white;
  border: none;
  border-radius: 4px;
  font-size: 1rem;
  cursor: pointer;
  transition: background-color 0.2s;
}

button:hover:not(:disabled) {
  background-color: #45a049;
}

button:disabled {
  background-color: #cccccc;
  cursor: not-allowed;
}

.error {
  color: #f44336;
  margin-bottom: 1rem;
  font-size: 0.875rem;
}
</style>
