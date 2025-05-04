const pkg = require('@bitgo/utxo-lib');
const { ECPair, Transaction, networks } = pkg;
const bs58 = require('bs58');
const crypto = require('crypto');

// Network configuration for Verus testnet
const VERUS_NETWORK = networks.verustest;

// RPC Configuration
const RPC_SERVER = 'https://api.verustest.net';

// Hard-coded values for testing
const TEST_PRIVATE_KEY = 'your_actual_private_key_wif_format'; // Replace with your actual private key in WIF format
const TEST_FROM_ADDRESS = 'your_actual_verustest_address'; // Replace with your actual testnet address
const TEST_TO_ADDRESS = 'recipient_verustest_address'; // Replace with recipient's address

// Currency ID mapping
const CURRENCY_IDS = {
  'VRSCTEST': 'iJhCezBExJHvtyH3fGhNnt2NhU4Ztkf2yq',
  'VRSC-KMD': 'iCkKJuJScy4Z6NSDK7Mt42ZAB2NzVdR4zP',
};

/**
 * Make an RPC call to the Verus daemon
 * @param {string} method - RPC method to call
 * @param {Array} params - RPC parameters
 * @param {string} currency - Optional currency for currency-specific calls
 * @returns {Promise<any>} RPC result
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
 * Get private key from wallet
 * @param {Object} params - Parameters containing currency and password
 * @returns {Promise<string>} Private key
 */
async function getPrivateKey(params) {
  const { currency, password } = params;
  
  if (!currency || !password) {
    throw new Error('Currency and password are required to get private key');
  }
  
  // For CLI testing, just return the hardcoded test private key
  return TEST_PRIVATE_KEY;
}

/**
 * Format address for Verus
 * @param {string} address - Address to format
 * @returns {Object} Formatted address
 */
function formatDestination(address) {
  return { address };
}

/**
 * Get currency ID from symbol
 * @param {string} currencySymbol - Currency symbol
 * @returns {string} Currency ID
 */
function getCurrencyID(currencySymbol) {
  return CURRENCY_IDS[currencySymbol] || currencySymbol;
}

/**
 * Preflight send function to check and prepare transaction
 * @param {Object} sendParams - Parameters for the transaction
 * @returns {Promise<Object>} Preflight result
 */
async function preflightSend(sendParams) {
  try {
    const {
      fromCurrency,
      toCurrency,
      fromAddress,
      toAddress,
      amount,
      memo = '',
      privateKey,
      viaCurrency = null
    } = sendParams;
    
    // Validate params
    if (!fromCurrency || !toAddress || !amount || !fromAddress) {
      throw new Error('Missing required parameters for preflight');
    }
    
    // Prepare RPC parameters for preflight
    const params = {
      currency: getCurrencyID(fromCurrency),
      amount: parseFloat(amount),
      from: [fromAddress],
      to: formatDestination(toAddress)
    };
    
    // Add conversion destination if different currency
    if (toCurrency && toCurrency !== fromCurrency) {
      params.convertto = getCurrencyID(toCurrency);
      
      // Add via currency if specified
      if (viaCurrency) {
        params.via = getCurrencyID(viaCurrency);
      }
    }
    
    // Add optional memo
    if (memo) {
      params.memo = memo;
    }
    
    console.log('Preflight params:', JSON.stringify(params));
    
    // Call the preflight RPC
    const preflightResult = await makeRPCCall('preflightsend', [params], fromCurrency);
    
    // Return the preflight result for confirmation
    return {
      ...preflightResult,
      fromCurrency,
      toCurrency,
      fromAddress,
      toAddress,
      amount,
      memo,
      viaCurrency
    };
  } catch (error) {
    console.error('Preflight send failed:', error);
    throw error;
  }
}

/**
 * Sign and broadcast transaction 
 * @param {Object} txParams - Transaction parameters from preflight
 * @param {string} privateKey - Private key for signing
 * @returns {Promise<Object>} Transaction result
 */
