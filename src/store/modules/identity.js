import VerusIDService from '../../services/VerusIDService';

export default {
    namespaced: true,

    state: {
        identities: [],
        currentIdentity: null,
        loading: false,
        error: null
    },

    mutations: {
        SET_IDENTITIES(state, identities) {
            state.identities = identities;
        },

        SET_CURRENT_IDENTITY(state, identity) {
            state.currentIdentity = identity;
        },

        SET_LOADING(state, loading) {
            state.loading = loading;
        },

        SET_ERROR(state, error) {
            state.error = error;
        }
    },

    actions: {
        async fetchIdentities({ commit }) {
            try {
                commit('SET_LOADING', true);
                const identities = await VerusIDService.listIdentities();
                commit('SET_IDENTITIES', identities);
            } catch (error) {
                commit('SET_ERROR', error.message);
                throw error;
            } finally {
                commit('SET_LOADING', false);
            }
        },

        async fetchIdentity({ commit }, identityName) {
            try {
                commit('SET_LOADING', true);
                const identity = await VerusIDService.getIdentity(identityName);
                commit('SET_CURRENT_IDENTITY', identity);
                return identity;
            } catch (error) {
                commit('SET_ERROR', error.message);
                throw error;
            } finally {
                commit('SET_LOADING', false);
            }
        },

        async registerIdentity({ dispatch }, { identityName, options }) {
            try {
                commit('SET_LOADING', true);
                await VerusIDService.registerIdentity(identityName, options);
                await dispatch('fetchIdentities');
            } catch (error) {
                commit('SET_ERROR', error.message);
                throw error;
            } finally {
                commit('SET_LOADING', false);
            }
        },

        async updateIdentity({ dispatch }, { identityName, updates }) {
            try {
                commit('SET_LOADING', true);
                await VerusIDService.updateIdentity(identityName, updates);
                await dispatch('fetchIdentity', identityName);
            } catch (error) {
                commit('SET_ERROR', error.message);
                throw error;
            } finally {
                commit('SET_LOADING', false);
            }
        },

        async revokeIdentity({ dispatch }, { identityName, reason }) {
            try {
                commit('SET_LOADING', true);
                await VerusIDService.revokeIdentity(identityName, reason);
                await dispatch('fetchIdentities');
            } catch (error) {
                commit('SET_ERROR', error.message);
                throw error;
            } finally {
                commit('SET_LOADING', false);
            }
        },

        async recoverIdentity({ dispatch }, { identityName, recoveryAddress }) {
            try {
                commit('SET_LOADING', true);
                await VerusIDService.recoverIdentity(identityName, recoveryAddress);
                await dispatch('fetchIdentity', identityName);
            } catch (error) {
                commit('SET_ERROR', error.message);
                throw error;
            } finally {
                commit('SET_LOADING', false);
            }
        }
    },

    getters: {
        getIdentityByName: (state) => (name) => {
            return state.identities.find(identity => 
                identity.name === name || identity.identity === name
            );
        },
        
        hasIdentities: (state) => state.identities.length > 0,
        
        isLoading: (state) => state.loading,
        
        getError: (state) => state.error
    }
};
