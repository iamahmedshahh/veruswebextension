const pkg = require('@bitgo/utxo-lib');
const { ECPair, Transaction, networks } = pkg;
const bs58 = require('bs58');
const crypto = require('crypto');

// Network configuration for Verus testnet
const VERUS_NETWORK = networks.verustest;

// RPC Configuration
const RPC_SERVER = 'https://api.verustest.net';

// Hard-coded values for testing
const TEST_PRIVATE_KEY = '';
const TEST_FROM_ADDRESS = 'RV2sJNR3Vi5nJT5h7AsNah7gPKTQaJ8e2L';
const TEST_TO_ADDRESS = 'RV2sJNR3Vi5nJT5h7AsNah7gPKTQaJ8e2L';

// Currency ID mapping
const CURRENCY_IDS = {
  'VRSCTEST': 'iJhCezBExJHvtyH3fGhNnt2NhU4Ztkf2yq',
  'VRSC-KMD': 'iCkKJuJScy4Z6NSDK7Mt42ZAB2NzVdR4zP',
  'VETH': 'i5w5MuNik5NtLcYmNzcvaoixooEebB6MGV',
};

/**
 * Make an RPC call to the Verus daemon
 */
async function makeRPCCall(method, params = [], currency = 'VRSCTEST') {
  try {
    const rpcUrl = `${RPC_SERVER}/${currency.toLowerCase()}`;
    
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
    
    if (!response.ok) {
      const errorBody = await response.text();
      console.error('HTTP error:', response.status, errorBody);
      throw new Error(`HTTP error ${response.status}: ${errorBody}`);
    }
    
    let data;
    try {
      const responseText = await response.text();
      data = JSON.parse(responseText);
    } catch (parseError) {
      console.error('JSON parse error:', parseError);
      throw new Error(`Failed to parse JSON response: ${parseError.message}`);
    }
    
    if (data.error) {
      console.error('RPC error:', data.error);
      throw new Error(`RPC error: ${JSON.stringify(data.error)}`);
    }
    
    return data.result;
  } catch (error) {
    console.error('RPC call failed:', error);
    throw error;
  }
}

/**
 * Get available methods from the API
 */
async function getAvailableMethods() {
  try {
    console.log('Getting available RPC methods...');
    const methods = await makeRPCCall('help');
    console.log('Available methods:', methods);
    return methods;
  } catch (error) {
    console.log('Could not get help methods, trying alternative approach');
    return null;
  }
}

/**
 * Test basic connectivity and get blockchain info
 */
async function testConnectivity() {
  try {
    console.log('Testing connectivity...');
    const info = await makeRPCCall('getblockchaininfo');
    console.log('Blockchain info received:', {
      chain: info.chain,
      blocks: info.blocks,
      bestblockhash: info.bestblockhash?.substring(0, 20) + '...'
    });
    return info;
  } catch (error) {
    console.error('Connectivity test failed:', error);
    throw error;
  }
}

/**
 * Get currency information
 */
async function getCurrencyInfo(currencyId) {
  try {
    console.log(`Getting currency info for: ${currencyId}`);
    const currencyInfo = await makeRPCCall('getcurrency', [currencyId]);
    console.log('Currency info:', {
      name: currencyInfo.name,
      currencyid: currencyInfo.currencyid,
      systemid: currencyInfo.systemid
    });
    return currencyInfo;
  } catch (error) {
    console.error('Get currency info failed:', error);
    throw error;
  }
}
function getCurrencyID(symbol) {
  return CURRENCY_IDS[symbol] || symbol;
}
/**
 * Create a conversion transaction using sendtoaddress with conversion parameters
 */
async function createConversionTransaction(fromCurrency, toCurrency, fromAddress, toAddress, amount) {
  try {
    console.log(`Creating conversion from ${fromCurrency} to ${toCurrency}`);
    
    // First, let's try the standard sendtoaddress method
    const params = [
      fromAddress,
      [{
        address: toAddress,
        amount: parseFloat(amount),
        currency: getCurrencyID(fromCurrency)
      }],
      null,
      0,
      {
        convertto: getCurrencyID(toCurrency)
      }
    ];
    
    console.log('Attempting sendtoaddress with conversion params:', params);
    
    try {
      const result = await makeRPCCall('sendcurrency', params, fromCurrency);
      console.log('Conversion transaction successful:', result);
      return result;
    } catch (sendError) {
      console.log('sendtoaddress failed, trying alternative method:', sendError.message);
      
      // Try with simpler parameters
      const simpleParams = [toAddress, parseFloat(amount)];
      console.log('Trying simple sendtoaddress:', simpleParams);
      
      const simpleResult = await makeRPCCall('sendcurrency', simpleParams, fromCurrency);
      console.log('Simple transaction successful:', simpleResult);
      return simpleResult;
    }
  } catch (error) {
    console.error('Conversion transaction failed:', error);
    throw error;
  }
}

/**
 * Try to create a raw transaction for conversion
 */
