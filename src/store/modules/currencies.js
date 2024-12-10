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
            // Ensure default currency is always included
            if (!currencies.includes(DEFAULT_CURRENCY)) {
                currencies = [DEFAULT_CURRENCY, ...currencies];
            }
            state.selectedCurrencies = currencies;
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
        async initialize({ dispatch }) {
            await dispatch('fetchAvailableCurrencies');
            await dispatch('loadPersistedState');
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
                const balances = await verusRPC.getAllCurrencyBalances(
                    rootState.wallet.address
                );
                console.log('Fetched balances:', balances);
                commit('SET_BALANCES', balances);

                // Save selected currencies to browser storage
                try {
                    await browser.storage.local.set({
                        selectedCurrencies: state.selectedCurrencies
                    });
                } catch (error) {
                    console.warn('Failed to save selected currencies:', error);
                }
            } catch (error) {
                console.error('Failed to fetch balances:', error);
                commit('SET_ERROR', 'Failed to fetch balances');
            } finally {
                commit('SET_LOADING', false);
            }
        },

        async loadPersistedState({ commit }) {
            try {
                const data = await browser.storage.local.get(['selectedCurrencies']);
                if (data.selectedCurrencies && Array.isArray(data.selectedCurrencies)) {
                    // Ensure VRSCTEST is always included
                    const currencies = data.selectedCurrencies.includes(DEFAULT_CURRENCY)
                        ? data.selectedCurrencies
                        : [DEFAULT_CURRENCY, ...data.selectedCurrencies];
                    commit('SET_SELECTED_CURRENCIES', currencies);
                } else {
                    // If no currencies are stored, set default currency
                    commit('SET_SELECTED_CURRENCIES', [DEFAULT_CURRENCY]);
                }
            } catch (error) {
                console.warn('Failed to load persisted state:', error);
                // Set default currency if loading fails
                commit('SET_SELECTED_CURRENCIES', [DEFAULT_CURRENCY]);
            }
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
        canAddMoreCurrencies: state => state.selectedCurrencies.length < MAX_CURRENCIES,
        getCurrencyDefinition: state => currency => state.currencyDefinitions[currency]
    }
};
