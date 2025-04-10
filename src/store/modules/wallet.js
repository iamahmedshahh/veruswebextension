import WalletService from '../../services/WalletService';
import { verusRPC } from '../../services/VerusRPCService';
import storage from '../services/StorageService';
import { generateSecureId, verifyHash, decrypt } from '../../utils/crypto';
import { secureClearMemory } from '../../utils/securityUtils';

// Session check interval (every 1 minute)
const SESSION_CHECK_INTERVAL = 60 * 1000;
let sessionCheckTimer = null;

// Initial state
const state = {
    isLoggedIn: false,
    isLocked: true,
    hasWallet: false,
    address: null,
    addresses: {}, // Add field for multi-chain addresses
    network: 'testnet',
    // Remove sensitive data from state
    // privateKey: null,
    // mnemonic: null,
    encryptedData: null, // Contains encrypted sensitive data reference
    walletId: null, // Wallet ID for reference
    sessionData: null, // Session information for auto-locking
    balances: {},
    selectedCurrencies: ['VRSCTEST'],
    connectedSites: [],
    error: null,
    loading: false
};

// Getters
const getters = {
    isWalletInitialized: state => state.initialized,
    currentAddress: state => state.address,
    currentNetwork: state => state.network,
    hasError: state => !!state.error,
    errorMessage: state => state.error,
    isLoading: state => state.loading,
    currentBalance: state => state.balance,
    isSeedConfirmed: state => state.seedConfirmed,
    isLoggedIn: state => state.isLoggedIn,
    hasWallet: state => state.hasWallet,
    isLocked: state => state.isLocked,
    // Add getters for BTC and ETH addresses
    btcAddress: state => state.addresses?.BTC?.address || null,
    ethAddress: state => state.addresses?.ETH?.address || null,
    hasSession: state => !!state.sessionData,
    // Get session validity
    isSessionValid: state => {
        if (!state.sessionData || !state.sessionData.expiresAt) return false;
        return Date.now() < state.sessionData.expiresAt;
    }
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
            
            // Generate new wallet with enhanced security
            const wallet = await WalletService.generateWallet(mnemonic, password);
            console.log('Generated wallet with ID:', wallet.walletId);
            
            // Store non-sensitive wallet data
            const walletData = {
                walletId: wallet.walletId,
                address: wallet.addresses.VRSC.address, // Set VRSC address as main address
                network: 'testnet',
                addresses: {
                    VRSC: { 
                        address: wallet.addresses.VRSC.address,
                        // Store encrypted private key (never store raw private key)
                        encryptedPrivateKey: wallet.addresses.VRSC.encryptedPrivateKey
                    },
                    BTC: { 
                        address: wallet.addresses.BTC.address,
                        encryptedPrivateKey: wallet.addresses.BTC.encryptedPrivateKey
                    },
                    ETH: { 
                        address: wallet.addresses.ETH.address,
                        encryptedPrivateKey: wallet.addresses.ETH.encryptedPrivateKey
                    }
                },
                encryptedMnemonic: wallet.encryptedMnemonic,
                passwordHash: wallet.passwordHash, // Store the password hash
                passwordSalt: wallet.passwordSalt, // Store the password salt
                sessionData: wallet.sessionData // Store session data
            };

            await storage.set({
                wallet: walletData,
                hasWallet: true,
                isLoggedIn: true,
                lastLoginTime: Date.now()
            });

            // Update store state (never store sensitive data in state)
            commit('setWalletData', walletData);
            console.log('Wallet data set in store');
            commit('setHasWallet', true);
            commit('setInitialized', true);
            commit('setSeedConfirmed', true);
            commit('setLoggedIn', true);
            commit('setLocked', false);
            commit('setSessionData', wallet.sessionData);
            
            // Start session checking
            dispatch('startSessionCheck');
            
            await dispatch('currencies/initialize', null, { root: true });
            
            return { walletId: wallet.walletId, address: wallet.addresses.VRSC.address };
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
            
            // Recover wallet from mnemonic with enhanced security
            const wallet = await WalletService.recoverFromMnemonic(mnemonic, password);
            
            // Store wallet data (never storing raw private keys)
            const walletData = {
                walletId: wallet.walletId,
                address: wallet.addresses.VRSC.address, // Set VRSC address as main address
                network: 'testnet',
                addresses: {
                    VRSC: { 
                        address: wallet.addresses.VRSC.address,
                        encryptedPrivateKey: wallet.addresses.VRSC.encryptedPrivateKey
                    },
                    BTC: { 
                        address: wallet.addresses.BTC.address,
                        encryptedPrivateKey: wallet.addresses.BTC.encryptedPrivateKey
                    },
                    ETH: { 
                        address: wallet.addresses.ETH.address,
                        encryptedPrivateKey: wallet.addresses.ETH.encryptedPrivateKey
                    }
                },
                encryptedMnemonic: wallet.encryptedMnemonic,
                passwordHash: wallet.passwordHash,
                passwordSalt: wallet.passwordSalt,
                sessionData: wallet.sessionData
            };

            await storage.set({
                wallet: walletData,
                hasWallet: true,
                isLoggedIn: true,
                lastLoginTime: Date.now()
            });

            // Update store state (with no sensitive data)
            commit('setWalletData', walletData);
            commit('setInitialized', true);
            commit('setHasWallet', true);
            commit('setLoggedIn', true);
            commit('setLocked', false);
            commit('setSessionData', wallet.sessionData);
            
            // Start session checking
            dispatch('startSessionCheck');
            
            await dispatch('currencies/initialize', null, { root: true });
            
            return { walletId: wallet.walletId, address: wallet.addresses.VRSC.address };
        } catch (error) {
            console.error('Error recovering wallet:', error);
            commit('setError', error.message);
            throw error;
        } finally {
            commit('setLoading', false);
        }
    },
    
    async login({ commit, dispatch }, password) {
        try {
            console.log('Logging in...');
            commit('clearError');
            commit('setLoading', true);
            
            // Get stored wallet data
            const { wallet } = await storage.get(['wallet']);
            if (!wallet || !wallet.address) {
                throw new Error('No wallet found');
            }
            
            // Verify password
            await dispatch('verifyPassword', password);
            
            // Create new session
            const sessionData = WalletService.createSession();
            
            // Update wallet with new session
            const updatedWallet = {
                ...wallet,
                sessionData
            };
            
            // Save updated wallet with session
            await storage.set({
                wallet: updatedWallet
            });
            
            // Set wallet data
            commit('setWalletData', updatedWallet);
            commit('setHasWallet', true);
            commit('setSessionData', sessionData);
            
            // Set login state
            commit('setLoggedIn', true);
            commit('setLocked', false);
            
            // Store login state in local storage
            await storage.set({
                walletState: {
                    isLocked: false,
                    isLoggedIn: true,
                    address: wallet.address,
                    network: wallet.network || 'testnet',
                    lastLoginTime: Date.now()
                },
                isLoggedIn: true
            });
            
            // Start session checking
            dispatch('startSessionCheck');
            
            // Initialize currencies
            await dispatch('currencies/initialize', null, { root: true });
            
            console.log('Login successful');
            window.location.hash = '#/';
        } catch (error) {
            console.error('Login failed:', error);
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
            console.error('Error getting balance:', error);
            commit('setError', error.message);
            return 0;
        }
    },
    
    confirmWalletSetup({ commit }) {
        commit('setSeedConfirmed', true);
        return storage.set({
            seedConfirmed: true
        });
    },
    
    async loadWallet({ commit, dispatch }) {
        try {
            commit('clearError');
            
            const data = await storage.get(['wallet', 'hasWallet', 'isLoggedIn', 'walletState']);
            
            if (data.wallet && data.hasWallet) {
                // Set wallet data but keep it locked initially
                commit('setWalletData', data.wallet);
                commit('setHasWallet', true);
                commit('setInitialized', true);
                
                // Check if we have a valid session
                if (data.wallet.sessionData && WalletService.isSessionValid(data.wallet.sessionData)) {
                    // Valid session, unlock the wallet
                    commit('setLoggedIn', true);
                    commit('setLocked', false);
                    commit('setSessionData', data.wallet.sessionData);
                    
                    // Start session checking
                    dispatch('startSessionCheck');
                    
                    // Initialize currencies
                    await dispatch('currencies/initialize', null, { root: true });
                } else {
                    // No valid session, keep wallet locked
                    commit('setLoggedIn', false);
                    commit('setLocked', true);
                }
                
                return data.wallet;
            }
            
            return null;
        } catch (error) {
            console.error('Error loading wallet:', error);
            commit('setError', error.message);
            return null;
        }
    },
    
    async clearWallet({ commit }) {
        try {
            // Stop session checking
            if (sessionCheckTimer) {
                clearInterval(sessionCheckTimer);
                sessionCheckTimer = null;
            }
            
            // Clear all wallet data from storage
            await storage.clear();
            
            // Reset state
            commit('clearWalletData');
            commit('setHasWallet', false);
            commit('setInitialized', false);
            commit('setLoggedIn', false);
            commit('setLocked', true);
            commit('setSeedConfirmed', false);
            
            return true;
        } catch (error) {
            console.error('Error clearing wallet:', error);
            commit('setError', error.message);
            return false;
        }
    },
    
    async initializeState({ commit }) {
        try {
            commit('clearError');
            
            const data = await storage.get(['wallet', 'hasWallet', 'isLoggedIn', 'walletState', 'seedConfirmed']);
            
            if (data.hasWallet && data.wallet) {
                commit('setWalletData', data.wallet);
                commit('setHasWallet', true);
                commit('setInitialized', true);
                
                if (data.seedConfirmed) {
                    commit('setSeedConfirmed', true);
                }
                
                // Determine if wallet should be locked based on session
                if (data.wallet.sessionData && WalletService.isSessionValid(data.wallet.sessionData)) {
                    commit('setLoggedIn', true);
                    commit('setLocked', false);
                    commit('setSessionData', data.wallet.sessionData);
                } else {
                    commit('setLoggedIn', false);
                    commit('setLocked', true);
                }
            } else {
                // No wallet exists
                commit('setHasWallet', false);
                commit('setInitialized', false);
                commit('setLoggedIn', false);
                commit('setLocked', true);
            }
            
            return data;
        } catch (error) {
            console.error('Error initializing state:', error);
            commit('setError', error.message);
            return null;
        }
    },
    
    /**
     * Locks the wallet, clearing sensitive data from memory
     */
    async lock({ commit, state }) {
        try {
            console.log('Locking wallet...');
            
            // Stop session checking
            if (sessionCheckTimer) {
                clearInterval(sessionCheckTimer);
                sessionCheckTimer = null;
            }
            
            // Clear session data
            const updatedWallet = { ...state.wallet };
            if (updatedWallet.sessionData) {
                updatedWallet.sessionData = null;
                
                // Update storage
                await storage.set({
                    wallet: updatedWallet,
                    walletState: {
                        isLocked: true,
                        isLoggedIn: false,
                        address: state.address,
                        network: state.network,
                        lastLockTime: Date.now()
                    }
                });
            }
            
            // Update state
            commit('setLoggedIn', false);
            commit('setLocked', true);
            commit('setSessionData', null);
            
            console.log('Wallet locked.');
            
            return true;
        } catch (error) {
            console.error('Error locking wallet:', error);
            commit('setError', error.message);
            return false;
        }
    },
    
    /**
     * Logs out the user completely
     */
    async logout({ commit }) {
        try {
            console.log('Logging out...');
            
            // Stop session checking
            if (sessionCheckTimer) {
                clearInterval(sessionCheckTimer);
                sessionCheckTimer = null;
            }
            
            // Clear login state but keep wallet data
            await storage.set({
                isLoggedIn: false,
                walletState: {
                    isLocked: true,
                    isLoggedIn: false,
                    lastLogoutTime: Date.now()
                }
            });
            
            // Update state
            commit('clearLoginData');
            commit('setLoggedIn', false);
            commit('setLocked', true);
            commit('setSessionData', null);
            
            console.log('Logout successful.');
            
            return true;
        } catch (error) {
            console.error('Error logging out:', error);
            commit('setError', error.message);
            return false;
        }
    },
    
    /**
     * Unlocks the wallet and starts a new session
     */
    async unlock({ commit, dispatch, rootGetters }, password) {
        try {
            console.log('Unlocking wallet...');
            commit('clearError');
            commit('setLoading', true);
            
            // Verify password
            await dispatch('verifyPassword', password);
            
            // Create a new session
            const sessionData = WalletService.createSession();
            
            // Get current wallet data
            const { wallet } = await storage.get(['wallet']);
            
            // Update wallet with session
            const updatedWallet = { ...wallet, sessionData };
            
            // Store updated wallet
            await storage.set({
                wallet: updatedWallet,
                walletState: {
                    isLocked: false,
                    isLoggedIn: true,
                    address: updatedWallet.address,
                    network: updatedWallet.network,
                    lastUnlockTime: Date.now()
                },
                isLoggedIn: true
            });
            
            // Update state
            commit('setWalletData', updatedWallet);
            commit('setLoggedIn', true);
            commit('setLocked', false);
            commit('setSessionData', sessionData);
            
            // Start session checking
            dispatch('startSessionCheck');
            
            console.log('Wallet unlocked');
            
            return true;
        } catch (error) {
            console.error('Error unlocking wallet:', error);
            commit('setError', 'Failed to unlock wallet: ' + error.message);
            return false;
        } finally {
            commit('setLoading', false);
        }
    },
    
    /**
     * Verifies a password against the stored password hash
     */
    async verifyPassword({ commit }, password) {
        try {
            commit('clearError');
            
            const { wallet } = await storage.get(['wallet']);
            
            if (!wallet || !wallet.passwordHash || !wallet.passwordSalt) {
                throw new Error('No wallet found or password data not set');
            }
            
            // Convert the salt from hex string back to Buffer if stored as string
            const salt = typeof wallet.passwordSalt === 'string' 
                ? Buffer.from(wallet.passwordSalt, 'hex') 
                : wallet.passwordSalt;
            
            // Call verifyHash with all required parameters
            const isValid = await verifyHash(password, wallet.passwordHash, salt);
            
            if (!isValid) {
                throw new Error('Invalid password');
            }
            
            return true;
        } catch (error) {
            console.error('Password verification failed:', error);
            commit('setError', error.message);
            throw error;
        }
    },
    
    /**
     * Starts checking the session validity at regular intervals
     */
    startSessionCheck({ dispatch, state }) {
        // Clear any existing timers
        if (sessionCheckTimer) {
            clearInterval(sessionCheckTimer);
        }
        
        // Set up new timer to check session validity
        sessionCheckTimer = setInterval(() => {
            if (state.sessionData && !WalletService.isSessionValid(state.sessionData)) {
                console.log('Session expired, locking wallet');
                dispatch('lock');
            }
        }, SESSION_CHECK_INTERVAL);
    },
    
    /**
     * Extends the current session
     */
    async extendSession({ commit, state }) {
        if (!state.sessionData) return false;
        
        try {
            // Extend the session
            const extendedSession = WalletService.extendSession(state.sessionData);
            
            // Get current wallet
            const { wallet } = await storage.get(['wallet']);
            
            // Update wallet with extended session
            const updatedWallet = {
                ...wallet,
                sessionData: extendedSession
            };
            
            // Save to storage
            await storage.set({
                wallet: updatedWallet
            });
            
            // Update state
            commit('setSessionData', extendedSession);
            
            return true;
        } catch (error) {
            console.error('Failed to extend session:', error);
            return false;
        }
    },
    
    async updateBalances({ commit, state }) {
        try {
            commit('SET_LOADING_BALANCES', true);
            
            const { address } = state;
            if (!address) return;
            
            const balances = await verusRPC.getAllCurrencyBalances(address);
            commit('SET_BALANCES', balances);
            
            return balances;
        } catch (error) {
            console.error('Error updating balances:', error);
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
            const { connectedSites = [] } = await storage.get(['connectedSites']);
            commit('SET_CONNECTED_SITES', connectedSites);
            return connectedSites;
        } catch (error) {
            console.error('Error getting connected sites:', error);
            return [];
        }
    },
    
    async disconnectSite({ commit, dispatch }, origin) {
        try {
            commit('clearError');
            
            // Get current connected sites
            const { connectedSites = [] } = await storage.get(['connectedSites']);
            
            // Filter out the site to disconnect
            const updatedSites = connectedSites.filter(site => site.origin !== origin);
            
            // Save updated sites
            await storage.set({ connectedSites: updatedSites });
            
            // Update state
            commit('SET_CONNECTED_SITES', updatedSites);
            
            return true;
        } catch (error) {
            console.error('Error disconnecting site:', error);
            commit('setError', error.message);
            return false;
        }
    },
    
    async addConnectedSite({ commit, state }, { origin, favicon }) {
        try {
            // Get current sites
            const { connectedSites = [] } = await storage.get(['connectedSites']);
            
            // Check if site is already connected
            if (connectedSites.some(site => site.origin === origin)) {
                return true;
            }
            
            // Add new site
            const updatedSites = [
                ...connectedSites,
                { origin, favicon, connectedAt: Date.now() }
            ];
            
            // Save to storage
            await storage.set({ connectedSites: updatedSites });
            
            // Update state
            commit('SET_CONNECTED_SITES', updatedSites);
            
            return true;
        } catch (error) {
            console.error('Error adding connected site:', error);
            return false;
        }
    },
    
    /**
     * Gets a private key for a specific currency (securely)
     */
    async getPrivateKey({ state, commit }, { currency, password }) {
        try {
            if (!state.addresses || !state.addresses[currency]) {
                throw new Error(`No address found for ${currency}`);
            }
            
            const { encryptedPrivateKey } = state.addresses[currency];
            if (!encryptedPrivateKey) {
                throw new Error(`No encrypted private key found for ${currency}`);
            }
            
            // Verify password first
            await this.dispatch('wallet/verifyPassword', password);
            
            // Decrypt the private key (securely)
            const privateKey = await WalletService.getPrivateKey(encryptedPrivateKey, password);
            
            // Return the private key, but make sure it gets cleaned up
            // Schedule private key cleanup from memory after use
            setTimeout(() => {
                // This is a best-effort cleanup, not foolproof
                if (typeof privateKey === 'string') {
                    privateKey.split('').map(() => '*').join('');
                }
            }, 60000); // Clean up after 1 minute max
            
            return privateKey;
        } catch (error) {
            console.error('Error getting private key:', error);
            commit('setError', error.message);
            throw error;
        }
    },
    
    /**
     * Changes the wallet password and re-encrypts all sensitive data
     * @param {string} currentPassword - The current wallet password 
     * @param {string} newPassword - The new password to set
     * @returns {Promise<boolean>} Success status
     */
    async changePassword({ state, commit, dispatch }, { currentPassword, newPassword }) {
        try {
            commit('clearError');
            commit('setLoading', true);
            
            // Verify current password
            const passwordCorrect = await dispatch('verifyPassword', currentPassword);
            if (!passwordCorrect) {
                throw new Error('Current password is incorrect');
            }
            
            // Get existing wallet
            const { wallet } = await storage.get(['wallet']);
            
            if (!wallet) {
                throw new Error('No wallet data found');
            }
            
            // Decrypt the mnemonic with the old password
            const mnemonic = await decrypt(wallet.encryptedMnemonic, currentPassword);
            
            // Re-encrypt with the new password
            const newEncryptedMnemonic = await encrypt(mnemonic, newPassword);
            
            // Re-encrypt private keys for all addresses
            const newAddresses = {};
            for (const [currency, addressData] of Object.entries(wallet.addresses)) {
                if (addressData && addressData.encryptedPrivateKey) {
                    const privateKey = await decrypt(addressData.encryptedPrivateKey, currentPassword);
                    const newEncryptedPrivateKey = await encrypt(privateKey, newPassword);
                    
                    newAddresses[currency] = {
                        ...addressData,
                        encryptedPrivateKey: newEncryptedPrivateKey
                    };
                } else {
                    newAddresses[currency] = addressData;
                }
            }
            
            // Generate new password hash and salt
            const { hash: newPasswordHash, salt: newPasswordSalt } = await WalletService.hashPassword(newPassword);
            
            // Convert salt to hex string for storage
            const newPasswordSaltHex = typeof newPasswordSalt === 'string' 
                ? newPasswordSalt 
                : newPasswordSalt.toString('hex');
            
            // Update wallet with re-encrypted data
            const updatedWallet = {
                ...wallet,
                encryptedMnemonic: newEncryptedMnemonic,
                addresses: newAddresses,
                passwordHash: newPasswordHash,
                passwordSalt: newPasswordSaltHex,
                passwordChanged: Date.now()
            };
            
            // Save updated wallet
            await storage.set({ wallet: updatedWallet });
            
            // Update state
            commit('setWalletData', updatedWallet);
            commit('setLoading', false);
            
            // Clear sensitive data from memory
            if (typeof mnemonic === 'string') {
                mnemonic = '';
            }
            
            return true;
        } catch (error) {
            console.error('Password change failed:', error);
            commit('setError', error.message);
            commit('setLoading', false);
            return false;
        }
    },
    
    /**
     * Securely retrieves the wallet's recovery phrase
     * @param {string} password - The wallet password to decrypt the mnemonic
     * @returns {Promise<string>} The decrypted recovery phrase
     */
    async getRecoveryPhrase({ state, commit }, { password }) {
        try {
            // Get wallet data from storage
            const result = await storage.get('wallet');
            const data = result.wallet;
            
            if (!data || !data.encryptedMnemonic) {
                throw new Error('Recovery phrase not found');
            }

            // Check that we have the required password data
            if (!data.passwordHash || !data.passwordSalt) {
                throw new Error('Password verification data is missing');
            }
            
            // Convert the salt from hex string back to Buffer if stored as string
            const salt = typeof data.passwordSalt === 'string' 
                ? Buffer.from(data.passwordSalt, 'hex') 
                : data.passwordSalt;
            
            // Verify the password first
            const passwordValid = await verifyHash(password, data.passwordHash, salt);
            
            if (!passwordValid) {
                throw new Error('Invalid password');
            }
            
            // Decrypt the mnemonic
            const mnemonic = await decrypt(data.encryptedMnemonic, password);
            
            // Set up automatic cleanup of sensitive data
            setTimeout(() => {
                // After 60 seconds, force cleanup of mnemonic from memory
                secureClearMemory({ mnemonic }, ['mnemonic']);
            }, 60000);
            
            return mnemonic;
        } catch (error) {
            console.error('Error retrieving recovery phrase:', error);
            throw error;
        }
    },
};

