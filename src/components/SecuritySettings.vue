<template>
  <div class="security-settings">
    <div class="header-container">
      <button class="back-button" @click="goBack">
        <span class="back-icon">←</span> Back
      </button>
      <h2>Security Settings</h2>
    </div>
    <p class="intro-text">Customize your wallet's security settings to better protect your assets.</p>

    <div class="settings-section">
      <h3>Auto-Lock Settings</h3>
      
      <div class="form-group">
        <div class="toggle-container">
          <label for="auto-lock-toggle">Auto-lock wallet after inactivity</label>
          <div class="toggle-switch">
            <input 
              type="checkbox" 
              id="auto-lock-toggle" 
              v-model="autoLockEnabled"
              @change="saveSettings"
            >
            <label for="auto-lock-toggle"></label>
          </div>
        </div>
        <p class="setting-description">
          When enabled, your wallet will automatically lock after a period of inactivity for security.
        </p>
      </div>

      <div class="form-group" v-if="autoLockEnabled">
        <label for="inactivity-timeout">Inactivity timeout</label>
        <select 
          id="inactivity-timeout" 
          v-model="inactivityTimeout"
          @change="saveSettings"
          class="select-input"
        >
          <option :value="5 * 60 * 1000">5 minutes</option>
          <option :value="15 * 60 * 1000">15 minutes</option>
          <option :value="30 * 60 * 1000">30 minutes</option>
          <option :value="60 * 60 * 1000">1 hour</option>
        </select>
        <p class="setting-description">
          Your wallet will automatically lock after this period of inactivity.
        </p>
      </div>
    </div>

    <div class="settings-section">
      <h3>Memory Protection</h3>
      
      <div class="form-group">
        <div class="toggle-container">
          <label for="memory-cleanup-toggle">Secure memory cleanup</label>
          <div class="toggle-switch">
            <input 
              type="checkbox" 
              id="memory-cleanup-toggle" 
              v-model="memoryCleanupEnabled"
              @change="saveSettings"
            >
            <label for="memory-cleanup-toggle"></label>
          </div>
        </div>
        <p class="setting-description">
          Automatically clear sensitive data from memory when not in use to prevent potential exposure.
        </p>
      </div>
    </div>

    <div class="settings-section">
      <h3>Session Management</h3>
      
      <div class="form-group">
        <div class="toggle-container">
          <label for="extend-session-toggle">Extend session while active</label>
          <div class="toggle-switch">
            <input 
              type="checkbox" 
              id="extend-session-toggle" 
              v-model="extendSessionEnabled"
              @change="saveSettings"
            >
            <label for="extend-session-toggle"></label>
          </div>
        </div>
        <p class="setting-description">
          Keep your session alive while you're actively using the wallet.
        </p>
      </div>
    </div>

    <div class="settings-section">
      <h3>Additional Security</h3>
      
      <button @click="changePassword" class="btn-primary">
        Change Password
      </button>
      
      <div class="mt-4">
        <button @click="showRecoveryPhrase" class="btn-secondary">
          View Recovery Phrase
        </button>
      </div>
    </div>

    <div v-if="showPasswordDialog" class="modal-overlay">
      <div class="modal-content">
        <h3>Change Password</h3>
        <div class="form-group">
          <label>Current Password</label>
          <input 
            type="password" 
            v-model="currentPassword" 
            placeholder="Enter current password"
            class="password-input"
          />
        </div>
        
        <div class="form-group">
          <label>New Password</label>
          <input 
            type="password" 
            v-model="newPassword" 
            placeholder="Enter new password"
            class="password-input"
            @input="checkPasswordStrength"
          />
          
          <div class="password-strength-meter">
            <div 
              class="password-strength-bar" 
              :class="passwordStrengthClass"
              :style="{ width: passwordStrength + '%' }"
            ></div>
          </div>
          <div class="password-strength-text" :class="passwordStrengthClass">
            {{ passwordStrengthText }}
          </div>
        </div>
        
        <div class="form-group">
          <label>Confirm New Password</label>
          <input 
            type="password" 
            v-model="confirmNewPassword" 
            placeholder="Confirm new password"
            class="password-input"
          />
        </div>
        
        <div v-if="passwordChangeError" class="error-message">
          {{ passwordChangeError }}
        </div>
        
        <div class="modal-buttons">
          <button @click="changePasswordConfirm" class="btn-primary" :disabled="changingPassword">
            <span v-if="changingPassword">Changing...</span>
            <span v-else>Change Password</span>
          </button>
          <button @click="cancelPasswordChange" class="btn-secondary">
            Cancel
          </button>
        </div>
      </div>
    </div>

    <div v-if="showRecoveryDialog" class="modal-overlay">
      <div class="modal-content">
        <h3>Recovery Phrase</h3>
        <p class="warning-text">
          Write these words down and keep them in a safe place. Anyone with these words can access your wallet!
        </p>
        
        <div class="form-group">
          <label>Enter your password to view</label>
          <input 
            type="password" 
            v-model="authPassword" 
            placeholder="Enter your password"
            class="password-input"
          />
        </div>
        
        <div v-if="recoveryPhraseError" class="error-message">
          {{ recoveryPhraseError }}
        </div>
        
        <div v-if="recoveryPhrase" class="recovery-phrase-container">
          <div class="recovery-phrase-words">
            <div 
              v-for="(word, index) in recoveryPhrase.split(' ')" 
              :key="index"
              class="seed-word"
            >
              <span class="word-number">{{ index + 1 }}.</span>
              <span class="word">{{ word }}</span>
            </div>
          </div>
        </div>
        
        <div class="modal-buttons">
          <button @click="confirmRecoveryPhrase" class="btn-primary" :disabled="!recoveryPhrase">
            I've Written it Down
          </button>
          <button @click="cancelRecoveryPhrase" class="btn-secondary">
            Cancel
          </button>
        </div>
      </div>
    </div>

    <div v-if="showMessage" class="success-message">
      {{ message }}
    </div>
  </div>
