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

// Currency ID mapping
const CURRENCY_IDS = {
    'USD': 'iFawzbS99RqGs7J2TNxME1TmmayBGuRkA2'  // USD testnet currency ID
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
 * @param {string} currency - Currency symbol
 * @returns {Buffer} Output script
 */
function createCurrencyOutputScript(address, currency) {
    if (!currency || currency === store.getters['network/mainCoin']) {
        return null; // Use default script for main coin
    }

    const currencyId = CURRENCY_IDS[currency];
    if (!currencyId) {
        throw new Error(`Unknown currency: ${currency}`);
    }

    try {
        // Looking at the working input script format:
        // 1a040300010114<address_hash>cc36040309010114<address_hash>1b01<currency_bytes>
        const addressHash = bs58.decode(address).slice(1, -4); // Remove version and checksum
        const currencyIdBytes = bs58.decode(currencyId.slice(1)); // Remove 'i' prefix

        const script = Buffer.concat([
            Buffer.from([0x1a, 0x04, 0x03, 0x00, 0x01, 0x01]), // Header
            Buffer.from([0x14]), // Address length (20 bytes)
            addressHash, // Address hash (20 bytes)
            Buffer.from([0xcc, 0x36, 0x04, 0x03, 0x09, 0x01]), // Separator and flags
            Buffer.from([0x01, 0x14]), // Length markers
            addressHash, // Address hash again
            Buffer.from([0x1b, 0x01]), // End marker and length
            currencyIdBytes // Currency ID bytes
        ]);

        console.log('Created currency script:', {
            currencyId,
            addressHash: addressHash.toString('hex'),
            currencyIdBytes: currencyIdBytes.toString('hex'),
            fullScript: script.toString('hex')
        });

        return script;
    } catch (error) {
        console.error('Error in createCurrencyOutputScript:', error);
        throw error;
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
                console.log('Currency script created:', currencyScript.toString('hex'));
                txBuilder.addOutput(currencyScript, amountSats);
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
                        console.log('Change script created:', changeScript.toString('hex'));
                        txBuilder.addOutput(changeScript, currencyChange);
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
    estimateFee,
    validateAddress,
    isVerusID,
    toSatoshis,
    fromSatoshis,
    resolveVerusId
};
