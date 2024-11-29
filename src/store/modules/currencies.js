import { verusRPC } from '../../services/VerusRPCService';

const MAX_CURRENCIES = 7;

export default {
    namespaced: true,
    
    state: {
        availableCurrencies: [],
        selectedCurrencies: ['vrsctest'], // Default currency
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
        ADD_SELECTED_CURRENCY(state, currency) {
            if (!state.selectedCurrencies.includes(currency) && state.selectedCurrencies.length < MAX_CURRENCIES) {
                state.selectedCurrencies.push(currency);
            }
        },
        REMOVE_SELECTED_CURRENCY(state, currency) {
            if (state.selectedCurrencies.length > 1) {
                state.selectedCurrencies = state.selectedCurrencies.filter(c => c !== currency);
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

        selectCurrency({ commit }, currency) {
            commit('ADD_SELECTED_CURRENCY', currency);
        },

        unselectCurrency({ commit }, currency) {
            commit('REMOVE_SELECTED_CURRENCY', currency);
        }
    },

    getters: {
        getAvailableCurrencies: state => state.availableCurrencies,
        getSelectedCurrencies: state => state.selectedCurrencies,
        isLoading: state => state.loading,
        getError: state => state.error,
        canAddMoreCurrencies: state => state.selectedCurrencies.length < MAX_CURRENCIES
    }
};
