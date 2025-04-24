const pkg = require('@bitgo/utxo-lib');
const { ECPair, Transaction, script, networks, opcodes, TransactionBuilder } = pkg;
const bs58 = require('bs58');
const crypto = require('crypto');

// Static configuration
const TEST_PRIVATE_KEY = ''; // Add your private key here
// const TEST_ADDRESS = 'RV2sJNR3Vi5nJT5h7AsNah7gPKTQaJ8e2L';
// const TEST_CURRENCY = 'VRSCTEST';  // The currency you want to convert from
// const TEST_CONVERT_TO = 'VETH';  // The currency you want to convert to
// const TEST_VIA_CURRENCY = 'BRIDGE.VETH';  // The intermediate currency for conversion

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
  // Also update the createCurrencyOutputScript function to ensure it's correctly formatted
  function createCurrencyOutputScript(address, currencyId, viaCurrencyId = null, flags = 0) {
    // Validate address
    let decoded;
    try {
      decoded = bs58.decode(address);
      if (decoded.length !== 25) throw new Error('Invalid address length');
    } catch (e) { throw new Error('Invalid address: ' + e.message); }
    const recipientHash160 = decoded.slice(1, 21);
  
    // Prepare currencyId buffer (should be 20 bytes)
    let currencyIdBuffer;
    if (typeof currencyId === 'string' && currencyId.startsWith('i')) {
      currencyIdBuffer = addressToHash160(currencyId);
    } else {
      currencyIdBuffer = Buffer.from(currencyId, 'hex');
    }
    if (currencyIdBuffer.length !== 20) {
      throw new Error('currencyIdBuffer must be 20 bytes');
    }
  
    // Prepare viaCurrencyId buffer (should be 20 bytes if provided)
    let viaCurrencyBuffer = null;
    if (viaCurrencyId) {
      if (typeof viaCurrencyId === 'string' && viaCurrencyId.startsWith('i')) {
        viaCurrencyBuffer = addressToHash160(viaCurrencyId);
      } else {
        viaCurrencyBuffer = Buffer.from(viaCurrencyId, 'hex');
      }
      if (viaCurrencyBuffer.length !== 20) {
        throw new Error('viaCurrencyBuffer must be 20 bytes');
      }
    }
  
    // Construct the conversion script
    const scriptElements = [];
    scriptElements.push(Buffer.from([0xc0])); // OP_CONVERT
    scriptElements.push(Buffer.from([0x04])); // version
    scriptElements.push(Buffer.from([flags])); // flags
    scriptElements.push(Buffer.from([0x01])); // num outputs
    scriptElements.push(Buffer.from([0x00])); // output index
    scriptElements.push(currencyIdBuffer);    // destination currency
    if (viaCurrencyBuffer) scriptElements.push(viaCurrencyBuffer); // via/bridge currency
    scriptElements.push(recipientHash160);    // recipient
  
    const redeemScript = Buffer.concat(scriptElements);
    const scriptHash = crypto.createHash('ripemd160')
      .update(crypto.createHash('sha256').update(redeemScript).digest())
      .digest();
    const p2shScript = Buffer.concat([
      Buffer.from([0xa9]), // OP_HASH160
      Buffer.from([0x14]), // Push 20 bytes
      scriptHash,          // <scriptHash> (20 bytes)
      Buffer.from([0x87])  // OP_EQUAL
    ]);
  
    return {
      redeemScript,
      p2shScript,
      scriptHash,
      type: 'conversion'
    };
  }
  
async function testConversionTransactionWithUTXO({ fromAddress, toAddress, amount, currency, convertTo, viaCurrency, privateKey }) {
    try {
      privateKey = privateKey || TEST_PRIVATE_KEY;
      
      console.log(`Building transaction from ${fromAddress} to ${toAddress}`);
      console.log(`Converting ${amount} ${currency} to ${convertTo}${viaCurrency ? ` via ${viaCurrency}` : ''}`);
      
      // Step 1: Get UTXOs
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
      
      // Create a properly configured transaction builder for Verus
      const txBuilder = new TransactionBuilder(networks.verustest);
      
      // Set the version for Verus (transactions use version 4)
      txBuilder.setVersion(4);
      
      // *** FIX: Add the version group ID through the proper API ***
      // For Zcash-based coins, use setVersionGroupId
      if (typeof txBuilder.setVersionGroupId === 'function') {
        // Use the correct versionGroupId for Verus
        txBuilder.setVersionGroupId(0x892f2085);
      }
      
      // Add the input
      txBuilder.addInput(selected.txid, selected.outputIndex || selected.vout);
      
      // Get currency IDs for conversion and via
      const convertToId = getCurrencyId(convertTo);
      console.log('Using currency ID for conversion:', convertToId);
      
      // Process via currency if specified
      let viaCurrencyId = null;
      if (viaCurrency) {
        viaCurrencyId = getCurrencyId(viaCurrency);
        console.log('Using via currency ID:', viaCurrencyId);
      }
      
      // Create conversion script
      console.log('Creating conversion script...');
      const scriptInfo = createCurrencyOutputScript(toAddress, convertToId, viaCurrencyId);
      console.log('Created conversion script');
      
      // *** FIX: Properly add output with the P2SH script ***
      txBuilder.addOutput(scriptInfo.p2shScript, Math.round(amount * SATS_PER_COIN));
      
      // Add change output if needed
      const change = selected.satoshis - Math.round((amount + fee) * SATS_PER_COIN);
      if (change > 0) {
        console.log('Adding change output:', change / SATS_PER_COIN);
        txBuilder.addOutput(fromAddress, change);
      }
      
      // *** FIX: Properly sign the transaction with the Zcash signature hash type ***
      const keyPair = ECPair.fromWIF(privateKey, networks.verustest);
      
      // For Zcash-based transactions, we need to use the correct hash type
      // SIGHASH_ALL | SIGHASH_FORKID (0x41) is typically used for Zcash-based coins
      const hashType = Transaction.SIGHASH_ALL | 0x40; // Add SIGHASH_FORKID
      
      txBuilder.sign(0, keyPair, null, Transaction.SIGHASH_ALL, selected.satoshis);
      
      // Build the transaction
      const tx = txBuilder.build();
      
      // Get transaction hex
      const txHex = tx.toHex();
      
      console.log('Transaction built and signed successfully');
      console.log('Transaction hex:', txHex.substring(0, 64) + '...');
      
      // Broadcast transaction
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
    TEST_PRIVATE_KEY,
    makeRPCCall
};
