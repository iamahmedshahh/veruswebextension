import { makeRPCCall } from './verus-rpc';
import * as bitcoin from '@bitgo/utxo-lib';

// Network configuration for Verus
const NETWORK = bitcoin.networks.verustest;
const { ECPair, TransactionBuilder } = bitcoin;

// Import BN from the library
const BN = bitcoin.ECPair.BN;

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
        const SATS_PER_COIN = 100000000;
        
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

        // Filter UTXOs with VRSCTEST balance
        const relevantUtxos = utxos.filter(utxo => utxo.satoshis > 0);
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
        console.log('Adding inputs to transaction...');
        let runningTotal = new BN(0);
        for (const utxo of relevantUtxos) {
            const satoshis = new BN(utxo.satoshis);

            console.log('Adding input:', {
                txid: utxo.txid,
                outputIndex: utxo.outputIndex,
                satoshis: satoshis.toString()
            });
            txBuilder.addInput(utxo.txid, utxo.outputIndex);
            runningTotal = runningTotal.add(satoshis);
            console.log('Running total:', runningTotal.toNumber() / SATS_PER_COIN, currency);
        }

        // Calculate output amounts
        const satoshisToSend = new BN(Math.floor(amount * SATS_PER_COIN));
        const fee = new BN(20000); // 0.0002 VRSC fee
        
        if (runningTotal.lt(satoshisToSend.add(fee))) {
            throw new Error(`Insufficient funds. Required: ${satoshisToSend.add(fee).toNumber() / SATS_PER_COIN} ${currency}, Available: ${runningTotal.toNumber() / SATS_PER_COIN} ${currency}`);
        }

        // Add recipient output
        const recipientAmount = satoshisToSend.toNumber();
        console.log('Adding recipient output:', { toAddress, amount: recipientAmount });
        txBuilder.addOutput(toAddress, recipientAmount);

        // Calculate and add change output
        const changeAmount = runningTotal.sub(satoshisToSend).sub(fee).toNumber();
        if (changeAmount > 546) { // Dust threshold
            txBuilder.addOutput(fromAddress, changeAmount);
            console.log('Change output added:', changeAmount / SATS_PER_COIN, currency);
        }

        // Sign all inputs
        console.log('Starting to sign inputs...');
        for (let i = 0; i < relevantUtxos.length; i++) {
            const utxo = relevantUtxos[i];
            console.log('Signing input', i, {
                utxo: {
                    txid: utxo.txid,
                    outputIndex: utxo.outputIndex,
                    satoshis: utxo.satoshis
                }
            });

            try {
                // Create a hash type object
                const hashType = bitcoin.Transaction.SIGHASH_ALL;
                
                // Convert to BN
                const valueBN = new BN(utxo.satoshis);
                console.log('Using BN value for signing:', valueBN.toString());

                txBuilder.sign(
                    i,
                    keyPair,
                    null,
                    hashType,
                    valueBN.toNumber()
                );
                console.log('Successfully signed input', i);
            } catch (error) {
                console.error('Error signing input', i, error);
                console.error('Error details:', {
                    errorType: error.constructor.name,
                    message: error.message,
                    property: error.__property,
                    valueType: error.__value ? error.__value.constructor.name : null,
                    stack: error.stack
                });
                throw error;
            }
        }

        // Build and serialize the transaction
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
        bitcoin.address.fromBase58Check(address);
        return true;
    } catch (error) {
        console.error('Address validation error:', error);
        return false;
    }
}
