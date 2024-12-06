import { makeRPCCall } from './verus-rpc';
import * as bitgo from '@bitgo/utxo-lib';

// Network configuration for Verus
const NETWORK = {
    messagePrefix: '\x18Verus Signed Message:\n',
    bip32: {
        public: 0x0488B21E,   // Verus BIP32 pubkey version
        private: 0x0488ADE4   // Verus BIP32 private key version
    },
    pubKeyHash: 0x3C,     // Verus public key hash (address starts with R)
    scriptHash: 0x55,     // Verus script hash
    wif: 0xBC,           // Verus WIF format private key
    coin: 'VRSCTEST'
};

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
        
        // Validate private key format
        if (!privateKeyWIF) {
            throw new Error('Private key is required');
        }

        // Validate that the private key is in WIF format
        try {
            bitgo.ECPair.fromWIF(privateKeyWIF, NETWORK);
        } catch (error) {
            console.error('Invalid private key:', error);
            throw new Error('Invalid private key format. Must be in WIF format.');
        }

        // Convert amount to satoshis
        const satoshiAmount = Math.floor(amount * 1e8);
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

        // Filter UTXOs for the specified currency
        const relevantUtxos = utxos.filter(utxo => {
            if (currency === 'VRSCTEST') {
                return !utxo.currencynames || Object.keys(utxo.currencynames).length === 0;
            }
            // For other currencies, check currency names and values
            return (utxo.currencynames && utxo.currencynames[currency]) ||
                   (utxo.currencyvalues && utxo.currencyvalues[currency]);
        });

        console.log('Relevant UTXOs:', JSON.stringify(relevantUtxos, null, 2));
        console.log('Relevant UTXOs for currency:', relevantUtxos.length);

        if (relevantUtxos.length === 0) {
            throw new Error(`No UTXOs available for ${currency}`);
        }

        // Step 2: Create transaction builder
        const txBuilder = new bitgo.TransactionBuilder(NETWORK);
        
        // Step 3: Add inputs
        let totalInput = 0;
        relevantUtxos.forEach(utxo => {
            // Log each UTXO value
            console.log('Processing UTXO:', {
                txid: utxo.txid,
                vout: utxo.vout || utxo.outputIndex,
                value: utxo.satoshis || utxo.value || utxo.amount
            });
            
            txBuilder.addInput(utxo.txid, utxo.vout || utxo.outputIndex);
            
            // Convert value to number and ensure it's in satoshis
            let utxoValue = 0;
            if (typeof utxo.satoshis === 'number') {
                utxoValue = utxo.satoshis;
            } else if (typeof utxo.value === 'number') {
                utxoValue = utxo.value;
            } else if (typeof utxo.amount === 'number') {
                utxoValue = Math.floor(utxo.amount * 1e8);
            } else if (typeof utxo.satoshis === 'string') {
                utxoValue = parseInt(utxo.satoshis, 10);
            } else if (typeof utxo.value === 'string') {
                utxoValue = parseInt(utxo.value, 10);
            } else if (typeof utxo.amount === 'string') {
                utxoValue = Math.floor(parseFloat(utxo.amount) * 1e8);
            }
            
            if (isNaN(utxoValue) || utxoValue <= 0) {
                console.error('Invalid UTXO value:', utxo);
                throw new Error('Invalid UTXO value encountered');
            }
            
            totalInput += utxoValue;
            console.log('Running total:', totalInput / 1e8, currency);
        });

        console.log('Total input amount:', totalInput / 1e8, currency);

        // Step 4: Calculate fee and verify funds
        const fee = 10000; // 0.0001 VRSCTEST
        if (totalInput < satoshiAmount + fee) {
            throw new Error(`Insufficient funds. Required: ${((satoshiAmount + fee) / 1e8).toFixed(8)} ${currency}, Available: ${(totalInput / 1e8).toFixed(8)} ${currency}`);
        }

        // Step 5: Add outputs
        // Main payment output
        txBuilder.addOutput(toAddress, satoshiAmount);
        
        // Add change output if needed
        const change = totalInput - satoshiAmount - fee;
        if (change > 546) { // Only add change if it's more than dust amount
            txBuilder.addOutput(fromAddress, change);
        }

        console.log('Transaction outputs added. Change amount:', change / 1e8, currency);

        // Step 6: Sign all inputs using WIF private key
        const keyPair = bitgo.ECPair.fromWIF(privateKeyWIF, NETWORK);
        relevantUtxos.forEach((utxo, index) => {
            txBuilder.sign(index, keyPair, null, 0x01, Number(utxo.satoshis || utxo.value));
        });

        // Step 7: Build and serialize transaction
        const builtTx = txBuilder.build();
        const serializedTx = builtTx.toHex();

        console.log('Transaction built and serialized');

        // Step 8: Broadcast transaction
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
        
        // Basic fee calculation (can be enhanced based on network conditions)
        const baseFee = 0.0001; // 0.0001 VRSCTEST
        const inputCount = utxos.length;
        const outputCount = 2; // Assuming payment + change
        
        // Fee calculation based on transaction size
        const estimatedSize = (inputCount * 180) + (outputCount * 34) + 10;
        const feeRate = 1; // satoshis per byte
        const calculatedFee = (estimatedSize * feeRate) / 1e8;
        
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

        // Try to decode the base58 address
        bitgo.address.fromBase58Check(address);
        return true;
    } catch (error) {
        console.error('Address validation error:', error);
        return false;
    }
}
