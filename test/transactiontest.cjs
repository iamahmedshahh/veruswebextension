const pkg = require('@bitgo/utxo-lib');
const { ECPair, TransactionBuilder, Transaction, script, networks, opcodes } = pkg;
const bs58 = require('bs58');

// Static configuration
const TEST_PRIVATE_KEY = 'UwpJqNV91Ezbv4YbdqPAzyT36scbWm9uaRmHqPVC3xa6u5KPJydD'; // Add your private key here
const TEST_ADDRESS = 'RV2sJNR3Vi5nJT5h7AsNah7gPKTQaJ8e2L';
const TEST_CURRENCY = 'VRSCTEST';  // The currency you want to convert from
const TEST_CONVERT_TO = 'VETH';  // The currency you want to convert to
const TEST_VIA_CURRENCY = 'BRIDGE.VETH';  // The intermediate currency for conversion

// Network configuration for Verus
const NETWORK = {
    messagePrefix: '\x18Verus Coin Signed Message:\n',
    bech32: 'bc',
    bip32: {
        public: 0x0488b21e,
        private: 0x0488ade4
    },
    pubKeyHash: 0x3c,
    scriptHash: 0x55,
    wif: 0xbc,
    consensusBranchId: {
        1: 0x00,
        2: 0x00,
        3: 0x5ba81b19,
        4: 0x76b809bb
    },
    isZcash: true,  // Changed to true to enable Zcash transaction format
    coin: 'verus',
    consensusParams: {
        overwinterActive: true,
        saplingActive: true
    }
};

// RPC Configuration
const RPC_SERVER = 'https://api.verustest.net';  // Verus testnet RPC URL with endpoint

// Currency ID mapping
const CURRENCY_IDS = {
    'USD': 'iFawzbS99RqGs7J2TNxME1TmmayBGuRkA2',
    'VRSCTEST': 'iJhCezBExJHvtyH3fGhNnt2NhU4Ztkf2yq',
    'VETH': 'iCkKJuJScy4Z6NSDK7Mt42ZAB2NzVdR4zP',
    'BRIDGE.VETH': 'iNa6T62QzN9JBS1RpCQEbRgpLGCgBWiwE8'
};

function getCurrencyId(symbol) {
    return CURRENCY_IDS[symbol] || symbol;
}

function addressToHash160(address) {
    const decoded = bs58.decode(address);
    return decoded.slice(1, 21); // Skip network byte and take next 20 bytes
}

/**
 * Make an RPC call to the Verus daemon
 * @param {string} method - RPC method to call
 * @param {Array} params - RPC parameters
 * @param {string} currency - Optional currency for currency-specific calls
 * @returns {Promise<any>} RPC result
 */
async function makeRPCCall(method, params = [], currency = null) {
    try {
        // Add currency to path for currency-specific endpoints
        const rpcUrl = currency ? `${RPC_SERVER}/${currency.toLowerCase()}` : `${RPC_SERVER}/vrsctest`;
        
        console.log('RPC call:', method, JSON.stringify(params));
        console.log('RPC URL:', rpcUrl);
        
        const response = await fetch(rpcUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({
                method: method,
                params: params,
                id: Date.now(),
                jsonrpc: '2.0'
            })
        });
        
        // Check for HTTP errors
        if (!response.ok) {
            const errorBody = await response.text();
            console.error('HTTP error:', response.status, errorBody);
            throw new Error(`HTTP error ${response.status}: ${errorBody}`);
        }
        
        // Parse JSON response carefully
        let data;
        try {
            const responseText = await response.text();
            console.log('Raw RPC response text:', responseText);
            data = JSON.parse(responseText);
        } catch (parseError) {
            console.error('JSON parse error:', parseError);
            throw new Error(`Failed to parse JSON response: ${parseError.message}`);
        }
        
        // Check for RPC errors
        if (data.error) {
            console.error('RPC error:', data.error);
            throw new Error(`RPC error: ${JSON.stringify(data.error)}`);
        }
        
        console.log('RPC response:', {
            result: typeof data.result === 'string' && data.result.length > 100 
                ? `${data.result.substring(0, 100)}...` 
                : data.result
        });
        
        return data.result;
    } catch (error) {
        console.error('RPC call failed:', error);
        throw error;
    }
}

// Constants
const SATS_PER_COIN = 100000000; // 1 VRSC = 100,000,000 satoshis
const DEFAULT_FEE = 10000; // 0.0001 VRSC

/**
 * Build and sign a transaction
 * @param {string} fromAddress - Source address
 * @param {string} toAddress - Destination address
 * @param {number} amount - Amount to send in VRSC
 * @param {string} privateKey - Private key for signing
 * @returns {Promise<Object>} Transaction details
 */
