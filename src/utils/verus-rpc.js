// Verus RPC communication utilities
import store from '../store'
import { fromSatoshis } from './transaction';

// Constants
const SATS_PER_COIN = 100000000; // 1 VRSC = 100,000,000 satoshis

const getRPCConfig = () => {
    const server = store.getters['network/rpcServer'];
    if (!server) {
        throw new Error('RPC server configuration not found. Please check network settings.');
    }
    return { server };
};

/**
 * Make an RPC call to the Verus daemon
 * @param {string} method - The RPC method to call
 * @param {Array} params - The parameters to pass to the method
 * @param {Object} config - RPC configuration (optional)
 * @param {string} config.server - RPC server URL
 * @param {string} currency - The currency to use (optional)
 * @returns {Promise<any>} - The response from the RPC server
 */
async function makeRPCCall(method, params = [], config = null, currency = null) {
    try {
        const rpcConfig = config || getRPCConfig();
        const RPC_SERVER = currency ? `${rpcConfig.server}/${currency.toLowerCase()}` : rpcConfig.server;

        if (!RPC_SERVER) {
            throw new Error('RPC server URL is not configured');
        }

        console.log('Making RPC call to', RPC_SERVER, '- Method:', method, 'Params:', params);

        const response = await fetch(RPC_SERVER, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
            },
            body: JSON.stringify({
                method: method,
                params: params,
                id: Date.now(),
                jsonrpc: '2.0'
            })
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();

        if (data.error) {
            throw new Error(data.error.message || 'RPC call failed');
        }

        return data.result;
    } catch (error) {
        console.error('RPC call failed:', error);
        throw error;
    }
}

/**
 * Test the connection to the Verus daemon
 * @returns {Promise<Object>} - The getinfo response from the daemon
 */
async function testConnection() {
    try {
        const result = await makeRPCCall('getinfo');
        console.log('Connection test result:', result);
        return result;
    } catch (error) {
        console.error('Connection test failed:', error);
        throw error;
    }
}

/**
 * Gets the balance for an address
 * @param {string} address - Verus address
 * @param {boolean} [inVRSC=true] - If true, returns balance in VRSC, otherwise in satoshis
 * @returns {Promise<number>} Balance in VRSC or satoshis
 */
async function getAddressBalance(address, inVRSC = true) {
    try {
        const result = await makeRPCCall('getaddressbalance', [{ "addresses": [address] }]);
        const balanceInSats = result.balance || 0;
        return inVRSC ? fromSatoshis(balanceInSats) : balanceInSats;
    } catch (error) {
        console.error('Failed to get address balance:', error);
        throw error;
    }
}

/**
 * Gets unspent transaction outputs for an address
 * @param {string} address - Verus address
 * @returns {Promise<Array>} Array of UTXOs
 */
async function getAddressUtxos(address) {
    try {
        return await makeRPCCall('getaddressutxos', [{ "addresses": [address] }]);
    } catch (error) {
        console.error('Failed to get address UTXOs:', error);
        throw error;
    }
}

/**
 * Gets transaction history for an address
 * @param {string} address - Verus address
 * @returns {Promise<Array>} Array of transaction IDs
 */
async function getAddressHistory(address) {
    try {
        return await makeRPCCall('getaddresstxids', [{ "addresses": [address] }]);
    } catch (error) {
        console.error('Failed to get address history:', error);
        throw error;
    }
}

/**
 * Gets network information
 * @returns {Promise<Object>} Network info
 */
async function getNetworkInfo() {
    try {
        return await makeRPCCall('getinfo');
    } catch (error) {
        console.error('Failed to get network info:', error);
        throw error;
    }
}

/**
 * Gets all currency balances for an address
 * @param {string} address - Verus address
 * @returns {Promise<Object>} Object mapping currency symbols to balances
 */
async function getAllCurrencyBalances(address) {
    try {
        const balances = {};

        // Get main chain balance
        const mainBalance = await getAddressBalance(address);
        balances['VRSCTEST'] = mainBalance.toString();

        // Get balances for each currency
        const currencies = await makeRPCCall('listcurrencies');
        for (const currency of currencies) {
            if (currency.currencyid === 'iJhCezBExJHvtyH3fGhNnt2NhU4Ztkf2yq') continue; // Skip VRSCTEST

            try {
                const result = await makeRPCCall('getaddressbalance', [{ "addresses": [address] }], null, currency.currencyid);
                if (result && result.balance > 0) {
                    balances[currency.currencyid] = fromSatoshis(result.balance).toString();
                }
            } catch (error) {
                console.error(`Failed to get balance for currency ${currency.currencyid}:`, error);
            }
        }

        return balances;
    } catch (error) {
        console.error('Failed to get all currency balances:', error);
        throw error;
    }
}

/**
 * Get RPC connection instance
 * @returns {Promise<Object>} RPC connection object
 */
async function getRPCConnection() {
    try {
        // Test connection
        await testConnection();

        // Return an object with RPC methods
        return {
            makeRPCCall,
            getAddressBalance,
            getAllCurrencyBalances,
            getAddressUtxos,
            getAddressHistory,
            getNetworkInfo
        };
    } catch (error) {
        console.error('Failed to get RPC connection:', error);
        return null;
    }
}

// Export all functions
export {
    makeRPCCall,
    testConnection,
    getAddressBalance,
    getAddressUtxos,
    getAddressHistory,
    getNetworkInfo,
    getAllCurrencyBalances,
    getRPCConnection
};
