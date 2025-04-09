<template>
  <div class="settings-container">
    <div class="header">
      <h2>Wallet Settings</h2>
      <button @click="$emit('close')" class="btn-close">×</button>
    </div>

    <!-- Main Settings Navigation -->
    <div class="settings-navigation" v-if="!isVerified">
      <router-link to="/security" class="nav-button security-nav" @click="$emit('close')">
        <div class="nav-icon">🔒</div>
        <div class="nav-content">
          <h3>Security Settings</h3>
          <p>Configure wallet security, auto-lock, and password settings</p>
        </div>
        <div class="nav-arrow">›</div>
      </router-link>

      <button @click="showSensitiveSection" class="nav-button sensitive-nav">
        <div class="nav-icon">🔑</div>
        <div class="nav-content">
          <h3>Recovery Information</h3>
          <p>View your seed phrase and private keys</p>
        </div>
        <div class="nav-arrow">›</div>
      </button>
    </div>

    <!-- Security Warning -->
    <div class="security-warning" v-if="sensitiveRequested && !isVerified">
      <div class="warning-icon">⚠️</div>
      <p>You are about to view sensitive wallet information. Make sure:</p>
      <ul>
        <li>You are in a private location</li>
        <li>No one can see your screen</li>
        <li>No screen recording software is running</li>
      </ul>
    </div>

    <!-- Password Verification Form -->
    <form v-if="sensitiveRequested && !isVerified" @submit.prevent="verifyPassword" class="verify-form">
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
      <button type="button" @click="cancelSensitiveSection" class="btn-secondary">Cancel</button>
    </form>

    <!-- Sensitive Information Display -->
    <div v-if="isVerified" class="sensitive-info">
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
import { useRouter } from 'vue-router';
import browser from 'webextension-polyfill';

