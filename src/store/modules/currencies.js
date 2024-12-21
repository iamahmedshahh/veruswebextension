import { verusRPC } from '../../services/VerusRPCService';
import storage from '../services/StorageService';

const MAX_CURRENCIES = 7;
const DEFAULT_CURRENCY = 'VRSCTEST';

export default {
    namespaced: true,
    
    state: {
        availableCurrencies: [],
        selectedCurrencies: [DEFAULT_CURRENCY],
        balances: {},
        currencyDefinitions: {},
        loading: false,
        error: null
    },

    mutations: {
        SET_AVAILABLE_CURRENCIES(state, currencies) {
            state.availableCurrencies = currencies;
            
            // Update currency definitions
            const definitions = {};
            currencies.forEach(currency => {
                if (currency?.currencydefinition) {
                    const def = currency.currencydefinition;
                    const name = def.fullyqualifiedname || def.name;
                    definitions[name] = def;
                }
            });
            state.currencyDefinitions = definitions;
        },

        SET_SELECTED_CURRENCIES(state, currencies) {
            // Ensure default currency is always included and at the start of the array
            const uniqueCurrencies = [...new Set([DEFAULT_CURRENCY, ...currencies])];
            state.selectedCurrencies = uniqueCurrencies;
        },

        SET_BALANCES(state, balances) {
            const updatedBalances = {};
            Object.entries(balances).forEach(([currency, balance]) => {
                const def = state.currencyDefinitions[currency];
                const currencyName = def ? (def.fullyqualifiedname || def.name) : currency;
                updatedBalances[currencyName] = balance;
            });
            state.balances = updatedBalances;
            console.log('Updated balances in store:', updatedBalances);
        },

        SET_LOADING(state, loading) {
            state.loading = loading;
        },

        SET_ERROR(state, error) {
            state.error = error;
        }
    },

    actions: {
        async initialize({ dispatch, commit }) {
            await dispatch('fetchAvailableCurrencies');
            await dispatch('loadPersistedState');
            await dispatch('fetchBalances');
        },

        async loadPersistedState({ commit }) {
            try {
                const { selectedCurrencies } = await storage.get(['selectedCurrencies']);
                
                if (selectedCurrencies && selectedCurrencies.length > 0) {
                    commit('SET_SELECTED_CURRENCIES', selectedCurrencies);
                    return { selectedCurrencies };
                }
                
                // Set default if no persisted state
                commit('SET_SELECTED_CURRENCIES', [DEFAULT_CURRENCY]);
                return null;
            } catch (error) {
                console.error('Failed to load persisted state:', error);
                commit('SET_ERROR', 'Failed to load saved currencies');
                return null;
            }
        },

        async persistSelectedCurrencies({ state }) {
            try {
                await storage.set({ selectedCurrencies: state.selectedCurrencies });
            } catch (error) {
                console.error('Failed to persist selected currencies:', error);
            }
        },

        async selectCurrency({ commit, dispatch, state }, currency) {
            if (state.selectedCurrencies.length >= MAX_CURRENCIES) {
                commit('SET_ERROR', `Cannot select more than ${MAX_CURRENCIES} currencies`);
                return;
            }
            
            if (!state.selectedCurrencies.includes(currency)) {
                const newSelection = [...state.selectedCurrencies, currency];
                commit('SET_SELECTED_CURRENCIES', newSelection);
                await dispatch('persistSelectedCurrencies');
                await dispatch('fetchBalances');
            }
        },

        async unselectCurrency({ commit, dispatch, state }, currency) {
            if (currency === DEFAULT_CURRENCY) {
                commit('SET_ERROR', 'Cannot unselect default currency');
                return;
            }
            
            const newSelection = state.selectedCurrencies.filter(c => c !== currency);
            commit('SET_SELECTED_CURRENCIES', newSelection);
            await dispatch('persistSelectedCurrencies');
            await dispatch('fetchBalances');
        },

        async fetchAvailableCurrencies({ commit }) {
            commit('SET_LOADING', true);
            commit('SET_ERROR', null);
            
            try {
                const currencies = await verusRPC.listCurrencies();
                if (Array.isArray(currencies)) {
                    commit('SET_AVAILABLE_CURRENCIES', currencies);
                } else {
                    throw new Error('Invalid currency list response');
                }
            } catch (error) {
                console.error('Failed to fetch currencies:', error);
                commit('SET_ERROR', 'Failed to fetch available currencies');
                commit('SET_AVAILABLE_CURRENCIES', []);
            } finally {
                commit('SET_LOADING', false);
            }
        },

        async fetchBalances({ commit, state, rootState }) {
            if (!rootState.wallet.address) {
                console.log('No wallet address available');
                return;
            }

            commit('SET_LOADING', true);
            commit('SET_ERROR', null);

            try {
                const balances = await verusRPC.getAllCurrencyBalances(rootState.wallet.address);
                commit('SET_BALANCES', balances);
            } catch (error) {
                console.error('Failed to fetch balances:', error);
                commit('SET_ERROR', 'Failed to fetch balances');
            } finally {
                commit('SET_LOADING', false);
            }
        }
    },

    getters: {
        getAvailableCurrencies: state => state.availableCurrencies,
        getSelectedCurrencies: state => state.selectedCurrencies,
        getBalances: state => state.balances,
        isLoading: state => state.loading,
        hasError: state => !!state.error,
        getError: state => state.error
    }
};
