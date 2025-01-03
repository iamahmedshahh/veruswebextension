import { makeRPCCall } from './verus-rpc';
import pkg from '@bitgo/utxo-lib';
import { Buffer } from 'buffer';
import 'core-js/stable';
import 'regenerator-runtime/runtime';

// Polyfill Buffer for browser compatibility
global.Buffer = Buffer;

const { ECPair, TransactionBuilder, address: Address, payments } = pkg;

// Network configuration for Verus Testnet
const NETWORK = pkg.networks.verustest;  // Use the default network config without modifications

// Constants
const SATS_PER_COIN = 100000000;
const DEFAULT_FEE = 20000; // 0.0002 VRSC fee
const DUST_THRESHOLD = 546;

/**
 * Convert address to output script
 * @param {string} addr - The address to convert
 * @returns {Buffer} The output script
 */
function addressToOutputScript(addr) {
    try {
        console.log('Decoding address:', addr);
        // Instead of using payments API, we'll directly add the address as output
        // The TransactionBuilder will handle the script creation internally
        return addr;
    } catch (e) {
        console.error('Error processing address:', addr, e);
        throw e;
    }
}

/**
 * Select optimal UTXOs for a transaction
 * @param {Array} utxos - Available UTXOs
 * @param {number} targetAmount - Amount to send in satoshis
 * @param {number} feePerByte - Fee per byte in satoshis
 * @returns {Object} Selected UTXOs and change amount
 */
function selectCoins(utxos, targetAmount, feePerByte) {
    // Sort UTXOs by value, descending
    const sortedUtxos = [...utxos].sort((a, b) => Number(b.value) - Number(a.value));
    
    let selectedUtxos = [];
    let selectedAmount = 0;
    
    // Estimate transaction size (simplified)
    const estimateSize = (inputCount, outputCount = 2) => {
        return inputCount * 180 + outputCount * 34 + 10;
    };
    
    // First try to find a single UTXO that covers the amount
    const singleUtxo = sortedUtxos.find(utxo => {
        const estimatedFee = estimateSize(1) * feePerByte;
        return Number(utxo.value) >= targetAmount + estimatedFee;
    });
    
    if (singleUtxo) {
        return {
            inputs: [singleUtxo],
            fee: estimateSize(1) * feePerByte,
            change: Number(singleUtxo.value) - targetAmount - (estimateSize(1) * feePerByte)
        };
    }
    
    // If no single UTXO works, accumulate multiple UTXOs
    for (const utxo of sortedUtxos) {
        selectedUtxos.push(utxo);
        selectedAmount += Number(utxo.value);
        
        const estimatedFee = estimateSize(selectedUtxos.length) * feePerByte;
        if (selectedAmount >= targetAmount + estimatedFee) {
            return {
                inputs: selectedUtxos,
                fee: estimatedFee,
                change: selectedAmount - targetAmount - estimatedFee
            };
        }
    }
    
    throw new Error('Insufficient funds for transaction');
}

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
        
        // Validate inputs
        if (!privateKeyWIF) throw new Error('Private key is required');
        if (!toAddress) throw new Error('Recipient address is required');
        if (!amount || amount <= 0) throw new Error('Invalid amount');

        // Get UTXOs for the address
        const utxos = await makeRPCCall('getaddressutxos', [{
            addresses: [fromAddress]
        }]);
        
        if (!utxos || utxos.length === 0) {
            throw new Error('No UTXOs available');
        }

        // Convert amount to satoshis
        const amountSats = Math.floor(amount * SATS_PER_COIN);
        
        // Prepare UTXOs with correct format
        const preparedUtxos = utxos.map(utxo => ({
            txid: utxo.txid,
            vout: utxo.outputIndex,
            value: utxo.satoshis,
            address: fromAddress
        }));

        // Select coins for transaction
        const feePerByte = 1; // 1 sat/byte
        const coinSelection = selectCoins(preparedUtxos, amountSats, feePerByte);
        
        if (!coinSelection.inputs || coinSelection.inputs.length === 0) {
            throw new Error('Could not select appropriate UTXOs for transaction');
        }

        // Create transaction builder
        const txBuilder = new TransactionBuilder(NETWORK);
        txBuilder.setVersion(4);
        txBuilder.setVersionGroupId(0x892f2085); // Overwinter version group ID
        
        // Add inputs
        for (const input of coinSelection.inputs) {
            txBuilder.addInput(input.txid, input.vout);
        }

        // Add recipient output
        txBuilder.addOutput(toAddress, amountSats);

        // Add change output if needed
        if (coinSelection.change > DUST_THRESHOLD) {
            txBuilder.addOutput(fromAddress, coinSelection.change);
        }

        // Sign all inputs
        const keyPair = ECPair.fromWIF(privateKeyWIF, NETWORK);
        
        for (let i = 0; i < coinSelection.inputs.length; i++) {
            const input = coinSelection.inputs[i];
            txBuilder.sign(
                i,                          // vin
                keyPair,                    // keyPair
                null,                       // redeemScript (not needed for P2PKH)
                0x01,                       // hashType
                Number(input.value)         // value as number, not BigInteger
            );
        }

        // Build and broadcast
        const tx = txBuilder.build();
        const txHex = tx.toHex();
        
        // Send raw transaction
        const txid = await makeRPCCall('sendrawtransaction', [txHex]);
        
        return { 
            txid,
            fee: coinSelection.fee / SATS_PER_COIN
        };
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
 * @returns {Promise<number>} Estimated fee in satoshis
 */
export async function estimateFee(fromAddress, toAddress, amount, currency = 'VRSCTEST') {
    try {
        const amountSats = Math.floor(amount * SATS_PER_COIN);
        
        // Get UTXOs
        const utxos = await makeRPCCall('getaddressutxos', [{
            addresses: [fromAddress]
        }]);
        
        if (!utxos || utxos.length === 0) {
            return DEFAULT_FEE / SATS_PER_COIN;
        }

        // Prepare UTXOs
        const preparedUtxos = utxos.map(utxo => ({
            txid: utxo.txid,
            vout: utxo.outputIndex,
            value: utxo.satoshis,
            address: fromAddress
        }));

        // Estimate fee using coin selection
        try {
            const feePerByte = 1; // 1 sat/byte
            const coinSelection = selectCoins(preparedUtxos, amountSats, feePerByte);
            return coinSelection.fee / SATS_PER_COIN;
        } catch (e) {
            return DEFAULT_FEE / SATS_PER_COIN;
        }
    } catch (error) {
        console.error('Error estimating fee:', error);
        return DEFAULT_FEE / SATS_PER_COIN;
    }
}

/**
 * Validate a Verus address
 * @param {string} address - Address to validate
 * @returns {Promise<boolean>} Whether the address is valid
 */
export async function validateAddress(address) {
    try {
        // Basic validation
        if (!address || !address.startsWith('R')) {
            return false;
        }

        // Try to decode the address
        try {
            pkg.address.fromBase58Check(address);
            return true;
        } catch (e) {
            return false;
        }
    } catch (error) {
        console.error('Error validating address:', error);
        throw error;
    }
}
