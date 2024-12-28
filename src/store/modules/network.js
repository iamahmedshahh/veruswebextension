// network.js
const state = {
    currentNetwork: import.meta.env.VITE_VERUS_NETWORK || 'testnet'
}

const mutations = {
    SET_NETWORK(state, network) {
        state.currentNetwork = network
    }
}

const actions = {
    changeNetwork({ commit }, network) {
        commit('SET_NETWORK', network)
        // Store in localStorage for persistence
        localStorage.setItem('verus_network', network)
        // Reload the page to apply new network settings
        window.location.reload()
    }
}

const getters = {
    currentNetwork: state => state.currentNetwork
}

export default {
    namespaced: true,
    state,
    mutations,
    actions,
    getters
}