async function sendTransaction(txParams, privateKey) {
  try {
    const {
      fromCurrency,
      fromAddress,
      toAddress,
      amount,
      memo = '',
      hex,
      txid
    } = txParams;
    
    // If we have a hex from preflight, we can sign it
    if (hex) {
      // Create keyPair from privateKey
      const keyPair = ECPair.fromWIF(privateKey, VERUS_NETWORK);
      
      // Sign the transaction
      // Note: This is a simplified version - in a real implementation,
      // you would parse the hex, sign inputs, and serialize it back
      
      // For demo purposes, we'll just broadcast the hex directly
      // In a real implementation, you would sign the transaction first
      
      // Send signed transaction
      const sendParams = {
        currency: getCurrencyID(fromCurrency),
        hex: hex,  // In real implementation, this would be the signed hex
        // Other parameters from the preflight
      };
      
      const result = await makeRPCCall('sendcurrency', [sendParams], fromCurrency);
      
      return {
        success: true,
        txid: result.txid || result,
        ...result
      };
    } else {
      throw new Error('No transaction hex found in preflight result');
    }
  } catch (error) {
    console.error('Send transaction failed:', error);
    throw error;
  }
}

/**
 * Main function to handle the send flow
 * @param {Object} formData - Form data from user input
 * @returns {Promise<Object>} Transaction result
 */
async function handleSend(formData) {
  try {
    console.log('Starting transaction process with data:', formData);
    
    const {
      fromCurrency,
      toCurrency,
      fromAddress,
      toAddress,
      amount,
      memo,
      password,
      viaCurrency
    } = formData;
    
    // Get private key for signing
    const privateKey = await getPrivateKey({
      currency: fromCurrency,
      password: password
    });
    
    // Step 1: Preflight the transaction (returnTx = true)
    console.log('Step 1: Performing preflight...');
    const preflightResult = await preflightSend({
      fromCurrency,
      toCurrency,
      fromAddress,
      toAddress,
      amount,
      memo,
      privateKey,
      viaCurrency
    });
    
    console.log('Preflight successful:', preflightResult);
    
    // Return preflight result for confirmation UI
    return {
      status: 'preflight',
      txConfirmation: preflightResult
    };
  } catch (error) {
    console.error('Transaction handling failed:', error);
    throw error;
  }
}

/**
 * Confirm and execute transaction after preflight
 * @param {Object} txConfirmation - Preflight result
 * @param {string} password - Password for getting private key
 * @returns {Promise<Object>} Transaction result
 */
async function confirmTransaction(txConfirmation, password) {
  try {
    console.log('Confirming transaction...');
    
    // Get private key for signing
    const privateKey = await getPrivateKey({
      currency: txConfirmation.fromCurrency,
      password: password
    });
    
    // Send the transaction
    console.log('Sending transaction...');
    const result = await sendTransaction(txConfirmation, privateKey);
    
    console.log('Transaction sent successfully:', result);
    
    return {
      status: 'success',
      txid: result.txid,
      ...result
    };
  } catch (error) {
    console.error('Transaction confirmation failed:', error);
    throw error;
  }
}

// Example usage
async function testTransaction() {
  try {
    // Use hardcoded values for CLI testing
    const formData = {
      fromCurrency: 'VRSCTEST',
      toCurrency: 'VETH',  // For conversion
      fromAddress: TEST_FROM_ADDRESS,
      toAddress: TEST_TO_ADDRESS,
      amount: '1.0',
      memo: 'Test transaction',
      password: 'password',  // Password is still needed but can be any value
      viaCurrency: 'BRIDGE.VETH'  // For bridge conversions
    };
    
    // Step 1: Preflight
    const preflightResult = await handleSend(formData);
    console.log('Preflight result:', preflightResult);
    
    // In a real application, you would show confirmation UI here
    // and wait for user confirmation
    
    // Step 2: Confirm and send (after user confirms)
    if (preflightResult.status === 'preflight') {
      const txResult = await confirmTransaction(
        preflightResult.txConfirmation, 
        formData.password
      );
      
      console.log('Transaction result:', txResult);
    }
  } catch (error) {
    console.error('Test transaction failed:', error);
  }
}

// Export functions for use in extension
module.exports = {
  handleSend,
  confirmTransaction,
  preflightSend,
  testTransaction
};
