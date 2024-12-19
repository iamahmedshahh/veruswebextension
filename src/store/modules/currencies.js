import { verusRPC } from '../../services/VerusRPCService';
import browser from 'webextension-polyfill';

const MAX_CURRENCIES = 7;
const DEFAULT_CURRENCY = 'VRSCTEST';

export default {
    namespaced: true,
    
    state: {
        availableCurrencies: [],
        selectedCurrencies: [DEFAULT_CURRENCY], // Default currency
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
            
            // Persist the updated selection
            browser.storage.local.set({ selectedCurrencies: uniqueCurrencies }).catch(error => {
                console.error('Error persisting selected currencies:', error);
            });
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
            const persistedState = await dispatch('loadPersistedState');
            
            // If no currencies were loaded from persistent state, ensure default currency is set
            if (!persistedState || !persistedState.selectedCurrencies || persistedState.selectedCurrencies.length === 0) {
                commit('SET_SELECTED_CURRENCIES', [DEFAULT_CURRENCY]);
            }
            
            // Fetch balances after initialization
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
                console.warn('No wallet address available');
                return;
            }

            commit('SET_LOADING', true);
            try {
                // Always include DEFAULT_CURRENCY in the request
                if (!state.selectedCurrencies.includes(DEFAULT_CURRENCY)) {
                    commit('SET_SELECTED_CURRENCIES', [DEFAULT_CURRENCY]);
                }
                
                const balances = await verusRPC.getAllCurrencyBalances(
                    rootState.wallet.address
                );
                
                commit('SET_BALANCES', balances || {});
            } catch (error) {
                console.error('Failed to fetch balances:', error);
                commit('SET_ERROR', 'Failed to fetch balances');
                commit('SET_BALANCES', {});
            } finally {
                commit('SET_LOADING', false);
            }
        },

        async loadPersistedState({ commit }) {
            try {
                const result = await browser.storage.local.get(['selectedCurrencies']);
                if (result.selectedCurrencies) {
                    commit('SET_SELECTED_CURRENCIES', result.selectedCurrencies);
                    return result;
                }
            } catch (error) {
                console.error('Error loading persisted state:', error);
                commit('SET_ERROR', 'Failed to load saved currencies');
            }
            return null;
        },

        async selectCurrency({ commit, dispatch, state }, currency) {
            if (state.selectedCurrencies.length >= MAX_CURRENCIES) {
                commit('SET_ERROR', `Cannot add more than ${MAX_CURRENCIES} currencies`);
                return;
            }

            const newSelected = [...state.selectedCurrencies];
            if (!newSelected.includes(currency)) {
                newSelected.push(currency);
                commit('SET_SELECTED_CURRENCIES', newSelected);
                
                try {
                    await browser.storage.local.set({
                        selectedCurrencies: newSelected
                    });
                } catch (error) {
                    console.warn('Failed to save selected currencies:', error);
                }
            }
            
            await dispatch('fetchBalances');
        },

        async unselectCurrency({ commit, dispatch, state }, currency) {
            // Don't allow unselecting VRSCTEST
            if (currency === DEFAULT_CURRENCY) {
                return;
            }

            const newSelected = state.selectedCurrencies.filter(c => c !== currency);
            commit('SET_SELECTED_CURRENCIES', newSelected);
            
            try {
                await browser.storage.local.set({
                    selectedCurrencies: newSelected
                });
            } catch (error) {
                console.warn('Failed to save selected currencies:', error);
            }
            
            await dispatch('fetchBalances');
        }
    },

    getters: {
        getAvailableCurrencies: state => state.availableCurrencies,
        getSelectedCurrencies: state => state.selectedCurrencies,
        getBalance: state => currency => state.balances[currency] || 0,
        getTotalBalance: state => {
            let total = 0;
            Object.values(state.balances).forEach(balance => {
                total += parseFloat(balance) || 0;
            });
            return total;
        },
        canAddMoreCurrencies: state => state.selectedCurrencies.length < MAX_CURRENCIES,
        getCurrencyDefinition: state => currency => state.currencyDefinitions[currency]
    }
};
