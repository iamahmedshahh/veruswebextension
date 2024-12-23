import { makeRPCCall } from './verus-rpc';
import pkg from '@bitgo/utxo-lib';
import { Buffer } from 'buffer';
import BigNumber from 'bignumber.js';

// Polyfill Buffer for browser compatibility
global.Buffer = Buffer;

const { ECPair, TransactionBuilder, address: Address, payments } = pkg;

// Network configuration for Verus Testnet

const NETWORK = {
    messagePrefix: '\x18Verus Signed Message:\n',
    bech32: 'vtbc',
    bip32: {
        public: 0x043587cf,
        private: 0x04358394
    },
    pubKeyHash: 0x6f,
    scriptHash: 0xc4,
    wif: 0xef,
    consensusBranchId: {
        1: 0x00,
        2: 0x00,
        3: 0x5ba81b19,
        4: 0x76b809bb
    },
    coin: 'verustest'
};

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
    const decoded = Address.fromBase58Check(addr);
    if (decoded.version === NETWORK.pubKeyHash) {
        return payments.p2pkh({ 
            hash: decoded.hash,
            network: NETWORK 
        }).output;
    } else if (decoded.version === NETWORK.scriptHash) {
        return payments.p2sh({ 
            hash: decoded.hash,
            network: NETWORK 
        }).output;
    }
    throw new Error('Unsupported address type');
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
    const sortedUtxos = [...utxos].sort((a, b) => b.value - a.value);
    
    let selectedUtxos = [];
    let selectedAmount = 0;
    
    // Estimate transaction size (simplified)
    const estimateSize = (inputCount, outputCount = 2) => {
        return inputCount * 180 + outputCount * 34 + 10;
    };
    
    // First try to find a single UTXO that covers the amount
    const singleUtxo = sortedUtxos.find(utxo => {
        const estimatedFee = estimateSize(1) * feePerByte;
        return utxo.value >= targetAmount + estimatedFee;
    });
    
    if (singleUtxo) {
        return {
            inputs: [singleUtxo],
            fee: estimateSize(1) * feePerByte,
            change: singleUtxo.value - targetAmount - (estimateSize(1) * feePerByte)
        };
    }
    
    // If no single UTXO works, accumulate multiple UTXOs
    for (const utxo of sortedUtxos) {
        selectedUtxos.push(utxo);
        selectedAmount += utxo.value;
        
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
        
        // Add inputs
        for (const input of coinSelection.inputs) {
            txBuilder.addInput(input.txid, input.vout);
        }

        // Add recipient output
        const recipientScript = addressToOutputScript(toAddress);
        txBuilder.addOutput(recipientScript, amountSats);

        // Add change output if needed
        if (coinSelection.change > DUST_THRESHOLD) {
            const changeScript = addressToOutputScript(fromAddress);
            txBuilder.addOutput(changeScript, coinSelection.change);
        }

        // Sign all inputs
        const keyPair = ECPair.fromWIF(privateKeyWIF, NETWORK);
        
        for (let i = 0; i < coinSelection.inputs.length; i++) {
            const input = coinSelection.inputs[i];
            txBuilder.sign({
                prevOutScriptType: 'p2pkh',
                vin: i,
                keyPair: keyPair,
                value: input.value,
                network: NETWORK
            });
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
