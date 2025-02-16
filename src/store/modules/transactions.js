// Initial state
const state = {
    transactions: []
};

// Getters
const getters = {
    getTransactions: state => currency => {
        return state.transactions.filter(tx => tx.currency === currency);
    }
};

// Actions
const actions = {
    async addTransaction({ commit }, transaction) {
        // Add timestamp if not present
        if (!transaction.timestamp) {
            transaction.timestamp = new Date().toISOString();
        }

        // Ensure isNonUtxo is stored correctly
        if (transaction.isNonUtxo === undefined) {
            console.warn('Transaction missing isNonUtxo flag:', transaction);
        }

        commit('ADD_TRANSACTION', transaction);
        
        // Store in chrome.storage.local
        try {
            const { transactions = [] } = await chrome.storage.local.get('transactions');
            transactions.push(transaction);
            await chrome.storage.local.set({ transactions });
        } catch (error) {
            console.error('Failed to store transaction:', error);
        }
    },

    async loadTransactions({ commit }) {
        try {
            const { transactions = [] } = await chrome.storage.local.get('transactions');
            commit('SET_TRANSACTIONS', transactions);
        } catch (error) {
            console.error('Failed to load transactions:', error);
            commit('SET_TRANSACTIONS', []);
        }
    }
};

// Mutations
const mutations = {
    ADD_TRANSACTION(state, transaction) {
        state.transactions.unshift(transaction); // Add to beginning of array
    },

    SET_TRANSACTIONS(state, transactions) {
        state.transactions = transactions;
    }
};

export default {
    namespaced: true,
    state,
    getters,
    actions,
    mutations
};
