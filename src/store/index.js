import { createStore } from 'vuex';
import wallet from './modules/wallet';
import currencies from './modules/currencies';
import transactions from './modules/transactions';
import network from './modules/network';

export const store = createStore({
    state: {
        isLoadingBalances: false,
    },
    mutations: {
        SET_LOADING_BALANCES(state, loading) {
            state.isLoadingBalances = loading;
        },
    },
    actions: {
        async initialize({ dispatch }) {
            // Initialize network first
            await dispatch('network/initialize');
            // Then initialize other modules
            await dispatch('wallet/initialize');
            await dispatch('currencies/initialize');
            await dispatch('transactions/initialize');
        },
        async updateBalances({ commit, state }) {
            try {
                commit('SET_LOADING_BALANCES', true);
                const balances = await VerusRPCService.getAllCurrencyBalances(state.currentAddress);
                commit('SET_BALANCES', balances);
            } catch (error) {
                console.error('Error updating balances:', error);
            } finally {
                commit('SET_LOADING_BALANCES', false);
            }
        },
    },
    modules: {
        wallet,
        currencies,
        transactions,
        network
    }
});

export default store;
