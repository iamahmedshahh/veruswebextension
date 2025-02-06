// network.js
import { NETWORKS, DEFAULT_NETWORK } from '../../config/networks'

const state = {
    currentNetwork: localStorage.getItem('verus_network') || DEFAULT_NETWORK,
    initialized: false
}

const mutations = {
    SET_NETWORK(state, network) {
        state.currentNetwork = network
    },
    SET_INITIALIZED(state, value) {
        state.initialized = value
    }
}

const actions = {
    initialize({ commit, state }) {
        if (!state.initialized) {
            const savedNetwork = localStorage.getItem('verus_network')
            if (savedNetwork && NETWORKS[savedNetwork]) {
                commit('SET_NETWORK', savedNetwork)
            } else {
                commit('SET_NETWORK', DEFAULT_NETWORK)
                localStorage.setItem('verus_network', DEFAULT_NETWORK)
            }
            commit('SET_INITIALIZED', true)
        }
    },
    changeNetwork({ commit }, network) {
        if (!NETWORKS[network]) {
            throw new Error(`Invalid network: ${network}`)
        }
        commit('SET_NETWORK', network)
        // Store in localStorage for persistence
        localStorage.setItem('verus_network', network)
        // Reload the page to apply new network settings
        window.location.reload()
    }
}

const getters = {
    currentNetwork: state => state.currentNetwork,
    networkConfig: state => NETWORKS[state.currentNetwork],
    rpcServer: state => NETWORKS[state.currentNetwork]?.rpcServer,
    mainCoin: state => NETWORKS[state.currentNetwork]?.mainCoin,
    isInitialized: state => state.initialized
}

export default {
    namespaced: true,
    state,
    mutations,
    actions,
    getters
}
