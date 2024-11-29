<template>
  <div class="wallet-setup">
    <h1>Welcome to Verus Wallet</h1>
    
    <div class="setup-options" v-if="!showMnemonicInput && !showNewWalletFlow">
      <button 
        @click="startNewWalletFlow" 
        :disabled="loading"
        class="btn btn-primary"
      >
        Create New Wallet
      </button>
      <div class="divider">or</div>
      <button 
        @click="showMnemonicInput = true" 
        :disabled="loading"
        class="btn btn-secondary"
      >
        Import Existing Wallet
      </button>
    </div>

    <div v-if="showNewWalletFlow" class="new-wallet-flow">
      <div v-if="newWalletStep === 1" class="seed-phrase-display">
        <h2>Your Recovery Phrase</h2>
        <p class="warning">
          Write down these 24 words in order and keep them safe. 
          This is your wallet's backup phrase. Never share it with anyone!
        </p>
        
        <div class="seed-phrase-grid">
          <div 
            v-for="(word, index) in seedPhraseArray" 
            :key="index"
            class="seed-word"
          >
            <span class="word-number">{{ index + 1 }}.</span>
            <span class="word">{{ word }}</span>
          </div>
        </div>

        <div class="checkbox-container">
          <input 
            type="checkbox" 
            id="confirmBackup"
            v-model="hasConfirmedBackup"
          >
          <label for="confirmBackup">
            I have written down my recovery phrase and stored it safely
          </label>
        </div>

        <button 
          @click="proceedToConfirmation"
          :disabled="!hasConfirmedBackup || loading"
          class="btn btn-primary"
        >
          Continue
        </button>
      </div>

      <div v-if="newWalletStep === 2" class="seed-confirmation">
        <h2>Confirm Recovery Phrase</h2>
        <p>Please enter the following words from your recovery phrase to confirm you've saved it:</p>

        <div class="confirmation-inputs">
          <div 
            v-for="(index, i) in confirmationIndices" 
            :key="i"
            class="confirmation-input"
          >
            <label>Word #{{ index + 1 }}</label>
            <input 
              type="text"
              v-model="confirmationWords[i]"
              :disabled="loading"
              @input="validateConfirmation"
            >
          </div>
        </div>

        <button 
          @click="finalizeWalletCreation"
          :disabled="!isConfirmationValid || loading"
          class="btn btn-primary"
        >
          Create Wallet
        </button>
      </div>

      <button 
        v-if="newWalletStep > 1" 
        @click="goBackInSetup" 
        class="btn-back"
        :disabled="loading"
      >
        ← Back
      </button>
    </div>

    <div v-else class="mnemonic-input">
      <button @click="showMnemonicInput = false" class="btn-back">
        ← Back
      </button>
      
      <h2>Import Wallet</h2>
      <p>Enter your 24-word recovery phrase</p>
      
      <form @submit.prevent="importWallet" class="import-form">
        <textarea
          v-model="mnemonic"
          placeholder="Enter your recovery phrase (24 words)"
          required
          :disabled="loading"
          rows="4"
        ></textarea>
        
        <button 
          type="submit" 
          :disabled="loading || !isValidMnemonic"
          class="btn btn-primary"
        >
          Import Wallet
        </button>
      </form>
    </div>

    <div v-if="error" class="error-message">
      {{ error }}
    </div>

    <div v-if="loading" class="loading-overlay">
      <div class="loading-spinner"></div>
      <div class="loading-text">{{ loadingText }}</div>
    </div>
  </div>
</template>

<script>
import { ref, computed } from 'vue';
import { useStore } from 'vuex';
import bip39 from 'bip39';

export default {
  name: 'WalletSetup',
  
  setup() {
    const store = useStore();
    const error = ref('');
    const loading = ref(false);
    const loadingText = ref('');
    const showMnemonicInput = ref(false);
    const showNewWalletFlow = ref(false);
    const newWalletStep = ref(0);
    const mnemonic = ref('');
    const hasConfirmedBackup = ref(false);
    const seedPhrase = ref('');
    const confirmationWords = ref(['', '', '', '']);
    const confirmationIndices = ref([]);

    const isValidMnemonic = computed(() => {
      return bip39.validateMnemonic(mnemonic.value);
    });

    const seedPhraseArray = computed(() => {
      return seedPhrase.value.split(' ');
    });

    const isConfirmationValid = computed(() => {
      return confirmationWords.value.every((word, index) => {
        const targetWord = seedPhraseArray.value[confirmationIndices.value[index]];
        return word.toLowerCase().trim() === targetWord.toLowerCase();
      });
    });

    function generateConfirmationIndices() {
      const indices = new Set();
      while (indices.size < 4) {
        indices.add(Math.floor(Math.random() * 24));
      }
      confirmationIndices.value = Array.from(indices);
    }

    async function startNewWalletFlow() {
      try {
        loading.value = true;
        loadingText.value = 'Generating secure wallet...';
        error.value = '';
        
        // Generate new mnemonic
        const newMnemonic = bip39.generateMnemonic(256); // 24 words
        seedPhrase.value = newMnemonic;
        
        // Generate random indices for confirmation
        generateConfirmationIndices();
        
        showNewWalletFlow.value = true;
        newWalletStep.value = 1;
      } catch (err) {
        error.value = err.message || 'Failed to start wallet creation';
      } finally {
        loading.value = false;
      }
    }

    function proceedToConfirmation() {
      if (!hasConfirmedBackup.value) {
        error.value = 'Please confirm that you have backed up your recovery phrase';
        return;
      }
      newWalletStep.value = 2;
    }

    function validateConfirmation() {
      error.value = '';
    }

    function goBackInSetup() {
      if (newWalletStep.value > 1) {
        newWalletStep.value--;
      } else {
        showNewWalletFlow.value = false;
        seedPhrase.value = '';
        hasConfirmedBackup.value = false;
        confirmationWords.value = ['', '', '', ''];
      }
    }

    async function finalizeWalletCreation() {
      if (!isConfirmationValid.value) {
        error.value = 'Incorrect confirmation words. Please check your recovery phrase.';
        return;
      }

      try {
        loading.value = true;
        loadingText.value = 'Creating your wallet...';
        error.value = '';
        
        await store.dispatch('wallet/generateNewWallet', seedPhrase.value);
      } catch (err) {
        error.value = err.message || 'Failed to create wallet';
      } finally {
        loading.value = false;
      }
    }

    async function importWallet() {
      if (!isValidMnemonic.value) {
        error.value = 'Invalid recovery phrase';
        return;
      }

      try {
        loading.value = true;
        loadingText.value = 'Importing your wallet...';
        error.value = '';
        
        await store.dispatch('wallet/recoverFromMnemonic', mnemonic.value);
      } catch (err) {
        error.value = err.message || 'Failed to import wallet';
      } finally {
        loading.value = false;
      }
    }

    return {
      error,
      loading,
      loadingText,
      showMnemonicInput,
      showNewWalletFlow,
      newWalletStep,
      mnemonic,
      hasConfirmedBackup,
      seedPhraseArray,
      confirmationWords,
      confirmationIndices,
      isValidMnemonic,
      isConfirmationValid,
      startNewWalletFlow,
      proceedToConfirmation,
      validateConfirmation,
      goBackInSetup,
      finalizeWalletCreation,
      importWallet
    };
  }
};
</script>

