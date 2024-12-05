<template>
    <div class="connect-popup">
        <div class="header">
            <img src="../assets/logo.png" alt="Verus Logo" class="logo">
            <h2>Connect to {{ origin }}</h2>
        </div>

        <div class="content">
            <p>This site is requesting access to:</p>
            <ul class="permissions">
                <li>
                    <span class="permission-icon">✓</span>
                    View your Verus address
                </li>
                <li>
                    <span class="permission-icon">✓</span>
                    Request transaction signatures
                </li>
            </ul>

            <div class="account-select" v-if="accounts.length > 0">
                <label>Connect with account:</label>
                <select v-model="selectedAccount">
                    <option v-for="account in accounts" 
                            :key="account.address" 
                            :value="account.address">
                        {{ account.name }} ({{ account.address }})
                    </option>
                </select>
            </div>
        </div>

        <div class="actions">
            <button class="btn-cancel" @click="reject">Cancel</button>
            <button class="btn-connect" 
                    @click="approve"
                    :disabled="!selectedAccount">
                Connect
            </button>
        </div>
    </div>
</template>

<script>
import { ref, onMounted } from 'vue';
import { useStore } from 'vuex';

export default {
    name: 'ConnectPopup',

    setup() {
        const store = useStore();
        const accounts = ref([]);
        const selectedAccount = ref(null);
        const origin = ref('');

        onMounted(async () => {
            // Get site origin from URL parameters
            const params = new URLSearchParams(window.location.search);
            origin.value = params.get('origin') || 'Unknown Site';

            // Load accounts from store
            accounts.value = await store.dispatch('wallet/getAccounts');
            if (accounts.value.length > 0) {
                selectedAccount.value = accounts.value[0].address;
            }
        });

        const approve = () => {
            chrome.runtime.sendMessage({
                type: 'CONNECT_RESPONSE',
                approved: true,
                address: selectedAccount.value
            });
        };

        const reject = () => {
            chrome.runtime.sendMessage({
                type: 'CONNECT_RESPONSE',
                approved: false
            });
        };

        return {
            accounts,
            selectedAccount,
            origin,
            approve,
            reject
        };
    }
};
</script>

<style scoped>
.connect-popup {
    padding: 1.5rem;
    max-width: 360px;
    margin: 0 auto;
}

.header {
    text-align: center;
    margin-bottom: 1.5rem;
}

.logo {
    width: 48px;
    height: 48px;
    margin-bottom: 1rem;
}

.content {
    margin-bottom: 1.5rem;
}

.permissions {
    list-style: none;
    padding: 0;
    margin: 1rem 0;
}

.permission-icon {
    margin-right: 0.5rem;
    color: var(--primary-color);
}

.account-select {
    margin-top: 1.5rem;
}

.account-select select {
    width: 100%;
    padding: 0.5rem;
    margin-top: 0.5rem;
    border-radius: 4px;
    border: 1px solid var(--border-color);
}

.actions {
    display: flex;
    gap: 1rem;
}

.actions button {
    flex: 1;
    padding: 0.75rem;
    border-radius: 4px;
    border: none;
    cursor: pointer;
}

.btn-cancel {
    background-color: var(--background-secondary);
    color: var(--text-primary);
}

.btn-connect {
    background-color: var(--primary-color);
    color: white;
}

.btn-connect:disabled {
    opacity: 0.5;
    cursor: not-allowed;
}
</style>
