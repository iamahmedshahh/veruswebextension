import pkg from '@bitgo/utxo-lib';
import BN from 'bn.js';
import { makeRPCCall } from './verus-rpc';
import { EVALS } from 'verus-typescript-primitives';
import 'core-js/stable';
import 'regenerator-runtime/runtime';
import BigInteger from 'bigi';
import { store } from '../store/index.js';
import { NETWORKS } from '../config/networks';
import bs58 from 'bs58'; // Add bs58 import
import crypto from 'crypto'; // Import crypto module
import { Buffer } from 'buffer';
import { sha256 } from 'js-sha256';

// Polyfill Buffer for browser compatibility
global.Buffer = Buffer;

const { ECPair, Transaction, TransactionBuilder, networks } = pkg;

// Get network configuration based on current network state
function getNetworkConfig() {
    const currentNetwork = store.getters['network/currentNetwork'];
    return currentNetwork === 'TESTNET' ? networks.verustest : networks.verus;
}

// Constants
const SATS_PER_COIN = 1e8;
const DEFAULT_FEE = 20000; // 0.0002 VRSC/VRSCTEST
const DEFAULT_VIA_CURRENCY = 'SPORTS'; // Default intermediate currency for conversions
const DEFAULT_CONVERT_TO = 'SAILING'; // Default target currency for conversions

// Currency ID mapping
const CURRENCY_IDS = {
    'USD': 'iFawzbS99RqGs7J2TNxME1TmmayBGuRkA2',  // USD testnet currency ID
    'SPORTS': 'iK3jCnnhGxkiXMYn3fhXnEhPd9gT2KME6Q', // SPORTS currency ID
    'SAILING': 'iSAiLinGnEwcurrEncyiDhEre123456789' // SAILING currency ID (replace with actual ID)
};

/**
 * Convert amount from VRSC to satoshis
 * @param {number} amount - Amount in VRSC
 * @returns {number} Amount in satoshis
 */
function toSatoshis(amount) {
    return Math.floor(amount * SATS_PER_COIN);
}

/**
 * Convert amount from satoshis to VRSC
 * @param {number} satoshis - Amount in satoshis
 * @returns {number} Amount in VRSC
 */
function fromSatoshis(satoshis) {
    return satoshis / SATS_PER_COIN;
}

/**
 * Convert number to BigInteger
 * @param {number} value - Value to convert
 * @returns {BigInteger} BigInteger value
 */
function toBigInteger(value) {
    return BigInteger.fromBuffer(Buffer.from(value.toString(16).padStart(16, '0'), 'hex'));
}

/**
 * Check if an address is a Verus ID (i-address)
 * @param {string} address - Address to check
 * @returns {boolean} True if address is a Verus ID
 */
function isVerusID(address) {
    return address.startsWith('i');
}

/**
 * Resolve a Verus ID to its primary address
 * @param {string} verusId - Verus ID to resolve
 * @returns {Promise<string>} Resolved transparent address
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
        throw error;
    }
}

/**
 * Get currency value from UTXO
 * @param {Object} utxo - UTXO object
 * @param {string} currency - Currency symbol
 * @returns {number} Currency value in satoshis
 */
function getCurrencyValueFromUtxo(utxo, currency) {
    if (!currency || currency === store.getters['network/mainCoin']) {
        return utxo.satoshis || 0;
    }

    const currencyId = CURRENCY_IDS[currency];
    if (!currencyId) {
        console.log(`No currency ID found for ${currency}`);
        return 0;
    }

    if (utxo.currencyvalues && utxo.currencyvalues[currencyId]) {
        return toSatoshis(utxo.currencyvalues[currencyId]);
    }

    return 0;
}

/**
 * Create currency output script
 * @param {string} address - Recipient address
 * @param {string} currencyId - Currency ID
 * @returns {Object} Script information
 */
