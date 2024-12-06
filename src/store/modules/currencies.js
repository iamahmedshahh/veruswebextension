import { verusRPC } from '../../services/VerusRPCService';

const MAX_CURRENCIES = 7;

export default {
    namespaced: true,
    
    state: {
        availableCurrencies: [],
        selectedCurrencies: ['VRSCTEST'], // Default currency
        balances: {},
        currencyDefinitions: {}, // Store currency definitions
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
            state.selectedCurrencies = currencies;
        },
        SET_BALANCES(state, balances) {
            // Update balances with proper currency names
            const updatedBalances = {};
            Object.entries(balances).forEach(([currency, balance]) => {
                // Use the currency definition name if available
                const def = state.currencyDefinitions[currency];
                const currencyName = def ? (def.fullyqualifiedname || def.name) : currency;
                updatedBalances[currencyName] = balance;
            });
            state.balances = updatedBalances;
            console.log('Updated balances in store:', updatedBalances);
        },
        UPDATE_BALANCE(state, { currency, balance }) {
            const currencyName = state.currencyDefinitions[currency]?.fullyqualifiedname || currency;
            state.balances = {
                ...state.balances,
                [currencyName]: balance
            };
        },
        ADD_SELECTED_CURRENCY(state, currency) {
            const currencyName = state.currencyDefinitions[currency]?.fullyqualifiedname || currency;
            if (!state.selectedCurrencies.includes(currencyName)) {
                state.selectedCurrencies.push(currencyName);
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

                // Update selected currencies based on available balances
                const currenciesWithBalance = Object.keys(balances).filter(currency => 
                    balances[currency] > 0 && !state.selectedCurrencies.includes(currency)
                );

                if (currenciesWithBalance.length > 0) {
                    const newSelected = [...state.selectedCurrencies];
                    currenciesWithBalance.forEach(currency => {
                        if (newSelected.length < MAX_CURRENCIES) {
                            newSelected.push(currency);
                        }
                    });
                    commit('SET_SELECTED_CURRENCIES', newSelected);
                }
            } catch (error) {
                console.error('Failed to fetch balances:', error);
                commit('SET_ERROR', 'Failed to fetch balances');
            } finally {
                commit('SET_LOADING', false);
            }
        },

        async selectCurrency({ commit, dispatch, rootState }, currency) {
            commit('ADD_SELECTED_CURRENCY', currency);
            await dispatch('fetchBalances');
        },

        unselectCurrency({ commit }, currency) {
            commit('REMOVE_SELECTED_CURRENCY', currency);
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
