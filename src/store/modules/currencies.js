import { verusRPC } from '../../services/VerusRPCService';
import storage from '../services/StorageService';

const MAX_CURRENCIES = 7;
const MAINNET_DEFAULT_CURRENCIES = ['VRSC', 'BTC', 'ETH'];
const TESTNET_DEFAULT_CURRENCIES = ['VRSCTEST'];

// Helper function to save to both storages
const saveToStorages = async (key, value, network) => {
    const storageKey = `${key}_${network}`;
    // Save to chrome.storage
    await chrome.storage.local.set({ [storageKey]: value });
    // Save to localStorage
    localStorage.setItem(storageKey, JSON.stringify(value));
};

// Helper function to get from storages
const getFromStorages = async (key, network) => {
    try {
        const storageKey = `${key}_${network}`;
        // Try chrome.storage first
        const chromeData = await chrome.storage.local.get([storageKey]);
        if (chromeData[storageKey]) {
            return chromeData[storageKey];
        }
        
        // Fallback to localStorage
        const localData = localStorage.getItem(storageKey);
        return localData ? JSON.parse(localData) : null;
    } catch (error) {
        console.error('Error getting from storages:', error);
        return null;
    }
};

export default {
    namespaced: true,
    
    state: {
        availableCurrencies: [],
        selectedCurrencies: [],
        activeCurrencies: [], 
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
            state.selectedCurrencies = currencies;
        },

        SET_ACTIVE_CURRENCIES(state, currencies) {
            state.activeCurrencies = currencies;
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

            // Persist balances to chrome.storage
            chrome.storage.local.get(['balances'], (result) => {
                const existingBalances = result.balances || {};
                const address = this.state.wallet.address;
                if (address) {
                    // Store balances by currency and address
                    const newBalances = { ...existingBalances };
                    Object.entries(updatedBalances).forEach(([currency, balance]) => {
                        newBalances[currency] = {
                            ...newBalances[currency],
                            [address]: balance.toString()
                        };
                    });
                    chrome.storage.local.set({ balances: newBalances });
                }
            });
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
            console.log('Initializing currencies module...');
            
            try {
                // Load persisted state
                await dispatch('loadPersistedState');
                
                // Fetch available currencies
                await dispatch('fetchAvailableCurrencies');
                
                // Load active currencies
                const network = rootState.network.currentNetwork;
                const activeCurrencies = await getFromStorages('activeCurrencies', network);
                if (activeCurrencies && activeCurrencies.length > 0) {
                    commit('SET_ACTIVE_CURRENCIES', activeCurrencies);
                    commit('SET_SELECTED_CURRENCIES', activeCurrencies);
                } else {
                    // Set defaults if no active currencies
                    const defaultCurrencies = network === 'MAINNET' 
                        ? MAINNET_DEFAULT_CURRENCIES 
                        : TESTNET_DEFAULT_CURRENCIES;
                    commit('SET_ACTIVE_CURRENCIES', defaultCurrencies);
                    commit('SET_SELECTED_CURRENCIES', defaultCurrencies);
                    await saveToStorages('activeCurrencies', defaultCurrencies, network);
                }
            } catch (error) {
                console.error('Failed to initialize currencies module:', error);
                commit('SET_ERROR', 'Failed to initialize currencies');
            }
        },

        async loadPersistedState({ commit, rootState }) {
            try {
                const network = rootState.network.currentNetwork;
                const persistedCurrencies = await getFromStorages('selectedCurrencies', network);
                
                if (persistedCurrencies && persistedCurrencies.length > 0) {
                    commit('SET_SELECTED_CURRENCIES', persistedCurrencies);
                } else {
                    // Use default currencies based on network
                    const defaultCurrencies = network === 'testnet' ? TESTNET_DEFAULT_CURRENCIES : MAINNET_DEFAULT_CURRENCIES;
                    commit('SET_SELECTED_CURRENCIES', defaultCurrencies);
                    await saveToStorages('selectedCurrencies', defaultCurrencies, network);
                }
            } catch (error) {
                console.error('Error loading persisted state:', error);
                commit('SET_ERROR', error.message);
            }
        },

        async persistSelectedCurrencies({ state, rootState }) {
            const network = rootState.network.currentNetwork;
            await saveToStorages('selectedCurrencies', state.selectedCurrencies, network);
        },

        async selectCurrency({ commit, dispatch, state, rootState }, currency) {
            console.log('Selecting currency:', currency);
            const updatedCurrencies = [...state.selectedCurrencies, currency];
            commit('SET_SELECTED_CURRENCIES', updatedCurrencies);
            commit('SET_ACTIVE_CURRENCIES', updatedCurrencies);
            
            // Save to both storages
            const network = rootState.network.currentNetwork;
            await saveToStorages('activeCurrencies', updatedCurrencies, network);
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

            console.log('Unselecting currency:', currency);
            const updatedCurrencies = state.selectedCurrencies.filter(c => c !== currency);
            commit('SET_SELECTED_CURRENCIES', updatedCurrencies);
            commit('SET_ACTIVE_CURRENCIES', updatedCurrencies);
            
            // Save to both storages
            const network = rootState.network.currentNetwork;
            await saveToStorages('activeCurrencies', updatedCurrencies, network);
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
        getActiveCurrencies: state => state.activeCurrencies,
        getBalance: state => currency => state.balances[currency] || 0,
        canAddMoreCurrencies: state => state.selectedCurrencies.length < MAX_CURRENCIES,
        getCurrencyDefinition: state => currency => state.currencyDefinitions[currency]
    }
};
