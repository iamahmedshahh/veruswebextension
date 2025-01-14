<template>
  <div class="settings-container">
    <div class="header">
      <h2>Wallet Settings</h2>
      <button @click="$emit('close')" class="btn-close">×</button>
    </div>

    <!-- Security Warning -->
    <div class="security-warning" v-if="!isVerified">
      <div class="warning-icon">⚠️</div>
      <p>You are about to view sensitive wallet information. Make sure:</p>
      <ul>
        <li>You are in a private location</li>
        <li>No one can see your screen</li>
        <li>No screen recording software is running</li>
      </ul>
    </div>

    <!-- Password Verification Form -->
    <form v-if="!isVerified" @submit.prevent="verifyPassword" class="verify-form">
      <div class="form-group">
        <label>Enter Password to View Sensitive Information</label>
        <input
          type="password"
          v-model="password"
          placeholder="Enter your wallet password"
          required
          class="password-input"
        />
      </div>
      <div v-if="error" class="error-message">{{ error }}</div>
      <button type="submit" class="btn-primary">Verify Password</button>
    </form>

    <!-- Sensitive Information Display -->
    <div v-else class="sensitive-info">
      <div class="auto-hide-warning">
        This information will be hidden in {{ timeLeft }} seconds
      </div>

      <!-- Mnemonic Phrase Section -->
      <div class="info-section">
        <h3>Recovery Phrase (Mnemonic)</h3>
        <div class="info-display">
          <div class="masked-content" :class="{ 'show': showMnemonic }">
            {{ maskedMnemonic }}
          </div>
          <div class="actions">
            <button @click="toggleMnemonic" class="btn-secondary">
              {{ showMnemonic ? 'Hide' : 'Show' }}
            </button>
            <button
              v-if="showMnemonic"
              @click="copyToClipboard(walletInfo.mnemonic, 'mnemonic')"
              class="btn-secondary"
            >
              {{ mnemonicCopied ? 'Copied!' : 'Copy' }}
            </button>
          </div>
        </div>
      </div>

      <!-- Private Key Section -->
      <div class="info-section">
        <h3>Private Key</h3>
        <div class="info-display">
          <div class="masked-content" :class="{ 'show': showPrivateKey }">
            {{ maskedPrivateKey }}
          </div>
          <div class="actions">
            <button @click="togglePrivateKey" class="btn-secondary">
              {{ showPrivateKey ? 'Hide' : 'Show' }}
            </button>
            <button
              v-if="showPrivateKey"
              @click="copyToClipboard(walletInfo.privateKeyWIF, 'privateKey')"
              class="btn-secondary"
            >
              {{ privateKeyCopied ? 'Copied!' : 'Copy' }}
            </button>
          </div>
        </div>
      </div>

      <div class="security-reminder">
        <p><strong>Important:</strong></p>
        <ul>
          <li>Never share these details with anyone</li>
          <li>Store them securely offline</li>
          <li>Verus team will never ask for this information</li>
        </ul>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useStore } from 'vuex';
import browser from 'webextension-polyfill';

export default {
  name: 'Settings',
  
  setup() {
    const store = useStore();
    const password = ref('');
    const error = ref('');
    const isVerified = ref(false);
    const showMnemonic = ref(false);
    const showPrivateKey = ref(false);
    const mnemonicCopied = ref(false);
    const privateKeyCopied = ref(false);
    const timeLeft = ref(30);
    const walletInfo = ref(null);
    let autoHideTimer = null;
    let countdownTimer = null;

    // Mask sensitive information
    const maskedMnemonic = computed(() => {
      if (!walletInfo.value?.mnemonic) return '';
      return showMnemonic.value ? walletInfo.value.mnemonic : '•'.repeat(64);
    });

    const maskedPrivateKey = computed(() => {
      if (!walletInfo.value?.privateKeyWIF) return '';
      return showPrivateKey.value ? walletInfo.value.privateKeyWIF : '•'.repeat(52);
    });

    // Start countdown timer
    const startCountdown = () => {
      timeLeft.value = 30;
      if (countdownTimer) clearInterval(countdownTimer);
      
      countdownTimer = setInterval(() => {
        timeLeft.value--;
        if (timeLeft.value <= 0) {
          hideAllSensitiveInfo();
        }
      }, 1000);
    };

    // Hide all sensitive information
    const hideAllSensitiveInfo = () => {
      showMnemonic.value = false;
      showPrivateKey.value = false;
      if (countdownTimer) {
        clearInterval(countdownTimer);
      }
    };

    // Verify password and fetch wallet info
    const verifyPassword = async () => {
      try {
        error.value = '';
        const data = await browser.storage.local.get('wallet');
        
        if (!data.wallet) {
          error.value = 'Wallet data not found';
          return;
        }

        const isValid = await store.dispatch('wallet/verifyPassword', password.value);
        if (!isValid) {
          error.value = 'Invalid password';
          return;
        }

        // Get wallet info from store
        console.log('Wallet data from storage:', data.wallet);
        walletInfo.value = {
          privateKeyWIF: data.wallet.privateKey,
          mnemonic: data.wallet.mnemonic
        };
        console.log('Wallet info set:', walletInfo.value);
        
        isVerified.value = true;
        startCountdown();

        // Auto-hide after 30 seconds
        autoHideTimer = setTimeout(() => {
          isVerified.value = false;
          hideAllSensitiveInfo();
        }, 30000);

      } catch (err) {
        error.value = err.message || 'Verification failed';
      }
    };

    // Toggle display of sensitive information
    const toggleMnemonic = () => {
      showMnemonic.value = !showMnemonic.value;
      if (showMnemonic.value) startCountdown();
    };

    const togglePrivateKey = () => {
      showPrivateKey.value = !showPrivateKey.value;
      if (showPrivateKey.value) startCountdown();
    };

    // Copy to clipboard with security measures
    const copyToClipboard = async (text, type) => {
      try {
        await navigator.clipboard.writeText(text);
        if (type === 'mnemonic') {
          mnemonicCopied.value = true;
          setTimeout(() => { mnemonicCopied.value = false }, 2000);
        } else {
          privateKeyCopied.value = true;
          setTimeout(() => { privateKeyCopied.value = false }, 2000);
        }

        // Clear clipboard after 60 seconds
        setTimeout(() => {
          navigator.clipboard.writeText('');
        }, 60000);
      } catch (err) {
        error.value = 'Failed to copy to clipboard';
      }
    };

    // Cleanup timers
    onUnmounted(() => {
      if (autoHideTimer) clearTimeout(autoHideTimer);
      if (countdownTimer) clearInterval(countdownTimer);
    });

    return {
      password,
      error,
      isVerified,
      showMnemonic,
      showPrivateKey,
      mnemonicCopied,
      privateKeyCopied,
      timeLeft,
      walletInfo,
      maskedMnemonic,
      maskedPrivateKey,
      verifyPassword,
      toggleMnemonic,
      togglePrivateKey,
      copyToClipboard
    };
  }
};
</script>