function createCurrencyOutputScript(address, currencyId) {
    try {
        // Decode the address using bs58
        const addressBytes = bs58.decode(address);
        // Remove version byte (1 byte) and checksum (4 bytes)
        const addressHash = Array.from(addressBytes.slice(1, -4));

        // Convert currencyId to bytes
        const currencyBytes = Array.from(Buffer.from(currencyId));
        
        // Create version and length prefix for currency
        const currencyHashBytes = [
            0x01, // Version
            currencyBytes.length // Length of currency ID
        ].concat(currencyBytes);

        // Calculate checksum (first 4 bytes of double SHA256)
        const firstHash = sha256(Buffer.from(currencyHashBytes));
        const secondHash = sha256(Buffer.from(firstHash));
        const checksum = Array.from(Buffer.from(secondHash).slice(0, 4));

        // Construct the full script
        const script = [
            0x1a, // OP_CONVERT
            0x04, // Number of elements
            0x03, // Version
            0x00, // Reserved
            0x01, // Number of currency outputs
            0x01, // Output index
            ...addressHash,
            0xcc, // Currency marker
            0x36, // Length of currency data
            0x04, // Version
            0x03, // Reserved
            0x09, // Type
            0x01, // Number of currency inputs
            0x01, // Input index
            ...addressHash,
            0x1b, // Currency definition
            0x01, // Version
            0x01, // Reserved
            ...currencyHashBytes
        ];

        return {
            currencyId,
            addressHash: addressHash.join(','),
            currencyHashBytes: currencyHashBytes.join(','),
            currencyChecksum: checksum.map(b => b.toString(16).padStart(2, '0')).join(''),
            fullScript: Buffer.from(script).toString('hex')
        };
    } catch (error) {
        console.error('Error creating currency output script:', error);
        return null;
    }
}

/**
 * Send currency from one address to another
 * @param {string|Object} fromAddressOrParams - Either sender's address or params object
 * @param {string} [toAddress] - Recipient's address
 * @param {number} [amount] - Amount to send
 * @param {string} [privateKey] - Private key in WIF format
 * @param {string} [currency] - Currency symbol (defaults to network's main coin)
 */
