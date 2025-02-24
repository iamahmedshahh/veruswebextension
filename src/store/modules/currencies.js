import { verusRPC } from '../../services/VerusRPCService';
import storage from '../services/StorageService';

const MAX_CURRENCIES = 7;
const MAINNET_DEFAULT_CURRENCIES = ['VRSC', 'BTC', 'ETH'];
const TESTNET_DEFAULT_CURRENCIES = ['VRSCTEST'];

// Helper function to save to both storages
const saveToStorages = async (key, value) => {
    // Save to chrome.storage
    await chrome.storage.local.set({ [key]: value });
    // Save to localStorage
    localStorage.setItem(key, JSON.stringify(value));
};

// Helper function to get from storages
const getFromStorages = async (key) => {
    try {
        // Try chrome.storage first
        const chromeData = await chrome.storage.local.get([key]);
        if (chromeData[key]) {
            return chromeData[key];
        }
        
        // Fallback to localStorage
        const localData = localStorage.getItem(key);
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
                const activeCurrencies = await getFromStorages('activeCurrencies');
                if (activeCurrencies && activeCurrencies.length > 0) {
                    commit('SET_ACTIVE_CURRENCIES', activeCurrencies);
                    commit('SET_SELECTED_CURRENCIES', activeCurrencies);
                } else {
                    // Set defaults if no active currencies
                    const defaultCurrencies = rootState.network.currentNetwork === 'MAINNET' 
                        ? MAINNET_DEFAULT_CURRENCIES 
                        : TESTNET_DEFAULT_CURRENCIES;
                    commit('SET_ACTIVE_CURRENCIES', defaultCurrencies);
                    commit('SET_SELECTED_CURRENCIES', defaultCurrencies);
                    await saveToStorages('activeCurrencies', defaultCurrencies);
                }
            } catch (error) {
                console.error('Failed to initialize currencies module:', error);
                commit('SET_ERROR', 'Failed to initialize currencies');
            }
        },

        async loadPersistedState({ commit, rootState }) {
            try {
                console.log('Loading persisted currencies state...');
                const activeCurrencies = await getFromStorages('activeCurrencies');
                const balances = await getFromStorages('balances');
                
                if (activeCurrencies && activeCurrencies.length > 0) {
                    console.log('Found persisted active currencies:', activeCurrencies);
                    commit('SET_ACTIVE_CURRENCIES', activeCurrencies);
                    commit('SET_SELECTED_CURRENCIES', activeCurrencies);
                }

                // Load persisted balances if available
                if (balances && rootState.wallet.address) {
                    const loadedBalances = {};
                    Object.entries(balances).forEach(([currency, addressBalances]) => {
                        loadedBalances[currency] = addressBalances[rootState.wallet.address] || '0';
                    });
                    commit('SET_BALANCES', loadedBalances);
                }
            } catch (error) {
                console.error('Failed to load persisted state:', error);
                commit('SET_ERROR', 'Failed to load saved currencies');
            }
        },

        async persistSelectedCurrencies({ state }) {
            try {
                console.log('Persisting selected currencies:', state.selectedCurrencies);
                await saveToStorages('selectedCurrencies', state.selectedCurrencies);
            } catch (error) {
                console.error('Failed to persist selected currencies:', error);
            }
        },

        async selectCurrency({ commit, dispatch, state }, currency) {
            console.log('Selecting currency:', currency);
            const updatedCurrencies = [...state.selectedCurrencies, currency];
            commit('SET_SELECTED_CURRENCIES', updatedCurrencies);
            commit('SET_ACTIVE_CURRENCIES', updatedCurrencies);
            
            // Save to both storages
            await saveToStorages('activeCurrencies', updatedCurrencies);
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
            await saveToStorages('activeCurrencies', updatedCurrencies);
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
