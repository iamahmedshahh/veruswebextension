<template>
  <div class="login-container">
    <h2>Welcome Back</h2>
    <p>Enter your password to access your wallet</p>

    <form @submit.prevent="handleLogin" class="login-form">
      <div class="form-group">
        <input
          type="password"
          v-model="password"
          placeholder="Enter your password"
          required
          class="password-input"
          ref="passwordInput"
          autocomplete="current-password"
          :disabled="isLocked"
        />
      </div>

      <div v-if="error" class="error-message">
        {{ error }}
      </div>

      <div v-if="isLocked" class="warning-message">
        <p>Too many failed attempts. Please wait {{ lockTimeRemaining }} seconds before trying again.</p>
      </div>

      <button type="submit" class="login-button" :disabled="loading || isLocked">
        <span v-if="loading">
          <span class="spinner"></span> Verifying...
        </span>
        <span v-else>Login</span>
      </button>
    </form>

    <div v-if="attemptsRemaining < 5 && !isLocked" class="warning-message">
      <p>{{ attemptsRemaining }} attempts remaining before temporary lockout</p>
    </div>
  </div>
</template>

<script>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { useStore } from 'vuex';

// Constant verification time to prevent timing attacks
const VERIFICATION_DELAY_MS = 600;

// Security settings
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION_SEC = 30;

export default {
  name: 'Login',
  setup() {
    const store = useStore();
    const password = ref('');
    const error = ref('');
    const loading = ref(false);
    const passwordInput = ref(null);
    const loginAttempts = ref(0);
    const lockedUntil = ref(0);
    const currentTime = ref(Date.now());
    const timerInterval = ref(null);

    // Compute if login is currently locked due to too many attempts
    const isLocked = computed(() => {
      return lockedUntil.value > currentTime.value;
    });

    // Compute number of attempts remaining before lockout
    const attemptsRemaining = computed(() => {
      return MAX_LOGIN_ATTEMPTS - loginAttempts.value;
    });

    // Compute time remaining on lockout in seconds
    const lockTimeRemaining = computed(() => {
      if (!isLocked.value) return 0;
      return Math.ceil((lockedUntil.value - currentTime.value) / 1000);
    });

    // Update current time every second for countdown display
    onMounted(() => {
      timerInterval.value = setInterval(() => {
        currentTime.value = Date.now();
        if (isLocked.value === false && loginAttempts.value > 0) {
          // Reset attempts after lockout period expires
          loginAttempts.value = 0;
        }
      }, 1000);

      // Focus the password input
      if (passwordInput.value) {
        passwordInput.value.focus();
      }
    });

    // Clear the interval when component is destroyed
    onBeforeUnmount(() => {
      if (timerInterval.value) {
        clearInterval(timerInterval.value);
      }
    });

    // Clear sensitive data when component is unmounted
    const clearSensitiveData = () => {
      // Explicitly overwrite password in memory before setting to empty
      if (password.value) {
        password.value = '0'.repeat(password.value.length);
        setTimeout(() => {
          password.value = '';
        }, 10);
      }
    };

    onBeforeUnmount(clearSensitiveData);

    // Apply a constant verification time to prevent timing attacks
    const applyConstantTimeVerification = async (fn) => {
      const startTime = Date.now();
      try {
        return await fn();
      } finally {
        const elapsedTime = Date.now() - startTime;
        const remainingTime = Math.max(0, VERIFICATION_DELAY_MS - elapsedTime);
        if (remainingTime > 0) {
          await new Promise(resolve => setTimeout(resolve, remainingTime));
        }
      }
    };

    const handleLoginFailure = (message) => {
      loginAttempts.value++;
      error.value = message || 'Invalid password. Please try again.';
      
      // Lock login after too many attempts
      if (loginAttempts.value >= MAX_LOGIN_ATTEMPTS) {
        lockedUntil.value = Date.now() + (LOCKOUT_DURATION_SEC * 1000);
        error.value = `Too many failed attempts. Account locked for ${LOCKOUT_DURATION_SEC} seconds.`;
      }
      
      // Clear the password field after a failure
      password.value = '';
    };

    const handleLogin = async () => {
      if (isLocked.value) {
        return;
      }

      try {
        error.value = '';
        loading.value = true;

        // Apply constant time verification to prevent timing attacks
        await applyConstantTimeVerification(async () => {
          await store.dispatch('wallet/login', password.value);
        });
        
        // Reset login attempts on successful login
        loginAttempts.value = 0;
        
        // Clear the password from memory immediately after successful login
        clearSensitiveData();
      } catch (err) {
        handleLoginFailure(err.message || 'Failed to login');
      } finally {
        loading.value = false;
      }
    };

    return {
      password,
      error,
      loading,
      handleLogin,
      passwordInput,
      isLocked,
      attemptsRemaining,
      lockTimeRemaining
    };
  }
};
</script>

<style scoped>
.login-container {
  padding: 2rem;
  text-align: center;
}

.login-form {
  margin-top: 2rem;
}

.form-group {
  margin-bottom: 1rem;
}

.password-input {
  width: 100%;
  padding: 0.75rem;
  border: 1px solid var(--border-color);
  border-radius: 0.5rem;
  background-color: var(--input-background);
  font-size: 1rem;
}

.login-button {
  width: 100%;
  padding: 0.75rem;
  background-color: var(--primary-color);
  color: white;
  border: none;
  border-radius: 0.5rem;
  font-size: 1rem;
  cursor: pointer;
  transition: background-color 0.2s, opacity 0.2s;
}

.login-button:hover {
  background-color: #2980b9;
}

.login-button:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.error-message {
  color: var(--error-color);
  margin-bottom: 1rem;
  font-size: 0.875rem;
}

.warning-message {
  color: var(--warning-color, #f39c12);
  margin-bottom: 1rem;
  font-size: 0.875rem;
}

.spinner {
  display: inline-block;
  width: 1em;
  height: 1em;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spinner 0.6s linear infinite;
  margin-right: 0.5rem;
}

@keyframes spinner {
  to {
    transform: rotate(360deg);
  }
}
</style>
