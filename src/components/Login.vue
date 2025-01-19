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
        />
      </div>

      <div v-if="error" class="error-message">
        {{ error }}
      </div>

      <button type="submit" class="login-button" :disabled="loading">
        <span v-if="loading">Logging in...</span>
        <span v-else>Login</span>
      </button>
    </form>
  </div>
</template>

<script>
import { ref } from 'vue';
import { useStore } from 'vuex';

export default {
  name: 'Login',
  setup() {
    const store = useStore();
    const password = ref('');
    const error = ref('');
    const loading = ref(false);

    const handleLogin = async () => {
      try {
        error.value = '';
        loading.value = true;
        await store.dispatch('wallet/login', password.value);
      } catch (err) {
        error.value = err.message || 'Failed to login';
      } finally {
        loading.value = false;
      }
    };

    return {
      password,
      error,
      loading,
      handleLogin
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
</style>
