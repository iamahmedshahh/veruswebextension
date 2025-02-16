<template>
  <nav class="navbar">
    <!-- Left Column: Logo -->
    <h1 class="navbar-logo" @click="">vExchange</h1>

    <!-- Center Column: Search Bar -->
    <div class="navbar-search">
      <input type="text" placeholder="Search..." class="search-input" />
    </div>

    <!-- Right Column: Connect Wallet & Theme Switcher -->
    <div class="navbar-actions">
      <div v-if="verusName" class="user-dropdown">
        <div @click="toggleUserDropdown" class="user-menu-toggle">
          <span class="username">{{ verusName }}</span>
          <i class="fas fa-chevron-down"></i>
        </div>
        <div v-if="showUserDropdown" class="dropdown-menu user-menu">
          <div class="dropdown-item" @click="logoutv">
            <i class="fas fa-sign-out-alt"></i>
            <span>Logout</span>
          </div>
        </div>
      </div>
      <button v-else @click="$emit('toggle-modal')" class="button-56">Connect Verus ID</button>

      <div v-if="!isConnected" class="wallet-section">
        <button 
          @click="connectVerusWallet" 
          class="button-56"
          :disabled="isConnecting"
        >
          <span v-if="isConnecting && !error">Connecting...</span>
          <span v-else-if="error && error.includes('approval')">Waiting for Approval...</span>
          <span v-else>Connect Verus Wallet</span>
        </button>
        <div v-if="error" class="wallet-error">
          <span>{{ error }}</span>
          <a 
            v-if="error.includes('not installed')" 
            href="https://verus.io/wallet" 
            target="_blank" 
            class="install-link"
          >
            Install Verus Wallet
          </a>
        </div>
      </div>
      <div v-else class="wallet-section">
        <!-- Network Display -->
        <div class="network-display" v-if="chainId">
          <span class="network-badge">{{ chainId }}</span>
        </div>
        
        <!-- Balance Display -->
        <div class="balance-display">
          <span class="balance-amount">{{ formatBalance(balance) }}</span>
          <span class="balance-currency">Total Balance</span>
        </div>
        
        <!-- Wallet Address with Copy and Logout Icons -->
        <div class="wallet-address">
          <i class="fa fa-copy" :class="{ 'copied': isCopied }" @click.left="copyToClipboard">
            {{ formattedAddress }}
          </i>
          <i class="fa fa-sign-out-alt" @click="disconnectWallet" style="margin-left: 10px; cursor: pointer;" />
        </div>
      </div>

      <div class="dropdown-container">
        <div @click="toggleSettingsDropdown" class="dropdown-toggle">
          <i class="fas fa-cog" style="font-size: 20px; cursor: pointer;"></i>
        </div>
        <div v-if="showSettingsDropdown" class="dropdown-menu">
          <router-link to="/wallet" class="button-56">Wallet</router-link>
        </div>
      </div>
    </div>
  </nav>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useVerusWallet } from './useVerusWallet';

// State
const showSettingsDropdown = ref(false);
const showUserDropdown = ref(false);
const isCopied = ref(false);
const verusName = ref(null);
const balance = ref('0');
const chainId = ref('testnet');

// Get wallet functionality from composable
const {
  address,
  isConnected,
  isConnecting,
  error,
  connectWallet,
  sendTransaction,
  getBalance,
  checkWalletInstalled
} = useVerusWallet();

// Computed properties
const formattedAddress = computed(() => {
  if (!address.value) return '';
  const addr = address.value;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
});

// Connect wallet
const connectVerusWallet = async () => {
  try {
    // Check if provider is available
    if (!checkWalletInstalled()) {
      window.open('https://verus.io/wallet', '_blank');
      return;
    }

    await connectWallet();
    await refreshBalance();
  } catch (err) {
    console.error('Failed to connect:', err);
  }
};

// Balance management
const refreshBalance = async () => {
  try {
    if (isConnected.value) {
      balance.value = await getBalance();
    }
  } catch (err) {
    console.error('Failed to refresh balance:', err);
  }
};

// Set up interval to refresh balance
onMounted(() => {
  if (isConnected.value) {
    refreshBalance();
  }
  const interval = setInterval(refreshBalance, 30000);
  onUnmounted(() => clearInterval(interval));
});

// Copy address to clipboard
const copyToClipboard = async () => {
  if (address.value) {
    try {
      await navigator.clipboard.writeText(address.value);
      isCopied.value = true;
      setTimeout(() => {
        isCopied.value = false;
      }, 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }
};

// Format balance
const formatBalance = (value) => {
  try {
    return parseFloat(value).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 8
    });
  } catch {
    return '0.00';
  }
};

// Toggle dropdowns
const toggleSettingsDropdown = () => {
  showSettingsDropdown.value = !showSettingsDropdown.value;
  if (showSettingsDropdown.value) showUserDropdown.value = false;
};

const toggleUserDropdown = () => {
  showUserDropdown.value = !showUserDropdown.value;
  if (showUserDropdown.value) showSettingsDropdown.value = false;
};

// Logout Verus ID
const logoutv = () => {
  showUserDropdown.value = false;
  verusName.value = null;
  emit('logout');
};

// Emit events
const emit = defineEmits(['toggle-modal', 'logout']);
</script>

<style scoped>
.navbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 2rem;
  background: var(--color-background);
  border-bottom: 1px solid var(--color-border);
}

.navbar-logo {
  font-size: 1.5rem;
  font-weight: bold;
  cursor: pointer;
}

.navbar-search {
  flex: 1;
  max-width: 500px;
  margin: 0 2rem;
}

.search-input {
  width: 100%;
  padding: 0.5rem 1rem;
  border-radius: 20px;
  border: 1px solid var(--color-border);
  background: var(--color-background-soft);
}

.navbar-actions {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.wallet-section {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.network-display {
  padding: 0.25rem 0.5rem;
  border-radius: 12px;
  background: var(--color-background-mute);
}

.network-badge {
  font-size: 0.8rem;
  color: var(--color-text-light);
}

.balance-display {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
}

.balance-amount {
  font-weight: bold;
  font-size: 1.1rem;
}

.balance-currency {
  font-size: 0.8rem;
  color: var(--color-text-light);
}

.wallet-address {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-family: monospace;
}

.wallet-error {
  position: absolute;
  top: 100%;
  right: 0;
  margin-top: 0.5rem;
  padding: 0.5rem;
  border-radius: 4px;
  background: var(--color-background-soft);
  border: 1px solid var(--color-border);
  font-size: 0.9rem;
  color: var(--color-error);
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.5rem;
}

.install-link {
  color: var(--color-primary);
  text-decoration: underline;
}

.dropdown-container {
  position: relative;
}

.dropdown-toggle {
  cursor: pointer;
}

.dropdown-menu {
  position: absolute;
  top: 100%;
  right: 0;
  margin-top: 0.5rem;
  padding: 0.5rem;
  border-radius: 4px;
  background: var(--color-background-soft);
  border: 1px solid var(--color-border);
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  min-width: 150px;
}

.user-dropdown {
  position: relative;
}

.user-menu-toggle {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
}

.user-menu {
  z-index: 100;
}

.dropdown-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem;
  cursor: pointer;
  transition: background 0.2s;
}

.dropdown-item:hover {
  background: var(--color-background-mute);
}

.button-56 {
  padding: 0.5rem 1rem;
  border-radius: 20px;
  background: var(--color-primary);
  color: white;
  border: none;
  cursor: pointer;
  transition: background 0.2s;
}

.button-56:hover {
  background: var(--color-primary-dark);
}

.button-56:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.copied {
  color: var(--color-success);
}
</style>