async function sendCurrency(fromAddressOrParams, toAddress, amount, privateKey, currency) {
    // Handle both parameter styles
    let params;
    if (typeof fromAddressOrParams === 'object') {
        params = fromAddressOrParams;
    } else {
        params = {
            fromAddress: fromAddressOrParams,
            toAddress,
            amount,
            privateKey,
            currency
        };
    }

    // If currency is not specified, use the network's main coin
    if (!params.currency) {
        params.currency = store.getters['network/mainCoin'];
    }

    const mainCoin = store.getters['network/mainCoin'];
    const isMainCoin = params.currency === mainCoin;

    console.log('Starting sendCurrency with params:', {
        fromAddress: params.fromAddress,
        toAddress: params.toAddress,
        amount: params.amount,
        currency: params.currency,
        isMainCoin
    });

    try {
        // Get current network configuration
        const NETWORK = getNetworkConfig();

        // Resolve addresses if they are Verus IDs
        let resolvedFromAddress = params.fromAddress;
        let resolvedToAddress = params.toAddress;

        if (isVerusID(params.fromAddress)) {
            resolvedFromAddress = await resolveVerusId(params.fromAddress);
            console.log('Resolved sender Verus ID:', params.fromAddress, 'to:', resolvedFromAddress);
        }

        if (isVerusID(params.toAddress)) {
            resolvedToAddress = await resolveVerusId(params.toAddress);
            console.log('Resolved recipient Verus ID:', params.toAddress, 'to:', resolvedToAddress);
        }

        // Convert amount to satoshis
        const amountSats = toSatoshis(params.amount);
        console.log('Amount in satoshis:', amountSats);

        // Get UTXOs for funding
        const utxos = await makeRPCCall('getaddressutxos', [{
            addresses: [resolvedFromAddress],
            currencynames: true
        }]);

        if (!utxos || utxos.length === 0) {
            throw new Error('No UTXOs available');
        }

        console.log('Available UTXOs:', utxos);

        // Get current block height for locktime and expiry
        const currentHeight = await makeRPCCall('getblockcount', []);
        
        // Build transaction
        const txBuilder = new TransactionBuilder(NETWORK);
        txBuilder.setVersion(4);
        txBuilder.setVersionGroupId(0x892f2085);
        txBuilder.setExpiryHeight(currentHeight + 20);
        txBuilder.setLockTime(currentHeight);

        // Calculate fee based on the main coin (VRSCTEST)
        const fee = await estimateFee(resolvedFromAddress, params.amount, mainCoin);
        const feeSats = toSatoshis(fee);

        // Filter and collect UTXOs based on currency
        const selectedUtxos = [];
        let currencyTotal = 0;
        let feeTotal = 0;

        // Helper function to determine if a UTXO matches a currency
        const isUtxoMatchingCurrency = (utxo, targetCurrency) => {
            const value = getCurrencyValueFromUtxo(utxo, targetCurrency);
            return value > 0;
        };

        // First, collect UTXOs for the currency being sent
        const currencyUtxos = utxos.filter(utxo => isUtxoMatchingCurrency(utxo, params.currency));
        
        console.log(`Found ${currencyUtxos.length} UTXOs for ${params.currency}`);

        for (const utxo of currencyUtxos) {
            if (currencyTotal < amountSats) {
                selectedUtxos.push(utxo);
                txBuilder.addInput(utxo.txid, utxo.outputIndex);
                currencyTotal += getCurrencyValueFromUtxo(utxo, params.currency);
            }
        }

        if (currencyTotal < amountSats) {
            throw new Error(`Insufficient ${params.currency} funds. Need ${fromSatoshis(amountSats)} ${params.currency}, but only have ${fromSatoshis(currencyTotal)} ${params.currency}`);
        }

        // If this isn't the main coin, we need additional UTXOs for the fee
        if (!isMainCoin) {
            const feeUtxos = utxos.filter(utxo => isUtxoMatchingCurrency(utxo, mainCoin));
            
            console.log(`Found ${feeUtxos.length} UTXOs for fees (${mainCoin})`);

            for (const utxo of feeUtxos) {
                if (feeTotal < feeSats) {
                    selectedUtxos.push(utxo);
                    txBuilder.addInput(utxo.txid, utxo.outputIndex);
                    feeTotal += getCurrencyValueFromUtxo(utxo, mainCoin);
                }
            }

            if (feeTotal < feeSats) {
                throw new Error(`Insufficient ${mainCoin} for fee. Need ${fromSatoshis(feeSats)} ${mainCoin}, but only have ${fromSatoshis(feeTotal)} ${mainCoin}`);
            }
        } else {
            // For main coin transactions, we need to ensure we have enough for both amount and fee
            if (currencyTotal < (amountSats + feeSats)) {
                throw new Error(`Insufficient ${mainCoin} funds. Need ${fromSatoshis(amountSats + feeSats)} ${mainCoin} (including fee), but only have ${fromSatoshis(currencyTotal)} ${mainCoin}`);
            }
            feeTotal = currencyTotal - amountSats;
        }

        // Add recipient output with appropriate script
        if (!isMainCoin) {
            try {
                // For non-main coins, we need to create a currency-specific output
                const currencyScript = createCurrencyOutputScript(resolvedToAddress, params.currency);
                if (!currencyScript) {
                    throw new Error(`Failed to create output script for ${params.currency}`);
                }
                console.log('Currency script created:', currencyScript);
                txBuilder.addOutput(currencyScript.fullScript, amountSats);
            } catch (error) {
                console.error('Error creating currency script:', error);
                throw error;
            }
        } else {
            // For main coin, use standard output
            txBuilder.addOutput(resolvedToAddress, amountSats);
        }

        // Add change outputs
        if (!isMainCoin) {
            // Add currency change output if needed
            const currencyChange = currencyTotal - amountSats;
            if (currencyChange > 546) { // Dust threshold
                try {
                    const changeScript = createCurrencyOutputScript(resolvedFromAddress, params.currency);
                    if (changeScript) {
                        console.log('Change script created:', changeScript);
                        txBuilder.addOutput(changeScript.fullScript, currencyChange);
                    }
                } catch (error) {
                    console.error('Error creating change script:', error);
                    throw error;
                }
            }

            // Add fee change output (always in main coin)
            const feeChange = feeTotal - feeSats;
            if (feeChange > 546) { // Dust threshold
                txBuilder.addOutput(resolvedFromAddress, feeChange);
            }
        } else {
            // For main coin, we only need one change output
            const change = currencyTotal - amountSats - feeSats;
            if (change > 546) { // Dust threshold
                txBuilder.addOutput(resolvedFromAddress, change);
            }
        }

        // Create key pair for signing
        const keyPair = ECPair.fromWIF(params.privateKey, NETWORK);

        // Sign each input with its corresponding amount and script
        for (let i = 0; i < selectedUtxos.length; i++) {
            const utxo = selectedUtxos[i];
            const value = getCurrencyValueFromUtxo(utxo, isMainCoin ? mainCoin : params.currency);
            
            try {
                // For non-main coins, we need to handle the script differently
                if (!isMainCoin && utxo.script) {
                    console.log('Signing with script:', utxo.script);
                    txBuilder.sign(
                        i,
                        keyPair,
                        Buffer.from(utxo.script, 'hex'),
                        Transaction.SIGHASH_ALL,
                        value
                    );
                } else {
                    txBuilder.sign(
                        i,
                        keyPair,
                        null,
                        Transaction.SIGHASH_ALL,
                        value
                    );
                }
            } catch (error) {
                console.error('Error signing input:', error, 'Input index:', i);
                throw error;
            }
        }

        // Build and broadcast
        const tx = txBuilder.build();
        const txHex = tx.toHex();
        console.log('Transaction built and serialized');

        // Broadcast transaction
        const txid = await makeRPCCall('sendrawtransaction', [txHex]);
        console.log('Transaction sent:', txid);

        // Store transaction in store
        const transactionData = {
            txid,
            type: 'sent',
            amount: params.amount,
            currency: params.currency,
            from: params.fromAddress, // Keep original i-address for display
            to: params.toAddress, // Keep original i-address for display
            resolvedFrom: resolvedFromAddress, // Store resolved addresses
            resolvedTo: resolvedToAddress,
            timestamp: new Date().toISOString(),
            status: 'confirmed',
            isFromVerusId: isVerusID(params.fromAddress),
            isToVerusId: isVerusID(params.toAddress)
        };
        
        store.dispatch('transactions/addTransaction', transactionData);
        console.log('Transaction stored:', transactionData);

        return { txid };
    } catch (error) {
        console.error('Error in sendCurrency:', error);
        throw error;
    }
}

