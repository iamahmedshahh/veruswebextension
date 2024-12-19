import { makeRPCCall } from './verus-rpc';
import pkg from '@bitgo/utxo-lib';
import { Buffer } from 'buffer';
import BigInteger from 'bigi' // Import BigInteger library

// Polyfill Buffer for browser compatibility
global.Buffer = Buffer;

// Network configuration for Verus
const NETWORK = pkg.networks.verustest;
const { ECPair, TransactionBuilder } = pkg;

// Constants
const SATS_PER_COIN = 100000000;
const DUST_THRESHOLD = 546;
const DEFAULT_FEE = 20000; // 0.0002 VRSC fee

/**
 * Send currency from one address to another
 * @param {string} fromAddress - Sender's address
 * @param {string} toAddress - Recipient's address
 * @param {number} amount - Amount to send (in VRSCTEST)
 * @param {string} privateKeyWIF - Sender's private key in WIF format
 * @param {string} currency - Currency to send (default: 'VRSCTEST')
 * @returns {Promise<{txid: string}>}
 */
export async function sendCurrency(fromAddress, toAddress, amount, privateKeyWIF, currency = 'VRSCTEST') {
    try {
        console.log('Starting sendCurrency with params:', { fromAddress, toAddress, amount, currency });
        
        // Test RPC connection first
        try {
            const testResponse = await makeRPCCall('getinfo', []);
            console.log('RPC connection test successful:', testResponse);
        } catch (error) {
            console.error('RPC connection test failed:', error);
            throw new Error('Failed to connect to Verus RPC server: ' + error.message);
        }
        
        // Validate private key format
        if (!privateKeyWIF) {
            throw new Error('Private key is required');
        }

        // Validate that the private key is in WIF format
        let keyPair;
        try {
            keyPair = ECPair.fromWIF(privateKeyWIF, NETWORK);
        } catch (error) {
            console.error('Invalid private key:', error);
            throw new Error('Invalid private key format. Must be in WIF format.');
        }

        // Convert amount to satoshis
        const SATS_PER_COIN = 1e8;
        const amountToSend = amount;
        const satoshiAmount = Math.floor(amountToSend * SATS_PER_COIN);
        console.log('Amount in satoshis:', satoshiAmount);
        
        // Step 1: Fetch UTXOs
        console.log('Fetching UTXOs for address:', fromAddress);
        const utxos = await makeRPCCall('getaddressutxos', [{
            addresses: [fromAddress],
            currencynames: true
        }]);
        
        if (!utxos || utxos.length === 0) {
            throw new Error('No UTXOs available');
        }

        console.log('Raw UTXOs:', JSON.stringify(utxos, null, 2));
        console.log('Found UTXOs:', utxos.length);

        // Filter UTXOs with VRSCTEST balance and normalize values
        const relevantUtxos = utxos.filter(utxo => utxo.satoshis > 0).map(utxo => {
            // The value we get is in VRSC, need to convert to satoshis
            const valueInVRSC = utxo.satoshis / SATS_PER_COIN;
            console.log(`Converting UTXO value: ${utxo.satoshis} (${valueInVRSC} VRSC) to satoshis`);
            return {
                ...utxo,
                originalValue: utxo.satoshis,
                satoshis: utxo.satoshis
            };
        });
        console.log('Relevant UTXOs:', JSON.stringify(relevantUtxos, null, 2));
        console.log('Relevant UTXOs for currency:', relevantUtxos.length);

        if (relevantUtxos.length === 0) {
            throw new Error(`No UTXOs available for ${currency}`);
        }

        // Build transaction
        console.log('Initializing transaction builder...');
        const txBuilder = new TransactionBuilder(NETWORK);
        
        // Set version for Overwinter support
        console.log('Setting transaction version and group ID...');
        txBuilder.setVersion(4);
        txBuilder.setVersionGroupId(0x892f2085);

        // Add all inputs
        let runningTotal = BigInt(0);  
        for (const utxo of relevantUtxos) {
            txBuilder.addInput(utxo.txid, utxo.outputIndex);
            runningTotal += BigInt(utxo.satoshis);  
            console.log('Running total:', Number(runningTotal) / SATS_PER_COIN, currency);
        }

        // Calculate output amounts
        const satoshisToSend = BigInt(Math.floor(amountToSend * SATS_PER_COIN));  
        const fee = BigInt(20000); 
        
        if (runningTotal < satoshisToSend + fee) {
            throw new Error(`Insufficient funds. Required: ${Number(satoshisToSend + fee) / SATS_PER_COIN} ${currency}, Available: ${Number(runningTotal) / SATS_PER_COIN} ${currency}`);
        }

        // Add recipient output
        txBuilder.addOutput(toAddress, Number(satoshisToSend));

        // Calculate and add change output
        const changeAmount = Number(runningTotal - satoshisToSend - fee);
        if (changeAmount > DUST_THRESHOLD) {
            txBuilder.addOutput(fromAddress, changeAmount);
            console.log('Change output added:', changeAmount / SATS_PER_COIN, currency);
        }

        // Sign each input with proper value conversion
        for (let i = 0; i < relevantUtxos.length; i++) {
            const utxo = relevantUtxos[i];
            console.log('Signing input', i, utxo);

            try {
                // Validate KeyPair
                if (!keyPair.publicKey) {
                    console.log('Manually deriving publicKey...');
                    keyPair.publicKey = keyPair.getPublicKeyBuffer();
                }
                console.log('KeyPair publicKey:', keyPair.publicKey.toString('hex'));

                // Generate previous output script
                const prevOutScript = pkg.address.toOutputScript(fromAddress, NETWORK);
                console.log('PrevOutScript (hex):', prevOutScript.toString('hex'));

                // Debug TransactionBuilder inputs
                const input = txBuilder.inputs[i];
                console.log('Input at index', i, input);

                // Ensure satoshis is a number
                const satoshis = Number(utxo.satoshis);
                console.log('Satoshis as number:', satoshis);

                txBuilder.sign(
                    i,
                    keyPair,
                    null,
                    pkg.Transaction.SIGHASH_ALL,
                    BigInteger(utxo.satoshis.toString()) // Convert satoshis to BigInteger
                );

                console.log('Successfully signed input', i);
            } catch (error) {
                console.error('Error signing input', i, error);
                throw error;
            }
        }
        
        

        // Build and serialize transaction
        console.log('Building transaction...');
        const tx = txBuilder.build();
        const serializedTx = tx.toHex();
        console.log('Transaction built and serialized');

        // Broadcast transaction
        console.log('Broadcasting transaction...');
        const txid = await makeRPCCall('sendrawtransaction', [serializedTx]);
        
        console.log('Transaction broadcast successful. TXID:', txid);
        return { txid };
    } catch (error) {
        console.error('Error in sendCurrency:', error);
        throw error;
    }
}

