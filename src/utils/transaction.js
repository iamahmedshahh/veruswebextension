import { makeRPCCall } from './verus-rpc';
import pkg from '@bitgo/utxo-lib';
import { Buffer } from 'buffer';
import { BN } from 'bn.js';
import 'core-js/stable';
import 'regenerator-runtime/runtime';

// Polyfill Buffer for browser compatibility
global.Buffer = Buffer;

const { ECPair, TransactionBuilder, address: Address, payments } = pkg;

// Network configuration for Verus Testnet
const NETWORK = pkg.networks.verustest;

// Constants
const SATS_PER_COIN = new BN('100000000', 10);
const DEFAULT_FEE = new BN('20000', 10); // 0.0002 VRSC fee
const DUST_THRESHOLD = new BN('546', 10);

/**
 * Convert VRSC amount to satoshis
 * @param {number|string} amount - Amount in VRSC
 * @returns {BN} Amount in satoshis
 */
function toSatoshis(amount) {
    return new BN(amount).mul(SATS_PER_COIN);
}

/**
 * Convert satoshis to VRSC amount
 * @param {BN|string} satoshis - Amount in satoshis
 * @returns {string} Amount in VRSC
 */
function fromSatoshis(satoshis) {
    const bn = new BN(satoshis);
    return bn.div(SATS_PER_COIN).toString();
}

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
 * @param {BN} targetAmount - Amount to send in satoshis
 * @param {number} feePerByte - Fee per byte in satoshis
 * @returns {Object} Selected UTXOs and change amount
 */
