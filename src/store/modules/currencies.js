import { verusRPC } from '../../services/VerusRPCService';

const MAX_CURRENCIES = 7;

export default {
    namespaced: true,
    
    state: {
        availableCurrencies: [],
        selectedCurrencies: ['VRSCTEST'], // Default currency
        balances: {},
        loading: false,
        error: null
    },

    mutations: {
        SET_AVAILABLE_CURRENCIES(state, currencies) {
            state.availableCurrencies = currencies;
        },
        SET_SELECTED_CURRENCIES(state, currencies) {
            state.selectedCurrencies = currencies;
        },
        SET_BALANCES(state, balances) {
            state.balances = balances;
        },
        UPDATE_BALANCE(state, { currency, balance }) {
            state.balances = {
                ...state.balances,
                [currency]: balance
            };
        },
        ADD_SELECTED_CURRENCY(state, currency) {
            if (!state.selectedCurrencies.includes(currency)) {
                state.selectedCurrencies.push(currency);
            }
        },
        REMOVE_SELECTED_CURRENCY(state, currency) {
            state.selectedCurrencies = state.selectedCurrencies.filter(
                c => c !== currency
            );
            // Also remove the balance
            const { [currency]: _, ...remainingBalances } = state.balances;
            state.balances = remainingBalances;
        },
        SET_LOADING(state, loading) {
            state.loading = loading;
        },
        SET_ERROR(state, error) {
            state.error = error;
        }
    },

    actions: {
        async fetchAvailableCurrencies({ commit }) {
            commit('SET_LOADING', true);
            commit('SET_ERROR', null);
            
            try {
                const currencies = await verusRPC.listCurrencies();
                commit('SET_AVAILABLE_CURRENCIES', currencies);
            } catch (error) {
                console.error('Failed to fetch currencies:', error);
                commit('SET_ERROR', 'Failed to fetch available currencies');
                commit('SET_AVAILABLE_CURRENCIES', ['VRSCTEST']);
            } finally {
                commit('SET_LOADING', false);
            }
        },

        async fetchBalances({ commit, state, rootState }) {
            if (!rootState.wallet.address) {
                console.warn('No wallet address available');
                return;
            }

            commit('SET_LOADING', true);
            try {
                const balances = await verusRPC.getAllCurrencyBalances(
                    rootState.wallet.address
                );
                commit('SET_BALANCES', balances);
            } catch (error) {
                console.error('Failed to fetch balances:', error);
                commit('SET_ERROR', 'Failed to fetch balances');
            } finally {
                commit('SET_LOADING', false);
            }
        },

        async selectCurrency({ commit, dispatch, rootState }, currency) {
            commit('ADD_SELECTED_CURRENCY', currency);
            
            // Fetch the balance for the new currency
            if (rootState.wallet.address) {
                try {
                    const balance = await verusRPC.getBalance(
                        rootState.wallet.address,
                        currency
                    );
                    commit('UPDATE_BALANCE', { currency, balance });
                } catch (error) {
                    console.error(`Failed to fetch balance for ${currency}:`, error);
                }
            }
        },

        unselectCurrency({ commit }, currency) {
            commit('REMOVE_SELECTED_CURRENCY', currency);
        }
    },

    getters: {
        getAvailableCurrencies: state => state.availableCurrencies,
        getSelectedCurrencies: state => state.selectedCurrencies,
        getBalance: state => currency => state.balances[currency] || 0,
        isLoading: state => state.loading,
        getError: state => state.error,
        canAddMoreCurrencies: state => state.selectedCurrencies.length < MAX_CURRENCIES
    }
};
