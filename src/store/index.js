import { createStore } from 'vuex';
import wallet from './modules/wallet';
import currencies from './modules/currencies';
import identity from './modules/identity';
import transactions from './modules/transactions';

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
        identity,
        transactions
    }
});

export default store;