/**
 * Send and convert currency from one type to another
 * @param {string|Object} fromAddressOrParams - Either sender's address or params object
 * @param {string} [toAddress] - Recipient's address
 * @param {number} [amount] - Amount to send
 * @param {string} [privateKey] - Private key in WIF format
 * @param {string} [currency] - Currency symbol (defaults to network's main coin)
 * @param {string} [via] - Intermediate currency for conversion
 * @param {string} [convertto] - Target currency to convert to
 */
async function sendConvertCurrency(fromAddressOrParams, toAddress, amount, privateKey, currency, via = DEFAULT_VIA_CURRENCY, convertto = DEFAULT_CONVERT_TO) {
    // Handle both parameter styles
    let params;
    if (typeof fromAddressOrParams === 'object') {
        params = {
            ...fromAddressOrParams,
            via: fromAddressOrParams.via || DEFAULT_VIA_CURRENCY,
            convertto: fromAddressOrParams.convertto || DEFAULT_CONVERT_TO
        };
    } else {
        params = {
            fromAddress: fromAddressOrParams,
            toAddress,
            amount,
            privateKey,
            currency,
            via,
            convertto
        };
    }

    try {
        console.log('Sending convert transaction with params:', {
            ...params,
            privateKey: params.privateKey ? '***' : undefined
        });

        // Validate parameters
        if (!params.fromAddress || !params.toAddress || !params.amount || !params.privateKey) {
            throw new Error('Missing required parameters');
        }

        if (!params.via || !params.convertto) {
            throw new Error('Missing conversion parameters (via or convertto)');
        }

        // Get network configuration
        const network = getNetworkConfig();

        // Create key pair from private key
        const keyPair = ECPair.fromWIF(params.privateKey, network);

        // Initialize transaction builder
        const txb = new TransactionBuilder(network);
        txb.setVersion(4); // Set version for conversion transactions

        // Get UTXOs for the from address
        const utxosResponse = await makeRPCCall('getaddressutxos', [{
            addresses: [params.fromAddress],
            currencynames: true
        }]);

        if (!Array.isArray(utxosResponse)) {
            throw new Error('Invalid UTXO response format');
        }

        if (utxosResponse.length === 0) {
            throw new Error('No UTXOs found for address');
        }

        // Filter and sort UTXOs by currency
        const relevantUtxos = utxosResponse
            .filter(utxo => {
                const value = getCurrencyValueFromUtxo(utxo, params.currency);
                console.log(`UTXO value for ${params.currency}:`, value);
                return value > 0;
            })
            .sort((a, b) => getCurrencyValueFromUtxo(b, params.currency) - getCurrencyValueFromUtxo(a, params.currency));

        if (relevantUtxos.length === 0) {
            throw new Error(`No UTXOs found with currency ${params.currency}`);
        }

        // Calculate total available balance
        const totalAvailable = relevantUtxos.reduce((sum, utxo) => sum + getCurrencyValueFromUtxo(utxo, params.currency), 0);

        if (totalAvailable < params.amount) {
            throw new Error(`Insufficient balance. Required: ${params.amount}, Available: ${totalAvailable}`);
        }

        // Add inputs to transaction
        let inputAmount = 0;
        for (const utxo of relevantUtxos) {
            if (!utxo.txid || typeof utxo.outputIndex === 'undefined') {
                console.error('Invalid UTXO format:', utxo);
                continue;
            }
            txb.addInput(utxo.txid, utxo.outputIndex);
            inputAmount += getCurrencyValueFromUtxo(utxo, params.currency);
            if (inputAmount >= params.amount) break;
        }

        if (inputAmount < params.amount) {
            throw new Error('Failed to gather enough inputs for transaction');
        }

        // Create conversion output script
        const scriptInfo = createCurrencyOutputScript(params.toAddress, params.convertto);
        if (!scriptInfo) {
            throw new Error('Failed to create conversion output script');
        }
        console.log('Created currency script:', scriptInfo);

        // Create the conversion script
        const script = Buffer.from(scriptInfo.fullScript, 'hex');
        
        // Add via and convertto parameters
        const viaScript = Buffer.concat([
            Buffer.from([0x1c]), // Conversion marker
            Buffer.from([params.via.length]), // Length of via currency
            Buffer.from(params.via, 'utf8'),  // Via currency name
            Buffer.from([params.convertto.length]), // Length of target currency
            Buffer.from(params.convertto, 'utf8')  // Target currency name
        ]);

        // Combine scripts
        const finalScript = Buffer.concat([script, viaScript]);

        // Add outputs
        txb.addOutput(finalScript, toSatoshis(params.amount));

        // Add change output if necessary
        const change = inputAmount - params.amount - DEFAULT_FEE;
        if (change > 0) {
            txb.addOutput(params.fromAddress, toSatoshis(change));
        }

        // Sign all inputs
        relevantUtxos.forEach((utxo, index) => {
            if (index < txb.__inputs.length) {
                txb.sign(index, keyPair);
            }
        });

        // Build and serialize transaction
        const tx = txb.build();
        const serializedTx = tx.toHex();

        console.log('Serialized transaction:', serializedTx);

        // Send raw transaction
        const txid = await makeRPCCall('sendrawtransaction', [serializedTx]);
        console.log('Convert transaction sent:', txid);

        return txid;
    } catch (error) {
        console.error('Error in sendConvertCurrency:', error);
        throw error;
    }
}