async function createRawConversionTransaction(fromCurrency, toCurrency, toAddress, amount) {
  try {
    console.log('Creating raw conversion transaction...');
    
    // Create transaction inputs (empty for now, will be funded later)
    const txInputs = [];
    
    // Create transaction outputs with conversion
    const txOutputs = {};
    txOutputs[toAddress] = {
      amount: parseFloat(amount),
      currency: getCurrencyID(toCurrency)
    };
    
    console.log('Raw transaction params:', { inputs: txInputs, outputs: txOutputs });
    
    const rawTx = await makeRPCCall('createrawtransaction', [txInputs, txOutputs], fromCurrency);
    console.log('Raw transaction created:', rawTx.substring(0, 40) + '...');
    
    return rawTx;
  } catch (error) {
    console.error('Raw conversion transaction failed:', error);
    throw error;
  }
}

/**
 * Get address balance
 */
async function getAddressBalance(address, currency) {
  try {
    console.log(`Getting balance for address: ${address} in currency: ${currency}`);
    
    // Try different methods to get balance
    try {
      const balance = await makeRPCCall('getaddressbalance', [address], currency);
      console.log('Address balance:', balance);
      return balance;
    } catch (error) {
      console.log('getaddressbalance failed, trying listunspent...');
      
      const unspent = await makeRPCCall('listunspent', [0, 9999999, [address]], currency);
      console.log('Unspent outputs:', unspent.length);
      
      const totalBalance = unspent.reduce((sum, utxo) => sum + utxo.amount, 0);
      console.log('Total balance from unspent:', totalBalance);
      
      return { balance: totalBalance, unspent };
    }
  } catch (error) {
    console.error('Balance check failed:', error);
    throw error;
  }
}

/**
 * Main function to handle currency conversion
 */
async function handleConversion(formData) {
  try {
    console.log('Starting conversion process with data:', formData);
    
    const {
      fromCurrency,
      toCurrency,
      fromAddress,
      toAddress,
      amount
    } = formData;
    
    // Test connectivity first
    await testConnectivity();
    
    // Get available methods
    await getAvailableMethods();
    
    // Get currency information
    try {
      await getCurrencyInfo(getCurrencyID(fromCurrency));
      await getCurrencyInfo(getCurrencyID(toCurrency));
    } catch (error) {
      console.log('Currency info retrieval failed, continuing anyway...');
    }
    
    // Check balance
    try {
      await getAddressBalance(fromAddress, fromCurrency);
    } catch (error) {
      console.log('Balance check failed, continuing anyway...');
    }
    
    // Try conversion transaction
    const result = await createConversionTransaction(fromCurrency, toCurrency, fromAddress, toAddress, amount);
    
    return {
      status: 'success',
      txid: result,
      fromCurrency,
      toCurrency,
      amount,
      fromAddress,
      toAddress
    };
    
  } catch (error) {
    console.error('Conversion handling failed:', error);
    
    // Try raw transaction approach as fallback
    try {
      console.log('Attempting raw transaction fallback...');
      const rawTx = await createRawConversionTransaction(formData.fromCurrency, formData.toCurrency, formData.toAddress, formData.amount);
      
      return {
        status: 'raw_created',
        rawTransaction: rawTx,
        message: 'Raw transaction created, needs funding and signing'
      };
    } catch (rawError) {
      console.error('Raw transaction fallback also failed:', rawError);
      throw error;
    }
  }
}

/**
 * Test function with improved error handling
 */
async function testTransaction() {
  try {
    console.log('=== Starting Verus Conversion Test ===');
    
    const formData = {
      fromCurrency: 'VRSCTEST',
      toCurrency: 'VRSC-KMD',
      fromAddress: TEST_FROM_ADDRESS,
      toAddress: TEST_TO_ADDRESS,
      amount: '0.1' // Using smaller amount for testing
    };
    
    console.log('Test parameters:', formData);
    
    const result = await handleConversion(formData);
    console.log('=== Test Result ===');
    console.log(JSON.stringify(result, null, 2));
    
    if (result.status === 'success') {
      console.log(`✅ Conversion successful! TXID: ${result.txid}`);
    } else if (result.status === 'raw_created') {
      console.log(`⚠️ Raw transaction created: ${result.rawTransaction.substring(0, 40)}...`);
      console.log(`Next steps: Fund and sign the transaction`);
    }
    
  } catch (error) {
    console.error('=== Test Failed ===');
    console.error('Error details:', error.message);
    
    // Provide helpful debugging information
    if (error.message.includes('Method not found')) {
      console.log('\n🔍 Debugging Help:');
      console.log('- The RPC method is not available on this endpoint');
      console.log('- Try checking the Verus documentation for correct method names');
      console.log('- The API endpoint might not support all wallet functions');
      console.log('- Consider using a local Verus daemon instead of the public API');
    }
    
    if (error.message.includes('HTTP error')) {
      console.log('\n🔍 Network Issue:');
      console.log('- Check your internet connection');
      console.log('- The API endpoint might be down or rate-limiting requests');
      console.log('- Try again in a few moments');
    }
  }
}

// Export functions
module.exports = {
  handleConversion,
  testTransaction,
  getCurrencyInfo,
  getAddressBalance,
  testConnectivity
};

// Execute test when run directly
if (require.main === module) {
  console.log('Running Verus conversion test...');
  testTransaction()
    .then(() => console.log('\n=== Test Completed ==='))
    .catch(err => console.error('\n=== Test Failed with Error ===\n', err));
}