async function buildAndSignTransaction(fromAddress, toAddress, amount, privateKey) {
    try {
        console.log(`Building transaction from ${fromAddress} to ${toAddress} for ${amount} VRSCTEST`);
        
        // Convert amount to satoshis
        const amountSat = Math.round(amount * SATS_PER_COIN);
        console.log('Amount in satoshis:', amountSat);
        
        // Get UTXOs
        const utxos = await fetchUTXOs(fromAddress);
        console.log(`Found ${utxos.length} UTXOs`);
        
        if (utxos.length === 0) {
            throw new Error(`No UTXOs available for ${fromAddress}`);
        }
        
        // Find a suitable UTXO with enough funds
        let selectedUtxo = null;
        const fee = DEFAULT_FEE;
        
        for (const utxo of utxos) {
            if (utxo.satoshis >= amountSat + fee) {
                selectedUtxo = utxo;
                break;
            }
        }
        
        if (!selectedUtxo) {
            // Use the largest UTXO available
            selectedUtxo = utxos.reduce((max, current) => 
                (current.satoshis > (max?.satoshis || 0)) ? current : max, null);
            
            if (selectedUtxo.satoshis < amountSat + fee) {
                throw new Error(`Insufficient funds. Required: ${(amountSat + fee) / SATS_PER_COIN} VRSC, Available: ${selectedUtxo.satoshis / SATS_PER_COIN} VRSC`);
            }
        }
        
        console.log('Selected UTXO:', selectedUtxo);
        
        // Create transaction builder with Verus network
        const txb = new TransactionBuilder(NETWORK);
        
        // Critical: Set the version to 4 for Verus
        txb.setVersion(4);
        
        // Add the input
        txb.addInput(selectedUtxo.txid, selectedUtxo.vout);
        
        // Add the output (recipient)
        txb.addOutput(toAddress, amountSat);
        
        // Calculate change amount
        const changeAmount = selectedUtxo.satoshis - amountSat - fee;
        console.log('Change amount (satoshis):', changeAmount);
        
        // Add change output if needed
        if (changeAmount > 546) { // dust threshold
            txb.addOutput(fromAddress, changeAmount);
        }
        
        // Sign the transaction input
        const keyPair = ECPair.fromWIF(privateKey, NETWORK);
        txb.sign(0, keyPair, null, Transaction.SIGHASH_ALL, selectedUtxo.satoshis);
        
        // Build the transaction
        const tx = txb.build();
        let txHex = tx.toHex();
        
        // IMPORTANT: Modify the transaction hex to include the Verus version group ID
        // Verus requires version group ID after the version bytes: 85202f89
        console.log('Original transaction hex:', txHex);
        
        // Insert the version group ID after the version (first 8 characters in hex)
        const verusVersionGroupId = '85202f89';
        txHex = txHex.substring(0, 8) + verusVersionGroupId + txHex.substring(8);
        
        console.log('Modified transaction hex with Verus version group ID:', txHex);
        
        console.log('Transaction built successfully');
        console.log('- Transaction version:', tx.version);
        console.log('- Inputs:', tx.ins.length);
        console.log('- Outputs:', tx.outs.length);
        console.log('- Transaction size:', txHex.length / 2, 'bytes');
        
        // Return the modified transaction details
        return {
            hex: txHex,
            txid: tx.getId(), // Note: txid will change but we can recalculate if needed
            inputs: [{
                txid: selectedUtxo.txid,
                vout: selectedUtxo.vout,
                satoshis: selectedUtxo.satoshis
            }],
            outputs: [
                { address: toAddress, satoshis: amountSat },
                ...(changeAmount > 546 ? [{ address: fromAddress, satoshis: changeAmount }] : [])
            ]
        };
    } catch (error) {
        console.error('Error building transaction:', error);
        throw error;
    }
}

/**
 * Fetch UTXOs for an address
 * @param {string} address - Address to fetch UTXOs for
 * @returns {Promise<Array>} UTXOs
 */
async function fetchUTXOs(address) {
    try {
        console.log(`Fetching UTXOs for ${address}`);
        
        const result = await makeRPCCall('getaddressutxos', [{ addresses: [address] }]);
        
        // Transform to format needed by BitGo library
        return result.map(utxo => ({
            txid: utxo.txid,
            vout: utxo.outputIndex || 0,
            satoshis: utxo.satoshis || 0,
            script: utxo.script,
            address: address,
            currencyvalues: utxo.currencyvalues || {}
        }));
    } catch (error) {
        console.error('Error fetching UTXOs:', error);
        throw error;
    }
}

/**
 * Broadcast a transaction to the network
 * @param {string} txHex - Signed transaction hex
 * @returns {Promise<string>} Transaction ID
 */
async function broadcastTransaction(txHex) {
    try {
        console.log('Broadcasting transaction');
        
        // First try to decode to verify format
        try {
            const decoded = await makeRPCCall('decoderawtransaction', [txHex]);
            console.log('Transaction decoded successfully:');
            console.log('- txid:', decoded.txid);
            console.log('- version:', decoded.version);
            console.log('- inputs:', decoded.vin.length);
            console.log('- outputs:', decoded.vout.length);
        } catch (decodeError) {
            console.error('ERROR: Transaction decode failed. This indicates an invalid transaction format.');
            console.error(decodeError);
            throw new Error('Transaction format is invalid');
        }
        
        // If decode is successful, broadcast
        const txid = await makeRPCCall('sendrawtransaction', [txHex]);
        console.log('Transaction broadcast successful!');
        console.log('Transaction ID:', txid);
        
        return txid;
    } catch (error) {
        console.error('Error broadcasting transaction:', error);
        throw error;
    }
}

/**
 * Run a test transaction
 */
async function runTransaction() {
    try {
        console.log('Starting simple transaction test');
        
        // Build and sign the transaction
        const tx = await buildAndSignTransaction(
            TEST_ADDRESS,
            TEST_ADDRESS,
            0.001, // Small test amount
            TEST_PRIVATE_KEY
        );
        
        console.log('Transaction built and signed successfully');
        
        // Broadcast the transaction
        const txid = await broadcastTransaction(tx.hex);
        
        console.log('Transaction completed successfully!');
        console.log('Transaction ID:', txid);
        
        return { txid, hex: tx.hex };
    } catch (error) {
        console.error('Transaction failed:', error);
        throw error;
    }
}

// Execute the transaction
runTransaction();

// Export functions for use in other modules
module.exports = {
    buildAndSignTransaction,
    fetchUTXOs,
    broadcastTransaction,
    runTransaction
};
