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
    addTransaction({ commit }, transaction) {
        // Add timestamp if not present
        if (!transaction.timestamp) {
            transaction.timestamp = new Date().toISOString();
        }
        commit('ADD_TRANSACTION', transaction);
        
        // Store in local storage
        const storedTxs = JSON.parse(localStorage.getItem('transactions') || '[]');
        storedTxs.push(transaction);
        localStorage.setItem('transactions', JSON.stringify(storedTxs));
    },

    loadTransactions({ commit }) {
        const storedTxs = JSON.parse(localStorage.getItem('transactions') || '[]');
        commit('SET_TRANSACTIONS', storedTxs);
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
