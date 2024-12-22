// Verus RPC communication utilities
// Default RPC configuration
const DEFAULT_RPC_CONFIG = {
    server: 'https://api.verustest.net'
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
async function makeRPCCall(method, params = [], config = DEFAULT_RPC_CONFIG, currency = null) {
    const RPC_SERVER = currency ? `${config.server}/${currency.toLowerCase()}` : config.server;

    console.log('Making RPC call to', RPC_SERVER, '- Method:', method, 'Params:', params);

    try {
        const response = await fetch(RPC_SERVER, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: Date.now(),
                method,
                params
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('RPC error response:', errorText);
            throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
        }

        const data = await response.json();
        console.log('RPC response:', data);

        if (data.error) {
            console.error('RPC error:', data.error);
            throw new Error(data.error.message || 'Unknown RPC error');
        }

        return data.result;
    } catch (error) {
        console.error('RPC call failed:', error);
        throw new Error(`RPC call failed: ${error.message}`);
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
 * @returns {Promise<number>} Balance in satoshis
 */
async function getAddressBalance(address) {
    try {
        const result = await makeRPCCall('getaddressbalance', [{ "addresses": [address] }]);
        return result.balance || 0;
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
        // First get the list of all currencies
        const currencies = await makeRPCCall('listcurrencies');
        
        // Initialize result object with main chain balance
        const balances = {
            'VRSCTEST': '0'
        };
        
        // Get main chain balance
        const mainBalance = await getAddressBalance(address);
        balances['VRSCTEST'] = (mainBalance / 100000000).toString(); // Convert from satoshis
        
        // Get balances for each currency
        for (const currency of currencies) {
            try {
                const result = await makeRPCCall('getaddressbalance', 
                    [{ "addresses": [address] }],
                    DEFAULT_RPC_CONFIG,
                    currency.currencyid
                );
                balances[currency.currencyid] = (result.balance / 100000000).toString();
            } catch (error) {
                console.warn(`Failed to get balance for ${currency.currencyid}:`, error);
                balances[currency.currencyid] = '0';
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
