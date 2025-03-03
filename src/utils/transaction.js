import pkg from '@bitgo/utxo-lib';
import BN from 'bn.js';
import { makeRPCCall } from './verus-rpc';
import { EVALS } from 'verus-typescript-primitives';
import 'core-js/stable';
import 'regenerator-runtime/runtime';
import BigInteger from 'bigi';
import { store } from '../store/index.js';

// Polyfill Buffer for browser compatibility
global.Buffer = Buffer;

const { ECPair, Transaction, TransactionBuilder, networks } = pkg;

// Network configuration for Verus Testnet
const NETWORK = networks.verustest;

// Constants
const SATS_PER_COIN = 1e8;
const DEFAULT_FEE = 20000; // 0.0002 VRSC

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
 * Send currency from one address to another
 * @param {string|Object} fromAddressOrParams - Either sender's address or params object
 * @param {string} [toAddress] - Recipient's address
 * @param {number} [amount] - Amount to send
 * @param {string} [privateKey] - Private key in WIF format
 * @param {string} [currency='VRSCTEST'] - Currency symbol
 */
async function sendCurrency(fromAddressOrParams, toAddress, amount, privateKey, currency = 'VRSCTEST') {
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

    console.log('Starting sendCurrency with params:', {
        fromAddress: params.fromAddress,
        toAddress: params.toAddress,
        amount: params.amount,
        currency: params.currency
    });

    try {
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

        // Filter UTXOs with balance
        const relevantUtxos = utxos.filter(utxo => utxo.satoshis > 0);
        console.log('Found UTXOs:', relevantUtxos.length);

        if (relevantUtxos.length === 0) {
            throw new Error(`No UTXOs available for ${params.currency}`);
        }

        // Get current block height for locktime and expiry
        const currentHeight = await makeRPCCall('getblockcount', []);
        
        // Build transaction
        const txBuilder = new TransactionBuilder(NETWORK);
        txBuilder.setVersion(4);
        txBuilder.setVersionGroupId(0x892f2085);
        txBuilder.setExpiryHeight(currentHeight + 20); // Set expiry 20 blocks ahead
        txBuilder.setLockTime(currentHeight); // Set locktime to current height

        // Add all inputs
        let runningTotal = 0;
        for (const utxo of relevantUtxos) {
            txBuilder.addInput(utxo.txid, utxo.outputIndex);
            runningTotal += utxo.satoshis;
        }

        // Calculate fee
        const fee = await estimateFee(resolvedFromAddress, params.amount, params.currency);

        // Calculate total needed (amount + fee)
        const totalNeeded = amountSats + toSatoshis(fee);

        if (runningTotal < totalNeeded) {
            throw new Error(`Insufficient funds. Need ${fromSatoshis(totalNeeded)} ${params.currency}, but only have ${fromSatoshis(runningTotal)} ${params.currency}`);
        }

        // Add recipient output with BigInteger conversion
        txBuilder.addOutput(resolvedToAddress, amountSats);

        // Calculate and add change output
        const changeAmount = runningTotal - amountSats - toSatoshis(fee);
        if (changeAmount > 546) { // Dust threshold
            txBuilder.addOutput(resolvedFromAddress, changeAmount);
            console.log('Change output added:', changeAmount, params.currency);
        }

        // Sign each input
        const keyPair = ECPair.fromWIF(params.privateKey, NETWORK);
        for (let i = 0; i < relevantUtxos.length; i++) {
            txBuilder.sign(
                i,
                keyPair,
                null,
                null,
                relevantUtxos[i].satoshis
            );
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
            .filter(utxo => utxo.currency === currency)
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
            totalSats += utxo.satoshis;
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
    estimateFee,
    validateAddress,
    isVerusID,
    toSatoshis,
    fromSatoshis,
    resolveVerusId
};