</template>

<script>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { useStore } from 'vuex';
import storage from '../store/services/StorageService';
import securityUtils from '../utils/securityUtils';
import { useRouter } from 'vue-router';

export default {
  name: 'SecuritySettings',
  
  setup() {
    const store = useStore();
    const router = useRouter();
    
    // Settings
    const autoLockEnabled = ref(true);
    const inactivityTimeout = ref(30 * 60 * 1000); // Default 30 minutes
    const memoryCleanupEnabled = ref(true);
    const extendSessionEnabled = ref(true);
    
    // Password change dialog
    const showPasswordDialog = ref(false);
    const currentPassword = ref('');
    const newPassword = ref('');
    const confirmNewPassword = ref('');
    const passwordChangeError = ref('');
    const changingPassword = ref(false);
    const passwordStrength = ref(0);
    const passwordStrengthText = ref('');
    
    // Recovery phrase dialog
    const showRecoveryDialog = ref(false);
    const authPassword = ref('');
    const recoveryPhrase = ref('');
    const recoveryPhraseError = ref('');
    
    // Success message
    const showMessage = ref(false);
    const message = ref('');
    
    // Password strength class
    const passwordStrengthClass = computed(() => {
      if (passwordStrength.value < 20) return 'strength-very-weak';
      if (passwordStrength.value < 40) return 'strength-weak';
      if (passwordStrength.value < 60) return 'strength-medium';
      if (passwordStrength.value < 80) return 'strength-good';
      return 'strength-strong';
    });
    
    // Check password strength
    const checkPasswordStrength = () => {
      const result = securityUtils.validatePasswordStrength(newPassword.value);
      passwordStrength.value = result.strength;
      
      // Set descriptive text based on strength
      if (passwordStrength.value < 20) {
        passwordStrengthText.value = 'Very Weak';
      } else if (passwordStrength.value < 40) {
        passwordStrengthText.value = 'Weak';
      } else if (passwordStrength.value < 60) {
        passwordStrengthText.value = 'Medium';
      } else if (passwordStrength.value < 80) {
        passwordStrengthText.value = 'Good';
      } else {
        passwordStrengthText.value = 'Strong';
      }
    };
    
    // Load settings
    const loadSettings = async () => {
      try {
        const preferences = await storage.get('userPreferences');
        if (preferences && preferences.security) {
          autoLockEnabled.value = preferences.security.autoLockEnabled !== false;
          
          if (preferences.security.inactivityTimeoutMs) {
            inactivityTimeout.value = preferences.security.inactivityTimeoutMs;
          }
          
          memoryCleanupEnabled.value = preferences.security.memoryCleanupEnabled !== false;
          extendSessionEnabled.value = preferences.security.extendSessionEnabled !== false;
        }
      } catch (error) {
        console.error('Failed to load security settings:', error);
      }
    };
    
    // Save settings
    const saveSettings = async () => {
      try {
        let preferences = await storage.get('userPreferences') || {};
        
        preferences = {
          ...preferences,
          security: {
            autoLockEnabled: autoLockEnabled.value,
            inactivityTimeoutMs: inactivityTimeout.value,
            memoryCleanupEnabled: memoryCleanupEnabled.value,
            extendSessionEnabled: extendSessionEnabled.value
          }
        };
        
        await storage.set({ userPreferences: preferences });
        
        // Show success message
        showSuccessMessage('Settings saved successfully');
      } catch (error) {
        console.error('Failed to save security settings:', error);
      }
    };
    
    // Show change password dialog
    const changePassword = () => {
      showPasswordDialog.value = true;
      currentPassword.value = '';
      newPassword.value = '';
      confirmNewPassword.value = '';
      passwordChangeError.value = '';
    };
    
    // Change password confirm
    const changePasswordConfirm = async () => {
      try {
        passwordChangeError.value = '';
        
        // Validate password strength
        const passwordValidation = securityUtils.validatePasswordStrength(newPassword.value);
        if (!passwordValidation.isValid) {
          passwordChangeError.value = passwordValidation.reasons[0];
          return;
        }
        
        // Check if passwords match
        if (newPassword.value !== confirmNewPassword.value) {
          passwordChangeError.value = 'New passwords do not match';
          return;
        }
        
        changingPassword.value = true;
        
        // Call wallet store to change password
        await store.dispatch('wallet/changePassword', {
          currentPassword: currentPassword.value,
          newPassword: newPassword.value
        });
        
        // Close dialog and show success message
        showPasswordDialog.value = false;
        showSuccessMessage('Password changed successfully');
        
        // Clear sensitive data
        securityUtils.secureClearMemory({
          currentPassword: currentPassword.value,
          newPassword: newPassword.value,
          confirmNewPassword: confirmNewPassword.value
        }, ['currentPassword', 'newPassword', 'confirmNewPassword']);
        
        currentPassword.value = '';
        newPassword.value = '';
        confirmNewPassword.value = '';
      } catch (error) {
        passwordChangeError.value = error.message || 'Failed to change password';
      } finally {
        changingPassword.value = false;
      }
    };
    
    // Cancel password change
    const cancelPasswordChange = () => {
      showPasswordDialog.value = false;
      
      // Clear sensitive data
      securityUtils.secureClearMemory({
        currentPassword: currentPassword.value,
        newPassword: newPassword.value,
        confirmNewPassword: confirmNewPassword.value
      }, ['currentPassword', 'newPassword', 'confirmNewPassword']);
      
      currentPassword.value = '';
      newPassword.value = '';
      confirmNewPassword.value = '';
      passwordChangeError.value = '';
    };
    
    // Show recovery phrase dialog
    const showRecoveryPhrase = () => {
      showRecoveryDialog.value = true;
      authPassword.value = '';
      recoveryPhrase.value = '';
      recoveryPhraseError.value = '';
    };
    
    // View recovery phrase
    const viewRecoveryPhrase = async () => {
      try {
        recoveryPhraseError.value = '';
        
        if (!authPassword.value) {
          recoveryPhraseError.value = 'Please enter your password';
          return;
        }
        
        // Call wallet store to get recovery phrase
        const result = await store.dispatch('wallet/getRecoveryPhrase', {
          password: authPassword.value
        });
        
        recoveryPhrase.value = result;
      } catch (error) {
        recoveryPhraseError.value = error.message || 'Failed to retrieve recovery phrase';
      }
    };
    
    // Confirm recovery phrase viewed
    const confirmRecoveryPhrase = () => {
      showRecoveryDialog.value = false;
      
      // Clear sensitive data
      securityUtils.secureClearMemory({
        authPassword: authPassword.value,
        recoveryPhrase: recoveryPhrase.value
      }, ['authPassword', 'recoveryPhrase']);
      
      authPassword.value = '';
      recoveryPhrase.value = '';
      recoveryPhraseError.value = '';
    };
    
    // Cancel recovery phrase view
    const cancelRecoveryPhrase = () => {
      showRecoveryDialog.value = false;
      
      // Clear sensitive data
      securityUtils.secureClearMemory({
        authPassword: authPassword.value,
        recoveryPhrase: recoveryPhrase.value
      }, ['authPassword', 'recoveryPhrase']);
      
      authPassword.value = '';
      recoveryPhrase.value = '';
      recoveryPhraseError.value = '';
    };
    
    // Show success message
    const showSuccessMessage = (msg) => {
      message.value = msg;
      showMessage.value = true;
      
      // Hide message after 3 seconds
      setTimeout(() => {
        showMessage.value = false;
      }, 3000);
    };
    
    // Go back to dashboard
    const goBack = () => {
      router.push({ name: 'dashboard' });
    };
    
    // Clean up sensitive data on unmount
    onBeforeUnmount(() => {
      securityUtils.secureClearMemory({
        currentPassword: currentPassword.value,
        newPassword: newPassword.value,
        confirmNewPassword: confirmNewPassword.value,
        authPassword: authPassword.value,
        recoveryPhrase: recoveryPhrase.value
      }, ['currentPassword', 'newPassword', 'confirmNewPassword', 'authPassword', 'recoveryPhrase']);
    });
    
    // Initialize
    onMounted(() => {
      loadSettings();
    });
    
    return {
      // Settings
      autoLockEnabled,
      inactivityTimeout,
      memoryCleanupEnabled,
      extendSessionEnabled,
      
      // Password change
      showPasswordDialog,
      currentPassword,
      newPassword,
      confirmNewPassword,
      passwordChangeError,
      changingPassword,
      passwordStrength,
      passwordStrengthText,
      passwordStrengthClass,
      
      // Recovery phrase
      showRecoveryDialog,
      authPassword,
      recoveryPhrase,
      recoveryPhraseError,
      
      // Messages
      showMessage,
      message,
      
      // Methods
      saveSettings,
      changePassword,
      changePasswordConfirm,
      cancelPasswordChange,
      checkPasswordStrength,
      showRecoveryPhrase,
      viewRecoveryPhrase,
      confirmRecoveryPhrase,
      cancelRecoveryPhrase,
      goBack
    };
  }
};
</script>