/**
 * Estimate transaction fee
 * @param {string} fromAddress - Sender's address
 * @param {number} amount - Amount to send
 * @param {string} currency - Currency to send
 * @returns {Promise<number>} Estimated fee in VRSCTEST
 */
export async function estimateFee(fromAddress, amount, currency = 'VRSCTEST') {
    try {
        const utxos = await makeRPCCall('getaddressutxos', [{
            addresses: [fromAddress],
            currencynames: true
        }]);
        
        const baseFee = 0.001;
        const inputCount = utxos.length;
        const outputCount = 2;
        
        const estimatedSize = (inputCount * 180) + (outputCount * 34) + 10;
        const feeRate = 1;
        const calculatedFee = (estimatedSize * feeRate) / 100000000;
        
        return Math.max(baseFee, calculatedFee);
    } catch (error) {
        console.error('Error estimating fee:', error);
        throw error;
    }
}

/**
 * Validate a Verus address
 * @param {string} address - Address to validate
 * @returns {boolean} Whether the address is valid
 */
export function validateAddress(address) {
    try {
        // Verus addresses start with 'R'
        if (!address.startsWith('R')) {
            return false;
        }

        // Try to decode the address
        pkg.address.fromBase58Check(address);
        return true;
    } catch (error) {
        console.error('Address validation error:', error);
        return false;
    }
}
