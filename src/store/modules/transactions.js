// Initial state
const state = {
    transactions: [],
    lastSyncTimestamp: null
};

// Getters
const getters = {
    getTransactions: state => currency => {
        return state.transactions.filter(tx => tx.currency === currency);
    },
    getAllTransactions: state => {
        return state.transactions;
    },
    getTransactionById: state => txid => {
        return state.transactions.find(tx => tx.txid === txid);
    },
    getTransactionsByAddress: state => address => {
        return state.transactions.filter(tx => 
            tx.fromAddress === address || tx.toAddress === address
        );
    },
    getRecentTransactions: state => (count = 5) => {
        return [...state.transactions]
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
            .slice(0, count);
    },
    getTransactionsByDateRange: state => (startDate, endDate) => {
        const start = new Date(startDate).getTime();
        const end = new Date(endDate).getTime();
        return state.transactions.filter(tx => {
            const txTime = new Date(tx.timestamp).getTime();
            return txTime >= start && txTime <= end;
        });
    },
    getLastSyncTimestamp: state => state.lastSyncTimestamp
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

        // Add status if not present
        if (!transaction.status) {
            transaction.status = 'confirmed';
        }

        commit('ADD_TRANSACTION', transaction);
        
        // Store in chrome.storage.local
        try {
            const { transactions = [] } = await chrome.storage.local.get('transactions');
            // Check if transaction already exists to avoid duplicates
            if (!transactions.some(tx => tx.txid === transaction.txid)) {
                transactions.push(transaction);
                await chrome.storage.local.set({ transactions });
            }
        } catch (error) {
            console.error('Failed to store transaction:', error);
        }
    },

    async loadTransactions({ commit }) {
        try {
            const { transactions = [] } = await chrome.storage.local.get('transactions');
            commit('SET_TRANSACTIONS', transactions);
            commit('SET_LAST_SYNC', new Date().toISOString());
        } catch (error) {
            console.error('Failed to load transactions:', error);
            commit('SET_TRANSACTIONS', []);
        }
    },

    async updateTransactionStatus({ commit, state }, { txid, status }) {
        try {
            const transaction = state.transactions.find(tx => tx.txid === txid);
            if (transaction) {
                transaction.status = status;
                commit('UPDATE_TRANSACTION', transaction);
                
                // Update in storage
                const { transactions = [] } = await chrome.storage.local.get('transactions');
                const updatedTransactions = transactions.map(tx => 
                    tx.txid === txid ? { ...tx, status } : tx
                );
                await chrome.storage.local.set({ transactions: updatedTransactions });
            }
        } catch (error) {
            console.error('Failed to update transaction status:', error);
        }
    },

    async deleteTransaction({ commit, state }, txid) {
        try {
            commit('REMOVE_TRANSACTION', txid);
            
            // Update in storage
            const { transactions = [] } = await chrome.storage.local.get('transactions');
            const updatedTransactions = transactions.filter(tx => tx.txid !== txid);
            await chrome.storage.local.set({ transactions: updatedTransactions });
        } catch (error) {
            console.error('Failed to delete transaction:', error);
        }
    },
    
    async clearTransactionHistory({ commit }) {
        try {
            commit('SET_TRANSACTIONS', []);
            await chrome.storage.local.set({ transactions: [] });
        } catch (error) {
            console.error('Failed to clear transaction history:', error);
        }
    },
    
    async syncTransactionsWithNetwork({ commit, dispatch, rootState, state }) {
        try {
            // This would typically call the blockchain API to get the latest transactions
            // For now, we'll just update the lastSyncTimestamp
            commit('SET_LAST_SYNC', new Date().toISOString());
            
            // In a real implementation, you would:
            // 1. Get transactions from the network
            // 2. Compare with local storage
            // 3. Update status of existing transactions
            // 4. Add new transactions
        } catch (error) {
            console.error('Failed to sync transactions with network:', error);
        }
    }
};

// Mutations
const mutations = {
    ADD_TRANSACTION(state, transaction) {
        // Check for duplicates
        if (!state.transactions.some(tx => tx.txid === transaction.txid)) {
            state.transactions.unshift(transaction); // Add to beginning of array
        }
    },

    SET_TRANSACTIONS(state, transactions) {
        state.transactions = transactions;
    },
    
    UPDATE_TRANSACTION(state, updatedTransaction) {
        const index = state.transactions.findIndex(tx => tx.txid === updatedTransaction.txid);
        if (index !== -1) {
            state.transactions.splice(index, 1, updatedTransaction);
        }
    },
    
    REMOVE_TRANSACTION(state, txid) {
        state.transactions = state.transactions.filter(tx => tx.txid !== txid);
    },
    
    SET_LAST_SYNC(state, timestamp) {
        state.lastSyncTimestamp = timestamp;
    }
};

export default {
    namespaced: true,
    state,
    getters,
    actions,
    mutations
};
