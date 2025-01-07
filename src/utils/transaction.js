import pkg from '@bitgo/utxo-lib';
import BN from 'bn.js';
import { makeRPCCall } from './verus-rpc';
import { EVALS } from 'verus-typescript-primitives';
import 'core-js/stable';
import 'regenerator-runtime/runtime';
import BigInteger from 'bigi';

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
 * Send currency from one address to another
 * @param {string|Object} fromAddressOrParams - Either sender's address or params object
 * @param {string} [toAddress] - Recipient's address
 * @param {number} [amount] - Amount to send
 * @param {string} [privateKeyWIF] - Private key in WIF format
 * @param {string} [currency='VRSCTEST'] - Currency symbol
 */
async function sendCurrency(fromAddressOrParams, toAddress, amount, privateKeyWIF, currency = 'VRSCTEST') {
    // Handle both parameter styles
    let params;
    if (typeof fromAddressOrParams === 'object') {
        params = fromAddressOrParams;
    } else {
        params = {
            fromAddress: fromAddressOrParams,
            toAddress,
            amount,
            privateKeyWIF,
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
        // Convert amount to satoshis
        const amountSats = toSatoshis(params.amount);
        console.log('Amount in satoshis:', amountSats);

        // Get UTXOs for funding
        const utxos = await makeRPCCall('getaddressutxos', [{
            addresses: [params.fromAddress],
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

        // Calculate output amounts with dynamic fee based on input/output count
        const fee = DEFAULT_FEE;
        
        if (runningTotal < amountSats + fee) {
            throw new Error(`Insufficient funds. Required: ${fromSatoshis(amountSats + fee)} ${params.currency}, Available: ${fromSatoshis(runningTotal)} ${params.currency}`);
        }

        // Add recipient output with BigInteger conversion
        txBuilder.addOutput(params.toAddress, toBigInteger(amountSats));

        // Calculate and add change output
        const changeAmount = runningTotal - amountSats - fee;
        if (changeAmount > 546) { // Dust threshold
            txBuilder.addOutput(params.fromAddress, toBigInteger(changeAmount));
            console.log('Change output added:', fromSatoshis(changeAmount), params.currency);
        }

        // Sign each input
        const keyPair = ECPair.fromWIF(params.privateKeyWIF, NETWORK);
        for (let i = 0; i < relevantUtxos.length; i++) {
            txBuilder.sign(
                i,
                keyPair,
                null,
                Transaction.SIGHASH_ALL,
                toBigInteger(relevantUtxos[i].satoshis)
            );
        }

        // Build and broadcast
        const tx = txBuilder.build();
        const txHex = tx.toHex();
        console.log('Transaction built and serialized');

        // Broadcast transaction
        const txid = await makeRPCCall('sendrawtransaction', [txHex]);
        console.log('Transaction sent:', txid);
        return { txid };
    } catch (error) {
        console.error('Error in sendCurrency:', error);
        throw error;
    }
}

/**
 * Estimate transaction fee
 * @param {string} fromAddress - Sender's address
 * @param {string} toAddress - Recipient's address
 * @param {number} amount - Amount to send
 * @param {string} currency - Currency to send
 * @returns {Promise<number>} Estimated fee in VRSC
 */
async function estimateFee(fromAddress, toAddress, amount, currency = 'VRSCTEST') {
    try {
        // Get UTXOs
        const utxos = await makeRPCCall('getaddressutxos', [{
            addresses: [fromAddress],
            currencynames: true
        }]);
        
        if (!utxos || utxos.length === 0) {
            return fromSatoshis(DEFAULT_FEE);
        }

        // Filter UTXOs with balance
        const relevantUtxos = utxos.filter(utxo => utxo.satoshis > 0);
        
        if (relevantUtxos.length === 0) {
            return fromSatoshis(DEFAULT_FEE);
        }

        // Create a dummy transaction to estimate size
        const txBuilder = new TransactionBuilder(NETWORK);
        txBuilder.setVersion(4);
        txBuilder.setVersionGroupId(0x892f2085);

        // Add inputs based on actual UTXOs
        for (const utxo of relevantUtxos) {
            txBuilder.addInput(utxo.txid, utxo.outputIndex);
        }

        // Add recipient output
        const amountSats = toSatoshis(amount);
        txBuilder.addOutput(toAddress, toBigInteger(amountSats));

        // Add change output
        txBuilder.addOutput(fromAddress, toBigInteger(1000)); // Dummy change amount

        // Estimate fee based on transaction size
        const dummyKeyPair = ECPair.makeRandom({ network: NETWORK });
        for (let i = 0; i < relevantUtxos.length; i++) {
            txBuilder.sign(i, dummyKeyPair, null, Transaction.SIGHASH_ALL, toBigInteger(relevantUtxos[i].satoshis));
        }

        const tx = txBuilder.build();
        const estimatedSize = tx.virtualSize();
        const feePerByte = 1; // 1 sat/byte
        const estimatedFee = estimatedSize * feePerByte;

        return fromSatoshis(estimatedFee + DEFAULT_FEE); // Add default fee as buffer
    } catch (error) {
        console.error('Error estimating fee:', error);
        return fromSatoshis(DEFAULT_FEE);
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
    fromSatoshis
};