<style scoped>
.security-settings {
  padding: 1.5rem;
  max-width: 100%;
}

h2 {
  margin-bottom: 1rem;
  color: var(--text-color);
}

.intro-text {
  margin-bottom: 1.5rem;
  color: var(--text-color);
  opacity: 0.8;
}

.settings-section {
  margin-bottom: 2rem;
  padding-bottom: 1.5rem;
  border-bottom: 1px solid var(--border-color);
}

.settings-section:last-child {
  border-bottom: none;
}

h3 {
  margin-bottom: 1rem;
  font-size: 1.1rem;
  color: var(--text-color);
}

.form-group {
  margin-bottom: 1.5rem;
}

.toggle-container {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.5rem;
}

.toggle-switch {
  position: relative;
}

.toggle-switch input {
  opacity: 0;
  width: 0;
  height: 0;
}

.toggle-switch label {
  position: relative;
  display: inline-block;
  width: 48px;
  height: 24px;
  background-color: #ccc;
  border-radius: 24px;
  transition: all 0.2s;
  cursor: pointer;
}

.toggle-switch label::after {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background-color: white;
  transition: all 0.2s;
}

.toggle-switch input:checked + label {
  background-color: var(--primary-color);
}

.toggle-switch input:checked + label::after {
  transform: translateX(24px);
}