function selectCoins(utxos, targetAmount, feePerByte) {
    console.log('Selecting coins for amount:', targetAmount.toString());
    console.log('Available UTXOs:', utxos);

    // Sort UTXOs by value, descending
    const sortedUtxos = [...utxos].sort((a, b) => {
        const aValue = new BN(a.satoshis);
        const bValue = new BN(b.satoshis);
        return bValue.sub(aValue).toNumber();
    });
    
    console.log('Sorted UTXOs:', sortedUtxos);
    
    let selectedUtxos = [];
    let selectedAmount = new BN(0);
    
    // Estimate transaction size (simplified)
    const estimateSize = (inputCount, outputCount = 2) => {
        return inputCount * 180 + outputCount * 34 + 10;
    };
    
    // First try to find a single UTXO that covers the amount
    const singleUtxo = sortedUtxos.find(utxo => {
        const utxoValue = new BN(utxo.satoshis);
        const estimatedFee = new BN(estimateSize(1) * feePerByte);
        const total = targetAmount.add(estimatedFee);
        console.log('Checking UTXO:', {
            utxoValue: utxoValue.toString(),
            needed: total.toString(),
            sufficient: utxoValue.gte(total)
        });
        return utxoValue.gte(total);
    });
    
    if (singleUtxo) {
        console.log('Found single UTXO that covers amount');
        const estimatedFee = new BN(estimateSize(1) * feePerByte);
        const utxoValue = new BN(singleUtxo.satoshis);
        return {
            inputs: [singleUtxo],
            fee: estimatedFee,
            change: utxoValue.sub(targetAmount).sub(estimatedFee)
        };
    }
    
    console.log('No single UTXO found, trying multiple UTXOs');
    
    // If no single UTXO works, accumulate multiple UTXOs
    for (const utxo of sortedUtxos) {
        selectedUtxos.push(utxo);
        const utxoValue = new BN(utxo.satoshis);
        selectedAmount = selectedAmount.add(utxoValue);
        
        console.log('Added UTXO:', {
            value: utxoValue.toString(),
            totalSelected: selectedAmount.toString()
        });
        
        const estimatedFee = new BN(estimateSize(selectedUtxos.length) * feePerByte);
        const total = targetAmount.add(estimatedFee);
        
        console.log('Current status:', {
            selected: selectedAmount.toString(),
            needed: total.toString(),
            sufficient: selectedAmount.gte(total)
        });
        
        if (selectedAmount.gte(total)) {
            console.log('Found sufficient UTXOs');
            return {
                inputs: selectedUtxos,
                fee: estimatedFee,
                change: selectedAmount.sub(targetAmount).sub(estimatedFee)
            };
        }
    }
    
    console.log('Insufficient funds:', {
        available: selectedAmount.toString(),
        needed: targetAmount.toString()
    });
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

        // Convert amount to satoshis
        const amountSats = toSatoshis(amount);
        
        // Get UTXOs for the address
        const utxos = await makeRPCCall('getaddressutxos', [{
            addresses: [fromAddress]
        }]);
        
        console.log('Raw UTXOs received:', utxos);
        
        if (!utxos || utxos.length === 0) {
            throw new Error('No UTXOs available');
        }

        // Prepare UTXOs with correct format
        const preparedUtxos = utxos.map(utxo => ({
            txid: utxo.txid,
            outputIndex: utxo.outputIndex,
            value: utxo.satoshis,
            satoshis: utxo.satoshis,
            address: fromAddress
        }));

        console.log('Prepared UTXOs:', preparedUtxos);
        console.log('Target amount in satoshis:', amountSats.toString());
        
        // Select coins for transaction
        const feePerByte = 1; // 1 sat/byte
        const coinSelection = selectCoins(preparedUtxos, amountSats, feePerByte);
        
        if (!coinSelection.inputs || coinSelection.inputs.length === 0) {
            throw new Error('Could not select appropriate UTXOs for transaction');
        }

        // Create transaction builder
        const txBuilder = new TransactionBuilder(NETWORK);
        
        // Set version and version group ID for Verus
        txBuilder.setVersion(4);
        txBuilder.setVersionGroupId(0x892f2085);
        
        // Add inputs
        for (const input of coinSelection.inputs) {
            txBuilder.addInput(input.txid, input.outputIndex);
        }

        // Add recipient output
        txBuilder.addOutput(toAddress, amountSats.toNumber());

        // Add change output if needed
        if (coinSelection.change.gt(DUST_THRESHOLD)) {
            txBuilder.addOutput(fromAddress, coinSelection.change.toNumber());
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
                Number(input.satoshis)      // value as number
            );
        }

        // Build and broadcast
        const tx = txBuilder.build();
        const txHex = tx.toHex();
        
        // Send raw transaction
        const txid = await makeRPCCall('sendrawtransaction', [txHex]);
        
        return { 
            txid,
            fee: fromSatoshis(coinSelection.fee)
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
        const amountSats = toSatoshis(amount);
        
        // Get UTXOs
        const utxos = await makeRPCCall('getaddressutxos', [{
            addresses: [fromAddress]
        }]);
        
        console.log('Raw UTXOs received:', utxos);
        
        if (!utxos || utxos.length === 0) {
            return DEFAULT_FEE.toNumber() / SATS_PER_COIN.toNumber();
        }

        // Prepare UTXOs
        const preparedUtxos = utxos.map(utxo => ({
            txid: utxo.txid,
            outputIndex: utxo.outputIndex,
            value: utxo.satoshis,
            satoshis: utxo.satoshis,
            address: fromAddress
        }));

        console.log('Prepared UTXOs:', preparedUtxos);
        console.log('Target amount in satoshis:', amountSats.toString());
        
        // Estimate fee using coin selection
        try {
            const feePerByte = 1; // 1 sat/byte
            const coinSelection = selectCoins(preparedUtxos, amountSats, feePerByte);
            return fromSatoshis(coinSelection.fee);
        } catch (e) {
            return DEFAULT_FEE.toNumber() / SATS_PER_COIN.toNumber();
        }
    } catch (error) {
        console.error('Error estimating fee:', error);
        return DEFAULT_FEE.toNumber() / SATS_PER_COIN.toNumber();
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