export default {
  name: 'Settings',
  
  setup() {
    const store = useStore();
    const router = useRouter();
    const password = ref('');
    const error = ref('');
    const isVerified = ref(false);
    const sensitiveRequested = ref(false);
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

    // Show sensitive information section
    const showSensitiveSection = () => {
      sensitiveRequested.value = true;
    };

    // Cancel viewing sensitive section
    const cancelSensitiveSection = () => {
      sensitiveRequested.value = false;
      password.value = '';
      error.value = '';
    };

    // Verify password and fetch wallet info
    const verifyPassword = async () => {
      try {
        error.value = '';
        
        // First verify the password
        const isValid = await store.dispatch('wallet/verifyPassword', password.value);
        if (!isValid) {
          error.value = 'Invalid password';
          return;
        }

        // Get decrypted sensitive information using the wallet service
        try {
          // Retrieve the recovery phrase
          const mnemonic = await store.dispatch('wallet/getRecoveryPhrase', {
            password: password.value
          });
          
          // Retrieve the private key for VRSC
          const privateKeyWIF = await store.dispatch('wallet/getPrivateKey', {
            currency: 'VRSC',
            password: password.value
          });
          
          // Set the wallet info
          walletInfo.value = {
            privateKeyWIF,
            mnemonic
          };
          
          console.log('Wallet info retrieved successfully');
          
          isVerified.value = true;
          startCountdown();

          // Auto-hide after 30 seconds
          autoHideTimer = setTimeout(() => {
            isVerified.value = false;
            hideAllSensitiveInfo();
            sensitiveRequested.value = false;
          }, 30000);
        } catch (err) {
          console.error('Failed to decrypt sensitive data:', err);
          error.value = 'Failed to decrypt wallet data: ' + err.message;
        }
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

    // Copy to clipboard
    const copyToClipboard = (text, type) => {
      navigator.clipboard.writeText(text).then(() => {
        if (type === 'mnemonic') {
          mnemonicCopied.value = true;
          setTimeout(() => { mnemonicCopied.value = false; }, 2000);
        } else {
          privateKeyCopied.value = true;
          setTimeout(() => { privateKeyCopied.value = false; }, 2000);
        }
      });
    };

    // Clean up timers on unmount
    onUnmounted(() => {
      if (autoHideTimer) clearTimeout(autoHideTimer);
      if (countdownTimer) clearInterval(countdownTimer);
    });

    return {
      password,
      error,
      isVerified,
      sensitiveRequested,
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
      copyToClipboard,
      showSensitiveSection,
      cancelSensitiveSection
    };
  },
  
  emits: ['close']
};
</script>

<style scoped>
.settings-container {
  max-width: 360px;
  background-color: white;
  border-radius: 8px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  padding: 1rem;
  max-height: 80vh;
  overflow-y: auto;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
  padding-bottom: 0.5rem;
  border-bottom: 1px solid var(--border-color);
}

.header h2 {
  margin: 0;
  font-size: 1.3rem;
}

.btn-close {
  background: none;
  border: none;
  font-size: 1.5rem;
  cursor: pointer;
  color: var(--text-color);
  opacity: 0.7;
}

.btn-close:hover {
  opacity: 1;
}

.settings-navigation {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  margin-bottom: 1rem;
}

.nav-button {
  display: flex;
  align-items: center;
  padding: 0.75rem;
  border-radius: 8px;
  background-color: var(--input-background);
  border: 1px solid var(--border-color);
  cursor: pointer;
  text-decoration: none;
  color: inherit;
  text-align: left;
  width: 100%;
}

.nav-button:hover {
  background-color: rgba(0, 0, 0, 0.03);
}

.nav-icon {
  font-size: 1.25rem;
  margin-right: 0.75rem;
}

.nav-content {
  flex: 1;
}

.nav-content h3 {
  margin: 0;
  font-size: 1rem;
  margin-bottom: 0.25rem;
}

.nav-content p {
  margin: 0;
  font-size: 0.8rem;
  opacity: 0.75;
}

.nav-arrow {
  font-size: 1.5rem;
  opacity: 0.5;
}

.security-nav {
  border-left: 4px solid var(--primary-color);
}

.sensitive-nav {
  border-left: 4px solid var(--warning-color);
}

.security-warning {
  background-color: rgba(243, 156, 18, 0.1);
  border-radius: 8px;
  padding: 1rem;
  margin-bottom: 1.5rem;
  border-left: 4px solid var(--warning-color);
}

.warning-icon {
  font-size: 1.5rem;
  margin-bottom: 0.5rem;
}

.security-warning ul {
  margin: 0.5rem 0 0 1.5rem;
  padding: 0;
}

.security-warning li {
  margin-bottom: 0.25rem;
}

.verify-form {
  margin-bottom: 1.5rem;
}

.form-group {
  margin-bottom: 1rem;
}

.form-group label {
  display: block;
  margin-bottom: 0.5rem;
  font-weight: 500;
}

.password-input {
  width: 100%;
  padding: 0.75rem;
  border: 1px solid var(--border-color);
  border-radius: 0.375rem;
  font-size: 1rem;
}

.error-message {
  color: var(--error-color);
  margin: 0.5rem 0;
  font-size: 0.875rem;
}

.btn-primary, .btn-secondary {
  padding: 0.75rem 1rem;
  border: none;
  border-radius: 0.375rem;
  font-size: 1rem;
  cursor: pointer;
  transition: background-color 0.2s;
  margin-right: 0.5rem;
}

.btn-primary {
  background-color: var(--primary-color);
  color: white;
}

.btn-primary:hover {
  background-color: var(--secondary-color);
}

.btn-secondary {
  background-color: var(--input-background);
  color: var(--text-color);
  border: 1px solid var(--border-color);
}

.btn-secondary:hover {
  background-color: #e5e5e5;
}

.sensitive-info {
  position: relative;
}

.auto-hide-warning {
  background-color: rgba(231, 76, 60, 0.1);
  color: var(--error-color);
  padding: 0.5rem;
  border-radius: 0.25rem;
  margin-bottom: 1rem;
  font-size: 0.8rem;
  text-align: center;
}

.info-section {
  margin-bottom: 1.5rem;
}

.info-section h3 {
  margin: 0 0 0.5rem 0;
  font-size: 1rem;
}

.info-display {
  background-color: var(--input-background);
  border: 1px solid var(--border-color);
  border-radius: 0.375rem;
  padding: 0.75rem;
}

.masked-content {
  font-family: monospace;
  word-break: break-all;
  margin-bottom: 0.75rem;
  background-color: rgba(0, 0, 0, 0.03);
  padding: 0.5rem;
  border-radius: 0.25rem;
  font-size: 0.9rem;
}

.actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
}

.actions button {
  padding: 0.5rem 0.75rem;
  font-size: 0.875rem;
}

.security-reminder {
  background-color: rgba(46, 204, 113, 0.1);
  border-radius: 8px;
  padding: 1rem;
  font-size: 0.875rem;
  border-left: 4px solid var(--success-color);
}

.security-reminder ul {
  margin: 0.5rem 0 0 1.5rem;
  padding: 0;
}

.security-reminder li {
  margin-bottom: 0.25rem;
}
</style>