.toggle-switch input:focus + label {
  box-shadow: 0 0 0 2px rgba(52, 152, 219, 0.3);
}

.setting-description {
  font-size: 0.85rem;
  color: var(--text-color);
  opacity: 0.7;
  margin-top: 0.5rem;
}

.select-input {
  width: 100%;
  padding: 0.75rem;
  border: 1px solid var(--border-color);
  border-radius: 0.375rem;
  background-color: var(--input-background);
  font-size: 1rem;
}

.btn-primary, .btn-secondary {
  padding: 0.75rem 1.5rem;
  font-size: 1rem;
  border: none;
  border-radius: 0.375rem;
  cursor: pointer;
  transition: all 0.2s;
  width: 100%;
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

.mt-4 {
  margin-top: 1rem;
}

.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}

.modal-content {
  background-color: white;
  padding: 2rem;
  border-radius: 0.5rem;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  width: 90%;
  max-width: 500px;
  max-height: 90vh;
  overflow-y: auto;
}

.modal-buttons {
  display: flex;
  gap: 1rem;
  margin-top: 1.5rem;
}

.modal-buttons button {
  flex: 1;
}

.password-input {
  width: 100%;
  padding: 0.75rem;
  border: 1px solid var(--border-color);
  border-radius: 0.375rem;
  background-color: var(--input-background);
  font-size: 1rem;
}

