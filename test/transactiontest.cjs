const pkg = require('@bitgo/utxo-lib');
const { ECPair, TransactionBuilder, script, opcodes, Transaction } = pkg;

// Static configuration
const TEST_PRIVATE_KEY = '';
const TEST_ADDRESS = 'RV2sJNR3Vi5nJT5h7AsNah7gPKTQaJ8e2L';
const TEST_CURRENCY = 'VRSCTEST';
const TEST_CONVERT_TO = 'vETH';
const TEST_VIA_CURRENCY = 'VRSCTEST';

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
    wif: 0xBC,
    consensusBranchId: {
        1: 0x00,
        2: 0x00,
        3: 0x5ba81b19,
        4: 0x76b809bb
    },
    isZcash: false,  // Changed to false to disable Zcash-specific features
    coin: 'verus'
};

// RPC Configuration
const RPC_CONFIG = {
    server: 'https://api.verustest.net',  // Verus testnet RPC URL
    auth: null  // No auth for public API
};

/**
 * Make an RPC call to the Verus daemon
 * @param {string} method - The RPC method to call
 * @param {Array} params - The parameters to pass to the method
 * @returns {Promise<any>} - The response from the RPC server
 */
async function makeRPCCall(method, params = []) {
    try {
        const RPC_SERVER = `${RPC_CONFIG.server}/vrsctest`;
        
        console.log('RPC call:', method, params);
        
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
 * Send currency from one address to another
 * @param {Object} params - Transaction parameters
 * @param {string} params.fromAddress - Sender address
 * @param {string} params.toAddress - Recipient address
 * @param {number} params.amount - Amount to send
 * @param {string} params.currency - Currency to send
 * @param {string} params.privateKey - Private key for signing
 * @returns {Promise<Object>} Transaction result
 */
async function sendCurrency(params) {
    try {
        console.log('Starting sendCurrency with params:', params);
        
        // Convert amount to satoshis
        const amountSat = Math.round(params.amount * 100000000);
        console.log('Amount in satoshis:', amountSat);
        
        // Build and sign the transaction
        const tx = await buildAndSignTransaction(params.fromAddress, params.toAddress, amountSat, params.privateKey);
        
        // Broadcast the transaction
        const txid = await broadcastTransaction(tx.toHex());
        
        // Return the transaction details
        return {
            txid,
            fromAddress: params.fromAddress,
            toAddress: params.toAddress,
            amount: params.amount,
            txHex: tx.toHex()
        };
    } catch (error) {
        console.error('Error sending currency:', error);
        throw error;
    }
}

/**
 * Send a currency conversion transaction
 * @param {string} fromAddress - Source address or "*" for any available address
 * @param {string} toAddress - Destination address
 * @param {number} amount - Amount to send
 * @param {string} convertTo - Currency ID to convert to
 * @param {string} viaCurrency - Optional intermediate currency ID for conversion
 * @param {Object} options - Additional options
 * @returns {Promise<Object>} Transaction result
 */
async function sendCurrencyConversion(fromAddress, toAddress, amount, convertTo, viaCurrency = null, options = {}) {
    try {
        console.log(`Sending conversion transaction: ${amount} from ${fromAddress} to ${toAddress} converting to ${convertTo}${viaCurrency ? ` via ${convertTo}` : ''}`);
        
        // Prepare the outputs array with conversion parameters
        const outputs = [{
            address: toAddress,
            amount: amount,
            convertto: convertTo
        }];
        
        // Add via parameter if provided
        if (viaCurrency) {
            outputs[0].via = viaCurrency;
        }
        
        // Add any additional options
        if (options.memo) {
            outputs[0].memo = options.memo;
        }
        
        // Make the RPC call to send the currency with conversion
        const result = await makeRPCCall('sendcurrency', [fromAddress, outputs]);
        
        return {
            txid: result,
            fromAddress,
            toAddress,
            amount,
            convertTo,
            viaCurrency
        };
    } catch (error) {
        console.error('Error sending conversion transaction:', error);
        throw new Error(`Failed to send conversion transaction: ${error.message}`);
    }
}

/**
 * Estimate conversion between currencies
 * @param {number} amount - Amount to convert
 * @param {string} fromCurrency - Currency to convert from
 * @param {string} toCurrency - Currency to convert to
 * @param {string} viaCurrency - Currency to convert via
 * @returns {Promise<Object>} Conversion estimate
 */
async function estimateConversion(amount, fromCurrency, toCurrency, viaCurrency) {
    try {
        console.log(`Estimating conversion: ${amount} ${fromCurrency} -> ${toCurrency} via ${viaCurrency}`);
        
        // Prepare parameters for the estimateconversion RPC call
        const params = {
            amount: amount,
            currency: fromCurrency,
            convertto: toCurrency
        };
        
        // Add via currency if provided
        if (viaCurrency) {
            params.via = viaCurrency;
        }
        
        // Make RPC call to estimate conversion
        const result = await makeRPCCall('estimateconversion', [params]);
        
        // Format the result
        return {
            fromCurrency,
            toCurrency,
            viaCurrency,
            inputAmount: amount,
            convertedAmount: result.estimatedcurrencyout,
            conversionRate: result.estimatedcurrencyout / amount
        };
    } catch (error) {
        console.error('Error estimating conversion:', error);
        throw error;
    }
}

/**
 * Run a test conversion transaction
 * @param {string} fromCurrency - Source currency ID
 * @param {string} toCurrency - Target currency ID
 * @param {number} amount - Amount to convert
 * @param {string} toAddress - Destination address
 * @param {string} viaCurrency - Optional intermediate currency ID for conversion
 * @returns {Promise<void>}
 */
async function testConversionTransaction(fromCurrency, toCurrency, amount, toAddress, viaCurrency = null) {
    try {
        // First estimate the conversion to show expected results
        const estimate = await estimateConversion(amount, fromCurrency, toCurrency, viaCurrency);
        console.log('Estimated conversion:', JSON.stringify(estimate, null, 2));
        
        // Ask for confirmation before proceeding
        console.log(`Ready to send ${amount} ${fromCurrency} to ${toAddress} converting to ${toCurrency}${viaCurrency ? ` via ${toCurrency}` : ''}`);
        console.log(`Expected to receive approximately: ${estimate.convertedAmount} ${toCurrency}`);
        
        // Send the conversion transaction
        // Using "*" as fromAddress to let the wallet choose an appropriate source address
        const txResult = await sendCurrencyConversion("*", toAddress, amount, toCurrency, viaCurrency);
        
        console.log('Transaction sent successfully!');
        console.log('Transaction ID:', txResult.txid);
        console.log('Transaction details:', JSON.stringify(txResult, null, 2));
        
        return txResult;
    } catch (error) {
        console.error('Error in test conversion transaction:', error);
        throw error;
    }
}

/**
 * Send a currency conversion transaction using UTXO library
 * @param {Object} params - Parameters for sending currency conversion
 * @param {string} params.fromAddress - Address to send from
 * @param {string} params.toAddress - Address to send to
 * @param {number} params.amount - Amount to send
 * @param {string} params.convertTo - Currency to convert to
 * @param {string} params.viaCurrency - Currency to convert via
 * @param {string} params.privateKey - Private key for signing
 * @param {string} params.currency - Currency to send
 * @returns {Promise<Object>} Transaction details
 */
async function sendCurrencyConversionWithUTXO(params) {
    try {
        console.log(`Building conversion transaction: ${params.amount} from ${params.fromAddress} to ${params.toAddress} converting to ${params.convertTo} via ${params.viaCurrency}`);
        
        // Convert amount to satoshis
        const amountSat = Math.round(params.amount * 100000000);
        console.log('Amount in satoshis:', amountSat);
        
        // Fetch UTXOs
        const utxos = await fetchUTXOs(params.fromAddress);
        console.log('Raw UTXOs:', utxos);
        console.log('Found UTXOs:', utxos.length);
        
        // Filter UTXOs for the specified currency
        const relevantUtxos = utxos.filter(utxo => {
            // For VRSC/VRSCTEST, we want UTXOs with satoshis
            if (params.currency === 'VRSC' || params.currency === 'VRSCTEST') {
                return utxo.satoshis > 0;
            }
            // For other currencies, we'd need to check currencyvalues
            return utxo.currencyvalues && utxo.currencyvalues[params.currency];
        });
        console.log('Relevant UTXOs:', relevantUtxos);
        console.log('Relevant UTXOs for currency:', relevantUtxos.length);
        
        if (relevantUtxos.length === 0) {
            throw new Error(`No UTXOs found for currency: ${params.currency}`);
        }
        
        // Create transaction builder
        const txb = new TransactionBuilder(NETWORK);
        
        // Set version for Verus transactions (version 4)
        txb.setVersion(4);
        
        // Add inputs
        let totalInput = 0;
        relevantUtxos.forEach(utxo => {
            txb.addInput(utxo.txid, utxo.vout);
            totalInput += utxo.satoshis;
        });
        
        // Create OP_RETURN output with conversion data
        const conversionData = {
            convertto: params.convertTo,
            via: params.viaCurrency
        };
        const conversionDataBuffer = Buffer.from(JSON.stringify(conversionData));
        const opReturnScript = script.compile([
            opcodes.OP_RETURN,
            conversionDataBuffer
        ]);
        txb.addOutput(opReturnScript, 0);
        
        // Add payment output
        txb.addOutput(params.toAddress, amountSat);
        
        // Add change output (if needed)
        const fee = 10000; // 0.0001 VRSC
        if (totalInput > amountSat + fee) {
            txb.addOutput(params.fromAddress, totalInput - amountSat - fee);
        }
        
        // Sign inputs
        const keyPair = ECPair.fromWIF(params.privateKey, NETWORK);
        for (let i = 0; i < relevantUtxos.length; i++) {
            txb.sign(i, keyPair);
        }
        
        // Build transaction
        const tx = txb.build();
        const txHex = tx.toHex();
        
        // Broadcast transaction
        const txid = await broadcastTransaction(txHex);
        
        // Return transaction details
        return {
            txid,
            fromAddress: params.fromAddress,
            toAddress: params.toAddress,
            amount: params.amount,
            convertTo: params.convertTo,
            viaCurrency: params.viaCurrency,
            txHex
        };
    } catch (error) {
        console.error('Error sending currency conversion:', error);
        throw error;
    }
}

/**
 * Test conversion transaction using UTXO library
 * @param {Object} params - Transaction parameters
 * @param {string} params.fromAddress - Address to send from
 * @param {string} params.toAddress - Address to send to
 * @param {number} params.amount - Amount to send
 * @param {string} params.currency - Currency to send
 * @param {string} params.convertTo - Currency to convert to
 * @param {string} params.viaCurrency - Currency to convert via
 * @param {string} params.privateKey - Private key for signing
 * @returns {Promise<Object>} Transaction result
 */
async function testConversionTransactionWithUTXO(params) {
    try {
        console.log(`Testing UTXO conversion transaction: ${params.amount} from ${params.fromAddress} to ${params.toAddress} converting to ${params.convertTo} via ${params.viaCurrency}`);
        
        // First, estimate the conversion
        const estimate = await estimateConversion(params.amount, params.currency, params.convertTo, params.viaCurrency);
        console.log('Estimated conversion:', estimate);
        
        console.log(`Ready to send ${params.amount} from ${params.fromAddress} to ${params.toAddress} converting to ${params.convertTo} via ${params.viaCurrency}`);
        console.log(`Expected to receive approximately: ${estimate.convertedAmount} ${params.convertTo}`);
        
        // Now send the conversion transaction
        const result = await sendCurrencyConversionWithUTXO(params);
        
        console.log('Conversion transaction complete:', JSON.stringify(result, null, 2));
        
        return result;
    } catch (error) {
        console.error('Error testing conversion transaction:', error);
        throw error;
    }
}

/**
 * Fetch UTXOs for a given address
 * @param {string} address - Address to fetch UTXOs for
 * @returns {Promise<Array>} Array of UTXOs
 */
async function fetchUTXOs(address) {
    try {
        console.log('Fetching UTXOs for address:', address);
        
        // Get UTXOs from the API
        const result = await makeRPCCall('getaddressutxos', [{
            addresses: [address]
        }]);
        
        console.log('Raw UTXOs:', result);
        
        // Transform the UTXOs to a format compatible with BitGo's library
        return result.map(utxo => ({
            txid: utxo.txid,
            vout: utxo.outputIndex,
            scriptPubKey: utxo.script,
            amount: utxo.satoshis / 100000000,
            satoshis: utxo.satoshis,
            address: address,
            currencyvalues: utxo.currencyvalues
        }));
    } catch (error) {
        console.error('Error fetching UTXOs:', error);
        throw error;
    }
}

/**
 * Broadcast a transaction to the network
 * @param {string} txHex - Transaction hex to broadcast
 * @returns {Promise<string>} Transaction ID
 */
async function broadcastTransaction(txHex) {
    try {
        console.log('Broadcasting transaction...');
        console.log('Transaction hex:', txHex);
        
        // Send the raw transaction to the network
        const txid = await makeRPCCall('sendrawtransaction', [txHex]);
        
        console.log('Transaction sent successfully!');
        console.log('Transaction ID:', txid);
        
        return txid;
    } catch (error) {
        console.error('Error broadcasting transaction:', error);
        throw error;
    }
}

/**
 * Convert address to script
 * @param {string} address - Address to convert
 * @returns {Buffer} Script buffer
 */
function addressToScript(address) {
    // For testing purposes, we'll return a hardcoded script for the test address
    if (address === 'RV2sJNR3Vi5nJT5h7AsNah7gPKTQaJ8e2L') {
        return Buffer.from('76a914d8ad044d8ec9e0267fe379b3e8e33add89634c2888ac', 'hex');
    }
    
    // For P2PKH addresses (starting with R)
    if (address.startsWith('R')) {
        // In a real implementation, you would decode the address and create the proper script
        // For now, we'll just throw an error for addresses we don't have hardcoded
        throw new Error(`Address not supported for testing: ${address}`);
    }
    
    // For other address types
    throw new Error(`Unsupported address type: ${address}`);
}

/**
 * Resolve Verus ID to transparent address
 * @param {string} verusId - Verus ID to resolve
 * @returns {Promise<string>} Resolved address
 */
async function resolveVerusId(verusId) {
    try {
        console.log('Resolving Verus ID:', verusId);
        
        // Validate Verus ID format
        if (!verusId.startsWith('i')) {
            throw new Error('Not a valid Verus ID format - must start with "i"');
        }

        const response = await makeRPCCall('getidentity', [verusId]);
        console.log('Identity info:', JSON.stringify(response, null, 2));
        
        if (!response || !response.identity) {
            throw new Error(`Could not resolve Verus ID: ${verusId}`);
        }

        const identityInfo = response.identity;

        // Check for identity address in different possible locations
        // First try primary addresses
        if (identityInfo.primaryaddresses && identityInfo.primaryaddresses.length > 0) {
            const primaryAddress = identityInfo.primaryaddresses[0];
            console.log('Found primary address:', primaryAddress);
            return primaryAddress;
        }

        // Then try identity address
        if (identityInfo.identityaddress) {
            console.log('Found identity address:', identityInfo.identityaddress);
            return identityInfo.identityaddress;
        }

        throw new Error(`No valid address found for Verus ID: ${verusId}`);
    } catch (error) {
        console.error('Error resolving Verus ID:', error);
        if (error.message.includes('has no matching Script')) {
            throw new Error(`Invalid destination address format for Verus ID: ${verusId}`);
        }
        throw error;
    }
}

/**
 * Build and sign a transaction
 * @param {string} fromAddress - Sender address
 * @param {string} toAddress - Recipient address
 * @param {number} amountSat - Amount to send in satoshis
 * @param {string} privateKey - Private key for signing
 * @returns {Promise<Object>} Built transaction
 */
async function buildAndSignTransaction(fromAddress, toAddress, amountSat, privateKey) {
    try {
        // Fetch UTXOs
        console.log('Fetching UTXOs for address:', fromAddress);
        const utxos = await fetchUTXOs(fromAddress);
        console.log('Raw UTXOs:', utxos);
        console.log('Found UTXOs:', utxos.length);

        // Filter UTXOs for the specified currency (assuming VRSC/VRSCTEST)
        const relevantUtxos = utxos.filter(utxo => utxo.satoshis > 0);
        console.log('Relevant UTXOs:', relevantUtxos);
        console.log('Relevant UTXOs for currency:', relevantUtxos.length);

        if (relevantUtxos.length === 0) {
            throw new Error(`No UTXOs found for address: ${fromAddress}`);
        }

        // Create transaction builder
        const txb = new TransactionBuilder(NETWORK);
        
        // Set version for Verus transactions (version 4)
        txb.setVersion(4);
        
        // Add inputs
        let totalInput = 0;
        relevantUtxos.forEach(utxo => {
            txb.addInput(utxo.txid, utxo.vout);
            totalInput += utxo.satoshis;
        });

        // Add outputs
        // Payment output
        txb.addOutput(toAddress, amountSat);

        // Change output (if needed)
        const fee = 10000; // 0.0001 VRSC
        if (totalInput > amountSat + fee) {
            txb.addOutput(fromAddress, totalInput - amountSat - fee);
        }

        // Sign inputs
        const keyPair = ECPair.fromWIF(privateKey, NETWORK);
        for (let i = 0; i < relevantUtxos.length; i++) {
            const utxo = relevantUtxos[i];
            txb.sign(
                i,
                keyPair,
                null,
                Transaction.SIGHASH_ALL,
                utxo.satoshis
            );
        }

        // Build transaction
        const tx = txb.build();
        
        // For debugging, log the transaction hex
        console.log('Transaction hex:', tx.toHex());
        
        // Verify transaction
        try {
            // Check if the transaction is valid
            tx.ins.forEach((input, i) => {
                if (!input.script || input.script.length === 0) {
                    throw new Error(`Input ${i} has no signature script`);
                }
            });
            
            // Check outputs
            tx.outs.forEach((output, i) => {
                if (output.value <= 0) {
                    throw new Error(`Output ${i} has invalid value: ${output.value}`);
                }
            });
            
            console.log('Transaction validation passed');
        } catch (validationError) {
            console.error('Transaction validation failed:', validationError);
            throw validationError;
        }
        
        return tx;
    } catch (error) {
        console.error('Error building and signing transaction:', error);
        throw error;
    }
}

/**
 * Run the transaction with static values
 * @param {Object} params - Transaction parameters
 * @param {string} params.fromAddress - Address to send from
 * @param {string} params.toAddress - Address to send to
 * @param {number} params.amount - Amount to send
 * @param {string} params.currency - Currency to send
 * @param {string} params.convertTo - Currency to convert to
 * @param {string} params.viaCurrency - Currency to convert via
 * @param {string} params.privateKey - Private key for signing
 * @returns {Promise<void>}
 */
async function runTransaction() {
    try {
        // First, send a regular transaction
        const result = await sendCurrency({
            fromAddress: TEST_ADDRESS,
            toAddress: TEST_ADDRESS,
            amount: 1,
            currency: TEST_CURRENCY,
            privateKey: TEST_PRIVATE_KEY
        });
        
        console.log('Transaction Result:', result);
        
        // Then, test a conversion transaction
        const conversionResult = await testConversionTransactionWithUTXO({
            fromAddress: TEST_ADDRESS,
            toAddress: TEST_ADDRESS,
            amount: 1,
            currency: TEST_CURRENCY,
            convertTo: TEST_CONVERT_TO,
            viaCurrency: TEST_VIA_CURRENCY,
            privateKey: TEST_PRIVATE_KEY
        });
        
        console.log('Transaction sent successfully!');
        console.log('Transaction ID:', conversionResult.txid);
    } catch (error) {
        console.error('Error running transaction:', error);
        throw error;
    }
}

// Execute the transaction
runTransaction();

// Export functions for use in other modules
module.exports = {
    sendCurrency,
    sendCurrencyConversionWithUTXO,
    testConversionTransactionWithUTXO,
    fetchUTXOs,
    addressToScript,
    broadcastTransaction,
    estimateConversion,
    resolveVerusId,
    buildAndSignTransaction
};