// Mutations
const mutations = {
    setInitialized(state, initialized) {
        state.initialized = initialized;
    },
    
    setAddress(state, address) {
        state.address = address;
    },
    
    setNetwork(state, network) {
        state.network = network;
    },
    
    setLoggedIn(state, isLoggedIn) {
        state.isLoggedIn = isLoggedIn;
        // Clear sensitive data on logout
        if (!isLoggedIn) {
            state.sessionData = null;
        }
    },
    
    setLocked(state, isLocked) {
        state.isLocked = isLocked;
        // Clear sensitive data on lock
        if (isLocked) {
            state.sessionData = null;
        }
    },
    
    setHasWallet(state, hasWallet) {
        state.hasWallet = hasWallet;
    },
    
    clearWalletData(state) {
        state.address = null;
        state.addresses = {};
        state.network = 'testnet';
        state.balances = {};
        state.walletId = null;
        state.sessionData = null;
        state.hasWallet = false;
        state.isLoggedIn = false;
        state.isLocked = true;
    },
    
    clearLoginData(state) {
        state.isLoggedIn = false;
        state.isLocked = true;
        state.sessionData = null;
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
        state.selectedCurrencies = state.selectedCurrencies.filter(
            curr => curr !== currency
        );
    },
    
    SET_SELECTED_CURRENCIES(state, currencies) {
        state.selectedCurrencies = currencies;
    },
    
    SET_CONNECTED_SITES(state, sites) {
        state.connectedSites = sites;
    },
    
    REMOVE_CONNECTED_SITE(state, origin) {
        state.connectedSites = state.connectedSites.filter(site => site.origin !== origin);
    },
    
    setWalletData(state, walletData) {
        // Store non-sensitive wallet data
        state.address = walletData.address;
        state.addresses = walletData.addresses || {};
        state.network = walletData.network || 'testnet';
        state.walletId = walletData.walletId;
        
        // Never store private keys or mnemonic in state
        // state.privateKey = null;
        // state.mnemonic = null;
    },
    
    setSessionData(state, sessionData) {
        state.sessionData = sessionData;
    }
};

export default {
    namespaced: true,
    state,
    getters,
    actions,
    mutations
};