<style scoped>
.wallet-setup {
  padding: 2rem;
  max-width: 100%;
  position: relative;
  min-height: 400px;
}

h1, h2 {
  text-align: center;
  color: var(--text-color);
  margin-bottom: 2rem;
}

.setup-options {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  align-items: center;
  margin-top: 2rem;
}

.divider {
  color: var(--text-color);
  font-size: 0.9rem;
  opacity: 0.7;
  margin: 0.5rem 0;
}

.btn {
  width: 100%;
  padding: 0.75rem 1.5rem;
  border: none;
  border-radius: 0.375rem;
  font-size: 1rem;
  cursor: pointer;
  transition: all 0.2s;
}

.btn:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.btn-primary {
  background-color: var(--primary-color);
  color: white;
}

.btn-primary:hover:not(:disabled) {
  background-color: #2980b9;
}

.btn-secondary {
  background-color: var(--background-color);
  color: var(--text-color);
  border: 1px solid var(--border-color);
}

.btn-secondary:hover:not(:disabled) {
  background-color: #e2e8f0;
}

.btn-back {
  background: none;
  border: none;
  color: var(--primary-color);
  cursor: pointer;
  padding: 0.5rem;
  margin-bottom: 1rem;
  font-size: 1rem;
}

.btn-back:hover:not(:disabled) {
  text-decoration: underline;
}

.error-message {
  color: #e74c3c;
  margin-top: 1rem;
  text-align: center;
  padding: 0.5rem;
  border-radius: 0.375rem;
  background-color: rgba(231, 76, 60, 0.1);
}

.loading-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(255, 255, 255, 0.9);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.loading-spinner {
  border: 4px solid #f3f3f3;
  border-top: 4px solid var(--primary-color);
  border-radius: 50%;
  width: 40px;
  height: 40px;
  animation: spin 1s linear infinite;
}

.loading-text {
  margin-top: 1rem;
  color: var(--text-color);
}

.seed-phrase-display {
  text-align: center;
}

.warning {
  color: #e74c3c;
  margin-bottom: 1.5rem;
  font-weight: 500;
}

.seed-phrase-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 0.5rem;
  margin: 1.5rem 0;
  padding: 1rem;
  background-color: var(--background-color);
  border-radius: 0.5rem;
  border: 1px solid var(--border-color);
}

.seed-word {
  display: flex;
  align-items: center;
  padding: 0.5rem;
  background-color: white;
  border-radius: 0.25rem;
  border: 1px solid var(--border-color);
}

.word-number {
  color: var(--text-secondary);
  margin-right: 0.5rem;
  font-size: 0.9rem;
}

.word {
  color: var(--text-color);
  font-weight: 500;
}

.checkbox-container {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  margin: 1.5rem 0;
}

.confirmation-inputs {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1rem;
  margin: 1.5rem 0;
}

.confirmation-input {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.confirmation-input label {
  color: var(--text-secondary);
  font-size: 0.9rem;
}

.confirmation-input input {
  padding: 0.75rem;
  border: 1px solid var(--border-color);
  border-radius: 0.375rem;
  font-size: 1rem;
  width: 100%;
}

.confirmation-input input:focus {
  outline: none;
  border-color: var(--primary-color);
  box-shadow: 0 0 0 2px rgba(52, 152, 219, 0.2);
}

.import-form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.import-form textarea {
  width: 100%;
  padding: 0.75rem;
  border: 1px solid var(--border-color);
  border-radius: 0.375rem;
  font-size: 1rem;
  resize: vertical;
}

.import-form textarea:focus {
  outline: none;
  border-color: var(--primary-color);
  box-shadow: 0 0 0 2px rgba(52, 152, 219, 0.2);
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}
</style>
