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
    seedConfirmed: false
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
    isSeedConfirmed: state => state.seedConfirmed
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
    
    async generateNewWallet({ commit, dispatch }) {
        try {
            commit('clearError');
            commit('setLoading', true);
            
            // Initialize RPC first
            await dispatch('initializeRPC');
            
            // Generate new wallet
            const walletData = await WalletService.generateWallet();
            
            // Store wallet data securely in browser extension storage
            await browser.storage.local.set({
                wallet: {
                    address: walletData.address,
                    privateKey: walletData.privateKey,
                    mnemonic: walletData.mnemonic,
                    network: walletData.network
                }
            });
            
            commit('setWalletData', {
                address: walletData.address,
                network: walletData.network
            });
            
            // Get initial balance
            await dispatch('getBalance', walletData.address);
            
            // Return wallet data but don't set initialized yet (wait for seed confirmation)
            return walletData;
        } catch (error) {
            console.error('Failed to generate wallet:', error);
            commit('setError', error.message);
            throw error;
        } finally {
            commit('setLoading', false);
        }
    },
    
    async recoverFromMnemonic({ commit, dispatch }, mnemonic) {
        try {
            commit('clearError');
            commit('setLoading', true);
            
            // Initialize RPC first
            await dispatch('initializeRPC');
            
            // Recover wallet from mnemonic
            const walletData = await WalletService.recoverFromMnemonic(mnemonic);
            
            // Store wallet data securely
            await browser.storage.local.set({
                wallet: {
                    address: walletData.address,
                    privateKey: walletData.privateKey,
                    network: walletData.network
                }
            });
            
            commit('setWalletData', {
                address: walletData.address,
                network: walletData.network
            });
            
            // Set initialized since this is a recovery
            commit('setInitialized', true);
            commit('setSeedConfirmed', true);
            
            // Get initial balance
            await dispatch('getBalance', walletData.address);
            
            return walletData;
        } catch (error) {
            console.error('Failed to recover wallet:', error);
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
            
            // Try to load wallet data from storage
            const data = await browser.storage.local.get('wallet');
            
            if (data.wallet) {
                commit('setWalletData', {
                    address: data.wallet.address,
                    network: data.wallet.network
                });
                
                // If we have wallet data, consider it initialized and confirmed
                commit('setInitialized', true);
                commit('setSeedConfirmed', true);
                
                // Get initial balance
                await dispatch('getBalance', data.wallet.address);
                
                return data.wallet;
            }
            
            // If no wallet data found, make sure isInitialized is false
            commit('clearWalletData');
            return null;
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
        } catch (error) {
            console.error('Failed to clear wallet:', error);
            commit('setError', error.message);
            throw error;
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
    }
};

export default {
    namespaced: true,
    state,
    getters,
    actions,
    mutations
};
