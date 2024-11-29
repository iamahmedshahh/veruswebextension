// Verus RPC communication utilities
const RPC_SERVER = import.meta.env.VITE_VRSCTEST_RPC_SERVER?.replace(/['"]/g, '') || 'https://api.verustest.net';

/**
 * Make an RPC call to the Verus daemon
 * @param {string} method - The RPC method to call
 * @param {Array} params - The parameters to pass to the method
 * @param {string} currency - The currency to use (optional)
 * @returns {Promise<any>} - The response from the RPC server
 */
async function makeRPCCall(method, params = [], currency = null) {
    // If currency is provided, append it to the RPC server URL
    const serverUrl = currency ? `${RPC_SERVER}/${currency.toLowerCase()}` : RPC_SERVER;
    console.log('Making RPC call to', serverUrl, '- Method:', method, 'Params:', params);

    try {
        const response = await fetch(serverUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
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

// Export all functions
export {
    makeRPCCall,
    testConnection,
    getAddressBalance,
    getAddressUtxos,
    getAddressHistory,
    getNetworkInfo
};