<style scoped>
.settings-container {
  padding: 1rem;
  width: 100%;
  max-width: 100%;
  height: 100%;
  overflow-y: auto;
  overflow-x: hidden;
  box-sizing: border-box;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.5rem;
  padding-right: 0.5rem;
}

.header h2 {
  margin: 0;
  font-size: 1.25rem;
}

.btn-close {
  background: none;
  border: none;
  font-size: 1.5rem;
  cursor: pointer;
  padding: 0.5rem;
}

.security-warning {
  background-color: #fff3cd;
  border: 1px solid #ffeeba;
  padding: 1rem;
  border-radius: 0.375rem;
  margin-bottom: 1.5rem;
  word-wrap: break-word;
}

.warning-icon {
  font-size: 1.5rem;
  margin-bottom: 0.5rem;
}

.verify-form {
  margin-bottom: 1.5rem;
}

.form-group {
  margin-bottom: 1rem;
}

.password-input {
  width: 100%;
  padding: 0.75rem;
  border: 1px solid var(--border-color);
  border-radius: 0.375rem;
  margin-top: 0.5rem;
  box-sizing: border-box;
}

.error-message {
  color: var(--error-color);
  margin-bottom: 1rem;
}

.sensitive-info {
  background-color: var(--background-color);
  padding: 1rem;
  border-radius: 0.375rem;
  width: 100%;
  box-sizing: border-box;
}

.auto-hide-warning {
  color: var(--warning-color);
  text-align: center;
  margin-bottom: 1rem;
  font-size: 0.875rem;
}

.info-section {
  margin-bottom: 1.5rem;
  padding: 1rem;
  background-color: white;
  border-radius: 0.375rem;
  border: 1px solid var(--border-color);
  width: 100%;
  box-sizing: border-box;
}

.info-display {
  margin-top: 0.5rem;
  width: 100%;
}

.masked-content {
  font-family: monospace;
  background-color: var(--input-background);
  padding: 1rem;
  border-radius: 0.375rem;
  word-break: break-all;
  margin-bottom: 0.5rem;
  width: 100%;
  box-sizing: border-box;
  font-size: 0.875rem;
  overflow-wrap: break-word;
}

.actions {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.btn-primary,
.btn-secondary {
  padding: 0.5rem 1rem;
  border-radius: 0.375rem;
  cursor: pointer;
  font-size: 0.875rem;
  border: none;
  white-space: nowrap;
}

.btn-primary {
  background-color: var(--primary-color);
  color: white;
}

.btn-secondary {
  background-color: var(--secondary-color);
  color: white;
}

.security-reminder {
  margin-top: 1.5rem;
  padding: 1rem;
  background-color: #f8d7da;
  border: 1px solid #f5c6cb;
  border-radius: 0.375rem;
  color: #721c24;
  width: 100%;
  box-sizing: border-box;
  word-wrap: break-word;
}

.security-reminder ul {
  margin: 0.5rem 0 0 1.5rem;
  padding: 0;
}

@media (max-width: 400px) {
  .settings-container {
    padding: 0.75rem;
  }

  .header h2 {
    font-size: 1.125rem;
  }

  .masked-content {
    font-size: 0.75rem;
    padding: 0.75rem;
  }

  .btn-primary,
  .btn-secondary {
    padding: 0.375rem 0.75rem;
    font-size: 0.75rem;
  }
}
</style>