.error-message {
  color: var(--error-color);
  margin: 0.5rem 0;
  font-size: 0.875rem;
}

.success-message {
  position: fixed;
  bottom: 1rem;
  left: 50%;
  transform: translateX(-50%);
  background-color: var(--success-color);
  color: white;
  padding: 0.75rem 1.5rem;
  border-radius: 0.375rem;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  z-index: 1000;
  animation: fadeIn 0.3s, fadeOut 0.3s 2.7s;
}

.password-strength-meter {
  width: 100%;
  height: 5px;
  background-color: #e0e0e0;
  border-radius: 3px;
  margin-top: 8px;
  overflow: hidden;
}

.password-strength-bar {
  height: 100%;
  transition: width 0.3s;
}

.password-strength-text {
  font-size: 0.8rem;
  margin-top: 4px;
  text-align: right;
}

.strength-very-weak {
  background-color: #ff4d4d;
  color: #ff4d4d;
}

.strength-weak {
  background-color: #ffa64d;
  color: #ffa64d;
}

.strength-medium {
  background-color: #ffff4d;
  color: #b3b300;
}

.strength-good {
  background-color: #4dff4d;
  color: #33cc33;
}

.strength-strong {
  background-color: #4db8ff;
  color: #4db8ff;
}

.warning-text {
  color: var(--warning-color);
  font-weight: bold;
  margin-bottom: 1rem;
  padding: 0.75rem;
  background-color: rgba(243, 156, 18, 0.1);
  border-radius: 0.375rem;
  border-left: 4px solid var(--warning-color);
}

.recovery-phrase-container {
  margin: 1.5rem 0;
  padding: 1rem;
  background-color: var(--input-background);
  border-radius: 0.375rem;
  border: 1px solid var(--border-color);
}

.recovery-phrase-words {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.5rem;
}

.seed-word {
  padding: 0.5rem;
  background-color: white;
  border-radius: 0.25rem;
  border: 1px solid var(--border-color);
  font-size: 0.9rem;
}

.word-number {
  color: var(--text-color);
  opacity: 0.6;
  margin-right: 0.25rem;
}

.header-container {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}

.back-button {
  background-color: var(--input-background);
  color: var(--text-color);
  border: 1px solid var(--border-color);
  padding: 0.5rem 1rem;
  border-radius: 0.375rem;
  cursor: pointer;
}

.back-icon {
  font-size: 1.25rem;
  margin-right: 0.25rem;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes fadeOut {
  from { opacity: 1; }
  to { opacity: 0; }
}
</style>
