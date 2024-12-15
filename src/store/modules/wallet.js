import { WalletService } from '../../services/WalletService';
import { verusRPC } from '../../services/VerusRPCService';
import browser from 'webextension-polyfill';
import storage from '../services/StorageService';

// Initial state
const state = {
    address: null,
    network: null,
    isInitialized: false,
    error: null,
    loading: false,
    balance: null,
    seedConfirmed: false,
    isLoggedIn: false,
    hasWallet: false,
    isLoadingBalances: false,
    balances: {},
    selectedCurrencies: ['VRSCTEST'],
    isLocked: false,
    connectedSites: [],
    privateKeyWIF: null, // Add private key in WIF format to state
    mnemonic: null // Store mnemonic phrase in state
};

// Getters
const getters = {
    isWalletInitialized: state => state.isInitialized,
    currentAddress: state => state.address,
    currentNetwork: state => state.network,
    hasError: state => !!state.error,
    errorMessage: state => state.error,
    isLoading: state => state.loading,
    currentBalance: state => state.balance,
    isSeedConfirmed: state => state.seedConfirmed,
    isLoggedIn: state => state.isLoggedIn,
    hasWallet: state => state.hasWallet,
    isLocked: state => state.isLocked
};

// Actions
const actions = {
    async initializeRPC({ commit }) {
        try {
            await verusRPC.initialize();
        } catch (error) {
            commit('setError', 'Failed to initialize Verus RPC: ' + error.message);
            throw error;
        }
    },
    
    async generateNewWallet({ commit, dispatch }, { mnemonic, password }) {
        try {
            commit('clearError');
            commit('setLoading', true);
            
            // Initialize RPC first
            await dispatch('initializeRPC');
            
            // Generate new wallet
            const wallet = await WalletService.generateWallet(mnemonic, password);
            
            // Store wallet data and password hash
            await browser.storage.local.set({
                wallet,
                hasWallet: true,
                isLoggedIn: true,
                passwordHash: wallet.hashedPassword,
                lastLoginTime: Date.now()
            });

            // Update store state
            commit('setWalletData', wallet);
            commit('setHasWallet', true);
            commit('setInitialized', true);
            commit('setSeedConfirmed', true);
            commit('setLoggedIn', true);
            
            await dispatch('currencies/initialize', null, { root: true });
            
            return wallet;
        } catch (error) {
            console.error('Failed to generate wallet:', error);
            commit('setError', error.message);
            throw error;
        } finally {
            commit('setLoading', false);
        }
    },
    
    async recoverFromMnemonic({ commit, dispatch }, { mnemonic, password }) {
        try {
            commit('clearError');
            commit('setLoading', true);
            
            // Initialize RPC first
            await dispatch('initializeRPC');
            
            // Recover wallet from mnemonic
            const walletData = await WalletService.recoverFromMnemonic(mnemonic, password);
            
            // Store wallet data and password hash
            await browser.storage.local.set({
                wallet: walletData,
                hasWallet: true,
                isLoggedIn: true,
                passwordHash: walletData.hashedPassword,
                lastLoginTime: Date.now()
            });

            // Update store state
            commit('setWalletData', walletData);
            commit('setInitialized', true);
            commit('setHasWallet', true);
            commit('setLoggedIn', true);
            commit('setSeedConfirmed', true);
            
            // Get initial balance
            await dispatch('getBalance', walletData.address);
            
            return walletData;
        } catch (error) {
            commit('setError', error.message);
            throw error;
        } finally {
            commit('setLoading', false);
        }
    },
    
    async getBalance({ commit }, address) {
        try {
            const balance = await verusRPC.getBalance(address);
            commit('setBalance', balance);
            return balance;
        } catch (error) {
            console.error('Failed to get balance:', error);
            throw error;
        }
    },
    
    async confirmWalletSetup({ commit }) {
        try {
            commit('clearError');
            commit('setSeedConfirmed', true);
            commit('setInitialized', true);
        } catch (error) {
            console.error('Failed to confirm wallet setup:', error);
            commit('setError', error.message);
            throw error;
        }
    },
    
    async loadWallet({ commit, dispatch }) {
        try {
            commit('clearError');
            commit('setLoading', true);
            
            // Get stored wallet data
            const data = await browser.storage.local.get(['wallet', 'hasWallet', 'isLoggedIn']);
            
            if (!data.wallet || !data.hasWallet) {
                commit('setHasWallet', false);
                return;
            }

            // Always set wallet data if it exists
            commit('setWalletData', data.wallet);
            commit('setHasWallet', true);
            
            // Set login state if logged in
            if (data.isLoggedIn) {
                commit('setLoggedIn', true);
                commit('setInitialized', true);
                commit('setSeedConfirmed', true);
                await dispatch('currencies/initialize', null, { root: true });
            }
            
            return data.wallet;
        } catch (error) {
            console.error('Failed to load wallet:', error);
            commit('setError', error.message);
            throw error;
        } finally {
            commit('setLoading', false);
        }
    },
    
    async clearWallet({ commit }) {
        try {
            await storage.remove('wallet');
            commit('clearWalletData');
            commit('setSeedConfirmed', false);
            commit('setInitialized', false);
            commit('setLoggedIn', false);
            commit('setHasWallet', false); // Clear hasWallet when fully removing wallet
        } catch (error) {
            console.error('Failed to clear wallet:', error);
            commit('setError', error.message);
            throw error;
        }
    },
    
    async login({ commit, dispatch }, password) {
        try {
            commit('clearError');
            commit('setLoading', true);
            
            // Verify password
            await dispatch('verifyPassword', password);
            
            // Set login state
            await browser.storage.local.set({ 
                isLoggedIn: true,
                lastLoginTime: Date.now()
            });
            
            // Update store state
            commit('setLoggedIn', true);
            commit('setInitialized', true);
            commit('setSeedConfirmed', true);
            
            // Load wallet data and initialize currencies
            await dispatch('loadWallet');
            
        } catch (error) {
            console.error('Login error:', error);
            commit('setError', error.message);
            throw error;
        } finally {
            commit('setLoading', false);
        }
    },
    
    async logout({ commit }) {
        try {
            console.log('Logging out...');
            // Clear sensitive wallet data from storage, but keep hasWallet flag
            await browser.storage.local.remove([
                'isLoggedIn',
                'passwordHash',
                'walletState',
                'lastLoginTime'
            ]);
            console.log('Local storage cleared');
            
            // Clear session storage
            await browser.storage.session.clear();
            console.log('Session storage cleared');
            
            // Clear store state but keep hasWallet true
            commit('clearLoginData');
            commit('setLoggedIn', false);
            commit('setLocked', true);
            console.log('Store state cleared');
            
            // Force reload to reset app state
            console.log('Reloading page...');
            window.location.reload();
        } catch (error) {
            console.error('Failed to logout:', error);
            commit('setError', error.message);
            throw error;
        }
    },
    
    async lock({ commit, dispatch }) {
        try {
            console.log('Locking wallet...');
            // Update wallet state in storage
            await browser.storage.local.set({ 
                walletState: {
                    isLocked: true
                }
            });
            console.log('Wallet state updated');
            
            // Clear session state
            await browser.storage.session.clear();
            console.log('Session cleared');
            
            // Update store state
            commit('setLoggedIn', false);
            commit('setLocked', true);
            commit('clearLoginData');
            console.log('Store state updated');
            
            // Reload page to reset app state
            window.location.reload();
        } catch (error) {
            console.error('Failed to lock wallet:', error);
            commit('setError', error.message);
            throw error;
        }
    },
    
    async unlock({ commit, dispatch, rootGetters }, password) {
        try {
            // Get the stored wallet data
            const { wallet } = await browser.storage.local.get('wallet');
            if (!wallet) {
                throw new Error('No wallet found');
            }
            
            // Verify password
            const isValid = await dispatch('verifyPassword', password, { root: true });
            if (!isValid) {
                throw new Error('Invalid password');
            }
            
            // Update wallet state
            await browser.storage.local.set({ 
                walletState: {
                    isLocked: false,
                    address: wallet.address
                }
            });
            
            // Update session state
            await browser.storage.session.set({ isLoggedIn: true });
            
            // Update store state
            commit('setLoggedIn', true);
            commit('setLocked', false);
            
            return true;
        } catch (error) {
            console.error('Failed to unlock wallet:', error);
            commit('setError', error.message);
            throw error;
        }
    },
    
    async verifyPassword({ commit, dispatch, rootGetters }, password) {
        try {
            commit('clearError');
            
            // Get stored wallet data
            const data = await browser.storage.local.get('wallet');
            if (!data.wallet) {
                throw new Error('No wallet found');
            }
            
            // Verify password
            const isValid = await WalletService.verifyPassword(password, data.wallet.hashedPassword);
            if (!isValid) {
                throw new Error('Invalid password');
            }
            
            return true;
        } catch (error) {
            commit('setError', error.message);
            return false;
        }
    },
    
    async updateBalances({ commit, state }) {
        if (!state.isLoggedIn || !state.address) {
            console.log('Not updating balances - not logged in or no address');
            return;
        }
        
        try {
            commit('SET_LOADING_BALANCES', true);
            
            // Get all currency balances
            const allBalances = await verusRPC.getAllCurrencyBalances(state.address);
            console.log('All balances:', allBalances);
            
            // Set balances in store
            commit('SET_BALANCES', allBalances);
            
            // Set the main VRSC/VRSCTEST balance for backward compatibility
            const mainBalance = allBalances['VRSCTEST'] || allBalances['VRSC'] || 0;
            commit('setBalance', mainBalance);
            
        } catch (error) {
            console.error('Error updating balances:', error);
            commit('setError', 'Failed to update balances: ' + error.message);
        } finally {
            commit('SET_LOADING_BALANCES', false);
        }
    },
    
    addCurrency({ commit }, currency) {
        commit('ADD_CURRENCY', currency);
    },
    
    removeCurrency({ commit }, currency) {
        commit('REMOVE_CURRENCY', currency);
    },
    
    async getConnectedSites({ commit }) {
        try {
            const sites = await browser.storage.local.get('connectedSites')
            commit('SET_CONNECTED_SITES', sites.connectedSites || [])
            return sites.connectedSites || []
        } catch (error) {
            console.error('Failed to get connected sites:', error)
            return []
        }
    },

    async disconnectSite({ commit, dispatch }, origin) {
        try {
            const sites = await browser.storage.local.get('connectedSites')
            const updatedSites = (sites.connectedSites || []).filter(site => site.origin !== origin)
            await browser.storage.local.set({ connectedSites: updatedSites })
            commit('SET_CONNECTED_SITES', updatedSites)
            
            // Notify content script to remove connection
            const tabs = await browser.tabs.query({ url: origin + '/*' })
            tabs.forEach(tab => {
                browser.tabs.sendMessage(tab.id, {
                    type: 'DISCONNECT_SITE',
                    origin
                })
            })
        } catch (error) {
            console.error('Failed to disconnect site:', error)
            throw error
        }
    },

    async addConnectedSite({ commit, state }, { origin, favicon }) {
        try {
            const sites = await browser.storage.local.get('connectedSites')
            const existingSites = sites.connectedSites || []
            
            // Don't add if already exists
            if (!existingSites.some(site => site.origin === origin)) {
                const updatedSites = [...existingSites, { origin, favicon, connectedAt: Date.now() }]
                await browser.storage.local.set({ connectedSites: updatedSites })
                commit('SET_CONNECTED_SITES', updatedSites)
            }
        } catch (error) {
            console.error('Failed to add connected site:', error)
            throw error
        }
    },
    
    async getPrivateKey({ state, commit }) {
        try {
            commit('clearError');
            
            // Check if we have the private key in WIF format in state
            if (state.privateKeyWIF) {
                return state.privateKeyWIF;
            }
            
            // If not in state, try to get it from storage
            const data = await browser.storage.local.get('wallet');
            if (!data.wallet || !data.wallet.privateKeyWIF) {
                throw new Error('Private key not found in wallet');
            }
            
            // Store in state for future use
            commit('setWalletData', {
                address: state.address,
                network: state.network,
                privateKeyWIF: data.wallet.privateKeyWIF,
                mnemonic: data.wallet.mnemonic
            });
            
            return data.wallet.privateKeyWIF;
        } catch (error) {
            console.error('Failed to get private key:', error);
            commit('setError', error.message);
            throw error;
        }
    },
};

