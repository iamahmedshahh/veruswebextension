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
    hasWallet: false
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
            const walletData = await WalletService.generateWallet();
            
            // Hash the password
            const passwordHash = await WalletService.hashPassword(password);
            
            // Store wallet data securely in browser extension storage
            await browser.storage.local.set({
                wallet: {
                    address: walletData.address,
                    privateKey: walletData.privateKey,
                    mnemonic: walletData.mnemonic,
                    network: walletData.network,
                    passwordHash
                }
            });
            
            commit('setWalletData', {
                address: walletData.address,
                network: walletData.network
            });
            commit('setInitialized', true);
            commit('setHasWallet', true);
            commit('setLoggedIn', true);
            
            // Get initial balance
            await dispatch('getBalance', walletData.address);
            
            return walletData;
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
            const walletData = await WalletService.recoverFromMnemonic(mnemonic);
            
            // Hash the password
            const passwordHash = await WalletService.hashPassword(password);
            
            // Store wallet data securely
            await browser.storage.local.set({
                wallet: {
                    address: walletData.address,
                    privateKey: walletData.privateKey,
                    network: walletData.network,
                    passwordHash
                }
            });
            
            commit('setWalletData', {
                address: walletData.address,
                network: walletData.network
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
    
    async loadWallet({ commit, dispatch, state }) {
        try {
            commit('clearError');
            commit('setLoading', true);
            
            // Check if wallet exists in storage
            const data = await browser.storage.local.get('wallet');
            
            // Reset hasWallet state based on storage
            commit('setHasWallet', !!data.wallet);
            
            // If no wallet exists, return early
            if (!data.wallet) {
                return;
            }
            
            // Don't load wallet data if not logged in
            if (!state.isLoggedIn) {
                return;
            }
            
            // Set wallet data if logged in
            commit('setWalletData', {
                address: data.wallet.address,
                network: data.wallet.network
            });
            commit('setInitialized', true);
            
            // Get initial balance
            await dispatch('getBalance', data.wallet.address);
            
        } catch (error) {
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
            
            // Set wallet data and login state
            commit('setWalletData', {
                address: data.wallet.address,
                network: data.wallet.network
            });
            commit('setInitialized', true);
            commit('setLoggedIn', true);
            
            // Get balance
            await dispatch('getBalance', data.wallet.address);
            
        } catch (error) {
            commit('setError', error.message);
            throw error;
        } finally {
            commit('setLoading', false);
        }
    },
    
    async logout({ commit }) {
        try {
            commit('clearError');
            commit('setLoggedIn', false);
            commit('clearWalletData');
            commit('setInitialized', false);
            // Important: Do NOT clear hasWallet state
        } catch (error) {
            commit('setError', error.message);
            throw error;
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
    }
};

// Mutations
const mutations = {
    setWalletData(state, { address, network }) {
        state.address = address;
        state.network = network;
    },
    
    clearWalletData(state) {
        state.address = null;
        state.network = null;
        state.balance = null;
        state.isInitialized = false;
        state.seedConfirmed = false;
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
    }
};

export default {
    namespaced: true,
    state,
    getters,
    actions,
    mutations
};
