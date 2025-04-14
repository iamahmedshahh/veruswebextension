const pkg = require('@bitgo/utxo-lib');
const { ECPair, Transaction, script, networks, opcodes, TransactionBuilder } = pkg;
const bs58 = require('bs58');
const crypto = require('crypto');

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

// Custom Verus network configuration with Zcash compatibility flags
const VERUS_NETWORK = networks.verustest // Hex representation of 0x892f2085

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

// --- Conversion Output Script Helper (ported from extension) ---
function createCurrencyOutputScript(address, currencyId, flags = 0) {
    // Validate address
    let decoded;
    try {
        decoded = bs58.decode(address);
        if (decoded.length !== 25) throw new Error('Invalid address length');
    } catch (e) { throw new Error('Invalid address: ' + e.message); }
    const hash160 = decoded.slice(1, 21);
    // Flags: 0x03 for currency + non-gateway
    const scriptFlags = flags | 0x03;
    // Handle currencyId (base58 or hex)
    let currencyIdBuffer;
    if (currencyId.startsWith('i')) {
        const decodedId = bs58.decode(currencyId);
        currencyIdBuffer = decodedId.slice(1, 21);
    } else {
        currencyIdBuffer = Buffer.from(currencyId, 'hex');
    }
    
    // Build the conversion script
    const scriptElements = [
        Buffer.from([0xc0]), // OP_CONVERT
        Buffer.from([0x04]), // Version
        Buffer.from([scriptFlags]),
        Buffer.from([0x01]), // Num outputs
        Buffer.from([0x01]), // Output index
        currencyIdBuffer,
        Buffer.from([opcodes.OP_DUP]),
        Buffer.from([opcodes.OP_HASH160]),
        hash160,
        Buffer.from([opcodes.OP_EQUALVERIFY]),
        Buffer.from([opcodes.OP_CHECKSIG])
    ];
    const scriptBuffer = Buffer.concat(scriptElements);
    
    // Create P2SH script
    const scriptHash = crypto.createHash('sha256').update(scriptBuffer).digest().slice(0, 20);
    const p2shScript = script.compile([
        opcodes.OP_HASH160,
        scriptHash,
        opcodes.OP_EQUAL
    ]);
    
    return {
        scriptBuffer,
        p2shScript
    };
}

// --- Updated conversion transaction builder ---
async function testConversionTransactionWithUTXO({ fromAddress, toAddress, amount, currency, convertTo, viaCurrency, privateKey }) {
    try {
        privateKey = privateKey || TEST_PRIVATE_KEY;
        
        // Step 1: Get UTXOs
        console.log(`Building transaction from ${fromAddress} to ${toAddress}`);
        console.log(`Converting ${amount} ${currency} to ${convertTo}${viaCurrency ? ` via ${viaCurrency}` : ''}`);
        
        const utxos = await fetchUTXOs(fromAddress);
        if (!utxos || utxos.length === 0) throw new Error('No UTXOs found');
        
        // Step 2: Select UTXOs
        const fee = 0.0001;
        const totalNeeded = amount + fee;
        const selected = utxos.find(u => u.satoshis / SATS_PER_COIN >= totalNeeded);
        if (!selected) throw new Error('No UTXO with sufficient funds');
        
        console.log('Selected UTXO:', {
            txid: selected.txid.substring(0, 10) + '...',
            vout: selected.outputIndex || selected.vout,
            satoshis: selected.satoshis / SATS_PER_COIN
        });
        
        // Create raw transaction with manual serialization to include versionGroupId
        const tx = new Transaction();
        tx.version = 4;
        
        // Add the input
        tx.addInput(Buffer.from(selected.txid, 'hex').reverse(), selected.outputIndex || selected.vout);
        
        // Get conversion script
        const currencyId = CURRENCY_IDS[convertTo] || convertTo;
        console.log('Using currency ID for conversion:', currencyId);
        const scriptInfo = createCurrencyOutputScript(toAddress, currencyId);
        console.log('Created conversion script, length:', scriptInfo.p2shScript.length);
        
        // Add output with conversion script
        tx.addOutput(scriptInfo.p2shScript, Math.round(amount * SATS_PER_COIN));
        
        // Add change output if needed
        const change = selected.satoshis - Math.round((amount + fee) * SATS_PER_COIN);
        if (change > 0) {
            console.log('Adding change output:', change / SATS_PER_COIN);
            
            // Create standard P2PKH script for the change
            const fromHash160 = addressToHash160(fromAddress);
            const p2pkhScript = script.compile([
                opcodes.OP_DUP,
                opcodes.OP_HASH160,
                fromHash160,
                opcodes.OP_EQUALVERIFY,
                opcodes.OP_CHECKSIG
            ]);
            
            tx.addOutput(p2pkhScript, change);
        }
        
        // Step 4: Sign the transaction
        // Since we're building the tx manually, we need to sign it manually too
        const keyPair = ECPair.fromWIF(privateKey, networks.verustest);
        const fromPubKeyHash = addressToHash160(fromAddress);
        
        // Create the input script
        const signatureHash = tx.hashForSignature(
            0,  // Input index
            script.compile([
                opcodes.OP_DUP,
                opcodes.OP_HASH160,
                fromPubKeyHash,
                opcodes.OP_EQUALVERIFY,
                opcodes.OP_CHECKSIG
            ]),
            Transaction.SIGHASH_ALL
        );
        
        // Sign the hash and create the signature script
        const signature = keyPair.sign(signatureHash);
        const signatureScript = script.compile([
            Buffer.concat([
                signature.toScriptSignature(Transaction.SIGHASH_ALL),
                keyPair.getPublicKeyBuffer()
            ])
        ]);
        
        // Add the signature script to the input
        tx.setInputScript(0, signatureScript);
        
        // Get the basic transaction hex
        let txHex = tx.toHex();
        
        // IMPORTANT: We need to manually insert the version group ID
        // Verus transactions require a version group ID (0x892f2085) after the version field
        // The version is the first 4 bytes (8 hex chars), then we insert the version group ID
        const VERSION_GROUP_ID = '85202f89'; // Little-endian format
        txHex = txHex.substring(0, 8) + VERSION_GROUP_ID + txHex.substring(8);
        
        console.log('Transaction built and signed successfully');
        console.log('Transaction hex (with versionGroupId):', txHex.substring(0, 64) + '...');
        
        // Step 5: Broadcast
        console.log('Broadcasting transaction...');
        const txid = await broadcastTransaction(txHex);
        console.log('Transaction broadcast successful with txid:', txid);
        
        return { txid, hex: txHex };
    } catch (e) {
        console.error('Conversion transaction failed:', e);
        throw e;
    }
}

// Export functions for use in other modules
module.exports = {
    fetchUTXOs,
    broadcastTransaction,
    testConversionTransactionWithUTXO,
    TEST_PRIVATE_KEY
};
