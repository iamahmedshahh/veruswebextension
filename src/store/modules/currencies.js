import { verusRPC } from '../../services/VerusRPCService';

const MAX_CURRENCIES = 7;

export default {
    namespaced: true,
    
    state: {
        availableCurrencies: [],
        selectedCurrencies: ['vrsctest'], // Default currency
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
            if (!state.selectedCurrencies.includes(currency) && state.selectedCurrencies.length < MAX_CURRENCIES) {
                state.selectedCurrencies.push(currency);
            }
        },
        REMOVE_SELECTED_CURRENCY(state, currency) {
            if (state.selectedCurrencies.length > 1) {
                state.selectedCurrencies = state.selectedCurrencies.filter(c => c !== currency);
                // Also remove the balance
                const newBalances = { ...state.balances };
                delete newBalances[currency];
                state.balances = newBalances;
            }
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
                commit('SET_ERROR', error.message);
            } finally {
                commit('SET_LOADING', false);
            }
        },

        async fetchBalances({ commit, state, rootState }) {
            if (!rootState.wallet.address) {
                console.error('No wallet address available');
                return;
            }

            commit('SET_LOADING', true);
            try {
                const currenciesWithBalances = await verusRPC.getAllCurrencyBalances(rootState.wallet.address);
                const balances = {};
                currenciesWithBalances.forEach(currency => {
                  balances[currency.name] = currency.balance;
                });
                commit('SET_BALANCES', balances);
            } catch (error) {
                console.error('Failed to fetch balances:', error);
                commit('SET_ERROR', error.message);
            } finally {
                commit('SET_LOADING', false);
            }
        },

        async selectCurrency({ commit, dispatch, rootState }, currency) {
            commit('ADD_SELECTED_CURRENCY', currency);
            // Fetch balance for the new currency
            if (rootState.wallet.address) {
                try {
                    const balance = await verusRPC.getBalance(rootState.wallet.address, currency);
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
        getAllBalances: state => state.balances,
        isLoading: state => state.loading,
        getError: state => state.error,
        canAddMoreCurrencies: state => state.selectedCurrencies.length < MAX_CURRENCIES
    }
};
