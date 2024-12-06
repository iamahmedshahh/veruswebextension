<template>
    <div class="sign-popup">
        <div class="header">
            <img src="../assets/logo.png" alt="Verus Logo" class="logo">
            <h2>Sign Transaction</h2>
            <p class="origin">{{ origin }}</p>
        </div>

        <div class="content">
            <div class="transaction-details">
                <h3>Transaction Details</h3>
                <div class="detail-row">
                    <span class="label">From:</span>
                    <span class="value">{{ transaction.from }}</span>
                </div>
                <div class="detail-row">
                    <span class="label">To:</span>
                    <span class="value">{{ transaction.to }}</span>
                </div>
                <div class="detail-row">
                    <span class="label">Amount:</span>
                    <span class="value">{{ transaction.amount }} VRSCTEST</span>
                </div>
                <div class="detail-row">
                    <span class="label">Fee:</span>
                    <span class="value">{{ transaction.fee }} VRSCTEST</span>
                </div>
            </div>

            <div class="warning" v-if="showWarning">
                <span class="warning-icon">⚠️</span>
                <span class="warning-text">{{ warningMessage }}</span>
            </div>
        </div>

        <div class="actions">
            <button class="btn-cancel" @click="reject">Reject</button>
            <button class="btn-sign" @click="approve">Sign</button>
        </div>
    </div>
</template>

<script>
import { ref, onMounted } from 'vue';
import { useStore } from 'vuex';

export default {
    name: 'SignPopup',

    setup() {
        const store = useStore();
        const origin = ref('');
        const transaction = ref({});
        const showWarning = ref(false);
        const warningMessage = ref('');

        onMounted(async () => {
            // Get transaction details from URL parameters
            const params = new URLSearchParams(window.location.search);
            origin.value = params.get('origin') || 'Unknown Site';
            
            // Get transaction from background script
            const txData = JSON.parse(params.get('transaction') || '{}');
            transaction.value = txData;

            // Check for potential warnings
            validateTransaction();
        });

        const validateTransaction = () => {
            // Example validation - you can add more checks
            if (transaction.value.amount > 1000) {
                showWarning.value = true;
                warningMessage.value = 'Large transaction amount detected';
            }
        };

        const approve = async () => {
            try {
                // Sign the transaction using the wallet
                const signature = await store.dispatch('wallet/signTransaction', transaction.value);
                
                chrome.runtime.sendMessage({
                    type: 'SIGN_RESPONSE',
                    approved: true,
                    signature
                });
            } catch (error) {
                console.error('Failed to sign transaction:', error);
                chrome.runtime.sendMessage({
                    type: 'SIGN_RESPONSE',
                    approved: false,
                    error: error.message
                });
            }
        };

        const reject = () => {
            chrome.runtime.sendMessage({
                type: 'SIGN_RESPONSE',
                approved: false
            });
        };

        return {
            origin,
            transaction,
            showWarning,
            warningMessage,
            approve,
            reject
        };
    }
};
</script>

<style scoped>
.sign-popup {
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

.origin {
    color: var(--text-secondary);
    margin-top: 0.5rem;
}

.transaction-details {
    background-color: var(--background-secondary);
    border-radius: 8px;
    padding: 1rem;
    margin-bottom: 1.5rem;
}

.detail-row {
    display: flex;
    justify-content: space-between;
    margin-bottom: 0.5rem;
}

.label {
    color: var(--text-secondary);
}

.warning {
    background-color: var(--warning-background);
    border-radius: 8px;
    padding: 1rem;
    margin-bottom: 1.5rem;
    display: flex;
    align-items: center;
    gap: 0.5rem;
}

.warning-icon {
    font-size: 1.25rem;
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

.btn-sign {
    background-color: var(--primary-color);
    color: white;
}
</style>