// Mutations
const mutations = {
    setWalletData(state, { address, network, privateKeyWIF, mnemonic }) {
        state.address = address;
        state.network = network;
        state.privateKeyWIF = privateKeyWIF;
        state.mnemonic = mnemonic;
    },

    clearWalletData(state) {
        console.log('Clearing wallet data from store...');
        state.address = null;
        state.network = null;
        state.privateKeyWIF = null;
        state.mnemonic = null;
        state.hasWallet = false;
        state.isInitialized = false;
        state.isLoggedIn = false;
        state.seedConfirmed = false;
        state.isLocked = true;
        state.balance = null;
        state.balances = {};
        state.error = null;
        state.loading = false;
        state.isLoadingBalances = false;
        state.connectedSites = [];
        console.log('Store state after clear:', state);
    },

    clearLoginData(state) {
        console.log('Clearing login data...');
        state.address = null;
        state.network = null;
        state.privateKeyWIF = null;
        state.mnemonic = null;
        state.isInitialized = false;
        state.isLoggedIn = false;
        state.seedConfirmed = false;
        state.balance = null;
        state.balances = {};
        state.error = null;
        state.loading = false;
        state.isLoadingBalances = false;
        state.connectedSites = [];
        // Keep hasWallet true
        console.log('Login data cleared');
    },

    setError(state, error) {
        state.error = error;
    },

    clearError(state) {
        state.error = null;
    },

    setLoading(state, loading) {
        state.loading = loading;
    },

    setBalance(state, balance) {
        state.balance = balance;
    },

    setSeedConfirmed(state, confirmed) {
        state.seedConfirmed = confirmed;
    },

    setInitialized(state, initialized) {
        state.isInitialized = initialized;
    },

    setLoggedIn(state, isLoggedIn) {
        state.isLoggedIn = isLoggedIn;
    },

    setHasWallet(state, hasWallet) {
        state.hasWallet = hasWallet;
    },

    SET_LOADING_BALANCES(state, loading) {
        state.isLoadingBalances = loading;
    },

    SET_BALANCES(state, balances) {
        state.balances = balances;
    },

    ADD_CURRENCY(state, currency) {
        if (!state.selectedCurrencies.includes(currency)) {
            state.selectedCurrencies.push(currency);
        }
    },

    REMOVE_CURRENCY(state, currency) {
        const index = state.selectedCurrencies.indexOf(currency);
        if (index !== -1) {
            state.selectedCurrencies.splice(index, 1);
        }
    },

    SET_SELECTED_CURRENCIES(state, currencies) {
        state.selectedCurrencies = currencies;
    },

    SET_CONNECTED_SITES(state, sites) {
        state.connectedSites = sites
    },

    REMOVE_CONNECTED_SITE(state, origin) {
        state.connectedSites = state.connectedSites.filter(site => site.origin !== origin)
    },
    
    setLocked(state, isLocked) {
        console.log('Setting locked state to:', isLocked);
        state.isLocked = isLocked;
    },
};

export default {
    namespaced: true,
    state,
    getters,
    actions,
    mutations
};