/**
 * Estimate transaction fee based on input and output count
 * @param {string} fromAddress - Sender's address
 * @param {number} amount - Amount to send
 * @param {string} currency - Currency to send
 * @returns {Promise<number>} Estimated fee in VRSC
 */
async function estimateFee(fromAddress, amount, currency = 'VRSCTEST') {
    try {
        // Get UTXOs for the address
        const utxos = await makeRPCCall('getaddressutxos', [{
            addresses: [fromAddress],
            currencynames: true
        }]);

        if (!utxos || utxos.length === 0) {
            console.log('No UTXOs found for fee estimation, using default fee');
            return 0.0001; // Default fee if no UTXOs
        }

        // Calculate size based on typical P2PKH transaction
        const inputSize = 148; // Typical P2PKH input size
        const outputSize = 34; // Typical P2PKH output size
        const baseSize = 10; // Base transaction size

        // Sort UTXOs by amount
        const sortedUtxos = utxos
            .filter(utxo => getCurrencyValueFromUtxo(utxo, currency) > 0)
            .sort((a, b) => b.satoshis - a.satoshis);

        if (sortedUtxos.length === 0) {
            console.log('No relevant UTXOs found for fee estimation, using default fee');
            return 0.0001;
        }

        // Calculate number of inputs needed
        let totalSats = 0;
        let inputCount = 0;
        const targetSats = toSatoshis(amount);

        for (const utxo of sortedUtxos) {
            totalSats += getCurrencyValueFromUtxo(utxo, currency);
            inputCount++;
            if (totalSats >= targetSats) {
                break;
            }
        }

        // We'll have 2 outputs: recipient and change
        const outputCount = 2;

        // Calculate total size
        const totalSize = baseSize + (inputSize * inputCount) + (outputSize * outputCount);

        // Fee rate (satoshis per byte)
        const feeRate = 100; // 100 sats/byte is a reasonable rate

        // Calculate fee in satoshis
        const feeSats = totalSize * feeRate;

        // Convert to VRSC (minimum 0.0001)
        return Math.max(fromSatoshis(feeSats), 0.0001);
    } catch (error) {
        console.error('Fee estimation error:', error);
        // Fallback to default fee if estimation fails
        return 0.0001;
    }
}

/**
 * Validate an address
 * @param {string} address - Address to validate
 * @returns {boolean} True if address is valid
 */
function validateAddress(address) {
    if (!address) return false;

    // Check for Verus ID
    if (isVerusID(address)) {
        return true; // We'll validate the identity when we try to use it
    }

    // Try to decode the address
    try {
        const decoded = pkg.address.fromBase58Check(address);
        return true;
    } catch (e) {
        return false;
    }
}

export {
    sendCurrency,
    sendConvertCurrency,
    estimateFee,
    validateAddress,
    resolveVerusId,
    isVerusID,
    toSatoshis,
    fromSatoshis,
    CURRENCY_IDS,
    DEFAULT_FEE,
    DEFAULT_VIA_CURRENCY,
    DEFAULT_CONVERT_TO
}
