import { verusRPC } from '../../services/VerusRPCService';
import storage from '../services/StorageService';

const MAX_CURRENCIES = 7;
const MAINNET_DEFAULT_CURRENCIES = ['VRSC', 'BTC', 'ETH'];
const TESTNET_DEFAULT_CURRENCIES = ['VRSCTEST'];

export default {
    namespaced: true,
    
    state: {
        availableCurrencies: [],
        selectedCurrencies: [],
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
            // Get default currencies based on network
            const defaultCurrencies = this.state.network.currentNetwork === 'MAINNET' 
                ? MAINNET_DEFAULT_CURRENCIES 
                : TESTNET_DEFAULT_CURRENCIES;
            
            // Ensure default currencies are always included and at the start of the array
            const uniqueCurrencies = [...new Set([...defaultCurrencies, ...currencies])];
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
        async initialize({ dispatch, commit, rootState }) {
            // Wait for network to be initialized
            if (!rootState.network.initialized) {
                await dispatch('network/initialize', null, { root: true });
            }
            
            await dispatch('loadPersistedState');
            await dispatch('fetchAvailableCurrencies');
            await dispatch('fetchBalances');
        },

        async loadPersistedState({ commit, rootState }) {
            try {
                const { selectedCurrencies } = await storage.get(['selectedCurrencies']);
                const defaultCurrencies = rootState.network.currentNetwork === 'MAINNET' 
                    ? MAINNET_DEFAULT_CURRENCIES 
                    : TESTNET_DEFAULT_CURRENCIES;
                
                if (selectedCurrencies && selectedCurrencies.length > 0) {
                    commit('SET_SELECTED_CURRENCIES', selectedCurrencies);
                    return { selectedCurrencies };
                }
                
                // Set defaults if no persisted state
                commit('SET_SELECTED_CURRENCIES', defaultCurrencies);
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
            const updatedCurrencies = [...state.selectedCurrencies, currency];
            commit('SET_SELECTED_CURRENCIES', updatedCurrencies);
            await dispatch('persistSelectedCurrencies');
            await dispatch('fetchBalances');
        },

        async unselectCurrency({ commit, dispatch, state, rootState }, currency) {
            // Don't allow removing default currencies
            const defaultCurrencies = rootState.network.currentNetwork === 'MAINNET' 
                ? MAINNET_DEFAULT_CURRENCIES 
                : TESTNET_DEFAULT_CURRENCIES;
            
            if (defaultCurrencies.includes(currency)) {
                console.warn('Cannot remove default currency:', currency);
                return;
            }

            const updatedCurrencies = state.selectedCurrencies.filter(c => c !== currency);
            commit('SET_SELECTED_CURRENCIES', updatedCurrencies);
            await dispatch('persistSelectedCurrencies');
        },

        async fetchAvailableCurrencies({ commit, rootState }) {
            commit('SET_LOADING', true);
            try {
                const currencies = await verusRPC.listCurrencies();
                commit('SET_AVAILABLE_CURRENCIES', currencies);
            } catch (error) {
                console.error('Failed to fetch available currencies:', error);
                commit('SET_ERROR', 'Failed to fetch available currencies');
            } finally {
                commit('SET_LOADING', false);
            }
        },

        async fetchBalances({ commit, state, rootState }) {
            if (!rootState.wallet.addresses) return;
            
            commit('SET_LOADING', true);
            try {
                const balances = {};
                
                // Get VRSC/VRSCTEST balance
                const vrscAddress = rootState.wallet.addresses.VRSC?.address;
                if (vrscAddress) {
                    const vrscBalances = await verusRPC.getAllCurrencyBalances(vrscAddress);
                    Object.assign(balances, vrscBalances);
                }
                
                // Get BTC balance if available
                const btcAddress = rootState.wallet.addresses.BTC?.address;
                if (btcAddress) {
                    try {
                        // TODO: Implement BTC balance fetching
                        balances.BTC = 0;
                    } catch (error) {
                        console.error('Failed to fetch BTC balance:', error);
                    }
                }
                
                // Get ETH balance if available
                const ethAddress = rootState.wallet.addresses.ETH?.address;
                if (ethAddress) {
                    try {
                        // TODO: Implement ETH balance fetching
                        balances.ETH = 0;
                    } catch (error) {
                        console.error('Failed to fetch ETH balance:', error);
                    }
                }
                
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
        getBalance: state => currency => state.balances[currency] || 0,
        canAddMoreCurrencies: state => state.selectedCurrencies.length < MAX_CURRENCIES,
        getCurrencyDefinition: state => currency => state.currencyDefinitions[currency]
    }
};
