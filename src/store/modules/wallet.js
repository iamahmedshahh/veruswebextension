import { WalletService } from '../../services/WalletService';
import { verusRPC } from '../../services/VerusRPCService';
import browser from 'webextension-polyfill';

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
    isLocked: true,
    connectedSites: [],
    privateKeyWIF: null // Add private key in WIF format to state
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
    hasWallet: state => state.hasWallet
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
            
            // Save wallet data to storage
            await browser.storage.local.set({
                wallet: {
                    address: wallet.address,
                    network: wallet.network,
                    encryptedSeed: wallet.encryptedSeed,
                    passwordHash: wallet.passwordHash,
                    privateKeyWIF: wallet.privateKeyWIF // Use the explicit WIF format
                },
                hasWallet: true,
                isInitialized: true
            });
            
            // Update store state
            commit('setWalletData', {
                address: wallet.address,
                network: wallet.network,
                privateKeyWIF: wallet.privateKeyWIF // Use the explicit WIF format
            });
            commit('setHasWallet', true);
            commit('setInitialized', true);
            
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
            
            // Store wallet data securely
            await browser.storage.local.set({
                wallet: {
                    address: walletData.address,
                    network: walletData.network,
                    passwordHash: walletData.passwordHash,
                    privateKeyWIF: walletData.privateKeyWIF // Store the WIF format
                },
                hasWallet: true,
                isInitialized: true
            });
            
            // Update store state
            commit('setWalletData', {
                address: walletData.address,
                network: walletData.network,
                privateKeyWIF: walletData.privateKeyWIF // Include WIF format in state
            });
            commit('setInitialized', true);
            commit('setHasWallet', true);
            commit('setLoggedIn', true);
            
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
            
            // Get stored wallet data from local storage
            const walletData = await browser.storage.local.get(['wallet', 'hasWallet']);
            // Get login state from session storage
            const sessionData = await browser.storage.session.get(['isLoggedIn']);
            
            if (!walletData.wallet) {
                commit('setHasWallet', false);
                return;
            }
            
            // Set wallet data
            commit('setWalletData', {
                address: walletData.wallet.address,
                network: walletData.wallet.network,
                privateKeyWIF: walletData.wallet.privateKeyWIF // Include private key in WIF format
            });
            
            commit('setHasWallet', true);
            commit('setInitialized', true);
            
            // Restore login state from session
            if (sessionData.isLoggedIn) {
                commit('setLoggedIn', true);
                // Update balances if logged in
                await dispatch('updateBalances');
            } else {
                commit('setLoggedIn', false);
            }
            
            return walletData.wallet;
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
            await browser.storage.local.remove('wallet');
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
            
            // Set login state in session storage instead of local storage
            await browser.storage.session.set({ 
                isLoggedIn: true,
                lastLoginTime: Date.now()
            });
            
            // Update store state
            commit('setLoggedIn', true);
            
            // Load wallet data after successful login
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
            commit('clearError');
            commit('setLoading', true);
            
            // Clear only login state from storage, preserve wallet data
            await browser.storage.session.set({ 
                isLoggedIn: false,
                lastLoginTime: null
            });
            
            // Clear store login state
            commit('setLoggedIn', false);
            commit('clearLoginData');
            
        } catch (error) {
            console.error('Logout error:', error);
            commit('setError', error.message);
            throw error;
        } finally {
            commit('setLoading', false);
        }
    },
    
    async verifyPassword({ commit }, password) {
        try {
            commit('clearError');
            
            // Get stored wallet data
            const data = await browser.storage.local.get('wallet');
            if (!data.wallet) {
                throw new Error('No wallet found');
            }
            
            // Verify password
            const isValid = await WalletService.verifyPassword(password, data.wallet.passwordHash);
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
                privateKeyWIF: data.wallet.privateKeyWIF
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
    setWalletData(state, { address, network, privateKeyWIF }) {
        state.address = address;
        state.network = network;
        state.privateKeyWIF = privateKeyWIF; // Store private key in state
    },
    
    clearWalletData(state) {
        state.address = null;
        state.network = null;
        state.balance = null;
        state.isInitialized = false;
        state.seedConfirmed = false;
        state.hasWallet = false;
        state.privateKeyWIF = null; // Clear private key
    },

    clearLoginData(state) {
        state.address = null;
        state.network = null;
        state.balance = null;
        state.privateKeyWIF = null; // Clear private key
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
};

export default {
    namespaced: true,
    state,
    getters,
    actions,
    mutations
};
