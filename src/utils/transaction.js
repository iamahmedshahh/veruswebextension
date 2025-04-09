import pkg from '@bitgo/utxo-lib';
import BN from 'bn.js';
import { makeRPCCall } from './verus-rpc';
import { EVALS } from 'verus-typescript-primitives';
import 'core-js/stable';
import 'regenerator-runtime/runtime';
import BigInteger from 'bigi';
import { store } from '../store/index.js';
import { NETWORKS } from '../config/networks';
import bs58 from 'bs58';
import crypto from 'crypto';
import { Buffer } from 'buffer';
import { sha256 } from 'js-sha256';

// Polyfill Buffer for browser compatibility
global.Buffer = Buffer;

const { ECPair, Transaction, TransactionBuilder, networks, script } = pkg;

// Define Verus-specific opcodes
const opcodes = {
    ...pkg.opcodes,
    // Verus-specific opcodes
    OP_CONVERT: 0xc0,
    OP_CURRENCY: 0xc1,
    OP_RESERVETOIDENTITY: 0xc2,
    OP_RESERVETOCURRENCY: 0xc3,
    OP_IDENTITYPRIMARY: 0xc4,
    OP_IDENTITYCOMMITMENT: 0xc5,
    OP_CROSSCHAIN: 0xc6,
    // Standard Bitcoin opcodes we need
    OP_RETURN: 0x6a,
    OP_DUP: 0x76,
    OP_EQUAL: 0x87,
    OP_EQUALVERIFY: 0x88,
    OP_HASH160: 0xa9,
    OP_CHECKSIG: 0xac,
    OP_CHECKMULTISIG: 0xae,
    OP_0: 0x00,
    OP_1: 0x51,
    OP_2: 0x52,
    OP_3: 0x53,
    OP_16: 0x60
};

// Script constants
const CURRENCY_SCRIPT_VERSION = 0x04;
const MIN_CURRENCY_ID_LENGTH = 20;
const MAX_CURRENCY_ID_LENGTH = 32;

// Currency Flags
const IS_GATEWAY_FLAG = 0x80;
const IS_TOKEN_FLAG = 0x20;
const IS_FRACTIONAL_FLAG = 0x01;
const IS_PBAAS_CHAIN = 0x100;

// Constants
const SATS_PER_COIN = 1e8;
const DEFAULT_FEE = 20000; // 0.0002 VRSC/VRSCTEST
const DEFAULT_VIA_CURRENCY = 'SPORTS';
const DEFAULT_CONVERT_TO = 'SAILING';
const DUST_THRESHOLD = 546;

// Get network configuration based on current network state
function getNetworkConfig() {
    try {
        const currentNetwork = store.getters['network/currentNetwork'];
        console.log('Current network from store:', currentNetwork);
        
        // Default to testnet when in doubt for testing
        if (!currentNetwork) {
            console.warn('Network not found in store, defaulting to testnet');
            return networks.verustest;
        }

        // Normalize network name
        const networkName = currentNetwork.toString().toUpperCase();
        console.log('Normalized network name:', networkName);
        
        // Map network name to configuration
        switch (networkName) {
            case 'TESTNET':
            case 'VERUSTEST':
                return networks.verustest;
            case 'MAINNET':
            case 'VERUS':
                return networks.verus;
            default:
                console.warn(`Unrecognized network: ${networkName}, defaulting to testnet`);
                return networks.verustest;
        }
    } catch (error) {
        console.error('Error in getNetworkConfig:', error);
        console.warn('Defaulting to testnet');
        return networks.verustest;
    }
}

// Currency ID mapping - now dynamic
const CURRENCY_IDS = {
    'USD': 'iFawzbS99RqGs7J2TNxME1TmmayBGuRkA2',
    'SPORTS': 'iK3jCnnhGxkiXMYn3fhXnEhPd9gT2KME6Q',
    'SAILING': 'iSAiLinGnEwcurrEncyiDhEre123456789'
};

async function getCurrencyId(currencySymbol) {
    try {
        console.log(`Getting currency ID for: ${currencySymbol}`);
        
        // First check if we have it in our mapping
        if (CURRENCY_IDS[currencySymbol]) {
            console.log(`Found ${currencySymbol} in cache:`, CURRENCY_IDS[currencySymbol]);
            return CURRENCY_IDS[currencySymbol];
        }

        // If not found in mapping, try to get it from the RPC
        console.log(`Making RPC call for currency: ${currencySymbol}`);
        const currencyInfo = await makeRPCCall('getcurrency', [currencySymbol]);
        console.log(`RPC response for ${currencySymbol}:`, currencyInfo);
        
        if (currencyInfo && currencyInfo.currencyid) {
            // Cache it for future use
            CURRENCY_IDS[currencySymbol] = currencyInfo.currencyid;
            console.log(`Cached currency ID for ${currencySymbol}:`, currencyInfo.currencyid);
            return currencyInfo.currencyid;
        }

        throw new Error(`Could not find currency ID for ${currencySymbol}`);
    } catch (error) {
        console.error('Error getting currency ID:', error);
        throw error;
    }
}

function toSatoshis(amount) {
    return Math.floor(amount * SATS_PER_COIN);
}

function fromSatoshis(satoshis) {
    return satoshis / SATS_PER_COIN;
}

function toBigInteger(value) {
    return BigInteger.fromBuffer(Buffer.from(value.toString(16).padStart(16, '0'), 'hex'));
}

function isVerusID(address) {
    return address.startsWith('i');
}

async function resolveVerusId(verusId) {
    try {
        console.log('Resolving Verus ID:', verusId);
        
        if (!verusId.startsWith('i')) {
            throw new Error('Not a valid Verus ID format - must start with "i"');
        }

        const response = await makeRPCCall('getidentity', [verusId]);
        console.log('Identity info:', JSON.stringify(response, null, 2));
        
        if (!response || !response.identity) {
            throw new Error(`Could not resolve Verus ID: ${verusId}`);
        }

        const identityInfo = response.identity;

        if (identityInfo.primaryaddresses && identityInfo.primaryaddresses.length > 0) {
            const primaryAddress = identityInfo.primaryaddresses[0];
            console.log('Found primary address:', primaryAddress);
            return primaryAddress;
        }

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

function getCurrencyValueFromUtxo(utxo, currency) {
    if (!currency || currency === store.getters['network/mainCoin']) {
        return utxo.satoshis || 0;
    }

    // For non-main coins, check currencyvalues
    if (utxo.currencyvalues) {
        // Try both the currency symbol and its ID
        for (const [id, value] of Object.entries(utxo.currencyvalues)) {
            if (id === currency || // Direct match with currency symbol
                id === CURRENCY_IDS[currency] || // Match with known currency ID
                (value && value.currencyname === currency)) { // Match with currency name in value
                console.log(`Found ${currency} value in UTXO:`, value);
                return toSatoshis(value);
            }
        }
    }

    console.log(`No ${currency} value found in UTXO:`, utxo);
    return 0;
}

function validateCurrencyScript(scriptBuffer) {
    try {
        if (!Buffer.isBuffer(scriptBuffer)) {
            throw new Error('Input must be a buffer');
        }

        // Log the script for debugging
        console.log('Validating script:', {
            hex: scriptBuffer.toString('hex'),
            length: scriptBuffer.length
        });

        // We expect at least:
        // 1 byte OP_CONVERT
        // 1 byte version
        // 1 byte flags
        // 1 byte num outputs
        // 1 byte output index
        // 20 bytes currency ID
        // 1 byte OP_DUP
        // 1 byte OP_HASH160
        // 20 bytes pubkey hash
        // 1 byte OP_EQUALVERIFY
        // 1 byte OP_CHECKSIG
        // Total: 49 bytes minimum
        if (scriptBuffer.length < 49) {
            throw new Error(`Script too short: ${scriptBuffer.length} bytes`);
        }

        let offset = 0;

        // Check OP_CONVERT
        if (scriptBuffer[offset++] !== opcodes.OP_CONVERT) {
            throw new Error(`Invalid OP_CONVERT byte: ${scriptBuffer[0]}`);
        }

        // Check version
        if (scriptBuffer[offset++] !== CURRENCY_SCRIPT_VERSION) {
            throw new Error(`Invalid version: ${scriptBuffer[1]}`);
        }

        // Check flags
        const flags = scriptBuffer[offset++];
        if ((flags & 0x03) !== 0x03) {
            throw new Error(`Invalid flags: ${flags}`);
        }

        // Check outputs
        if (scriptBuffer[offset++] !== 0x01) {
            throw new Error(`Invalid number of outputs: ${scriptBuffer[3]}`);
        }
        if (scriptBuffer[offset++] !== 0x01) {
            throw new Error(`Invalid output index: ${scriptBuffer[4]}`);
        }

        // Skip currency ID (20 bytes)
        offset += 20;

        // Check P2PKH part
        if (scriptBuffer[offset++] !== opcodes.OP_DUP) {
            throw new Error(`Missing OP_DUP at offset ${offset-1}`);
        }
        if (scriptBuffer[offset++] !== opcodes.OP_HASH160) {
            throw new Error(`Missing OP_HASH160 at offset ${offset-1}`);
        }

        // Skip pubkey hash (20 bytes)
        offset += 20;

        if (scriptBuffer[offset++] !== opcodes.OP_EQUALVERIFY) {
            throw new Error(`Missing OP_EQUALVERIFY at offset ${offset-1}`);
        }
        if (scriptBuffer[offset++] !== opcodes.OP_CHECKSIG) {
            throw new Error(`Missing OP_CHECKSIG at offset ${offset-1}`);
        }

        console.log('Script validation successful');
        return true;
    } catch (error) {
        console.error('Script validation error:', error);
        throw error;
    }
}

function createCurrencyOutputScript(address, currencyId, flags = 0) {
    try {
        // Validate address format
        if (!address || typeof address !== 'string') {
            throw new Error('Invalid address format');
        }

        // Validate currencyId format
        if (!currencyId || (typeof currencyId !== 'string')) {
            throw new Error('Invalid currency ID format');
        }

        // Decode and validate the base58 address
        let decoded;
        try {
            decoded = bs58.decode(address);
            if (decoded.length !== 25) { // Standard base58check length
                throw new Error('Invalid address length');
            }
        } catch (error) {
            throw new Error(`Invalid address encoding: ${error.message}`);
        }

        const hash160 = decoded.slice(1, 21); // Remove version byte and checksum

        // Set appropriate flags for currency output
        const scriptFlags = flags | 0x03; // Currency flag + non-gateway flag

        // Process currency ID with proper validation
        let currencyIdBuffer;
        if (currencyId.startsWith('i')) {
            try {
                const decodedId = bs58.decode(currencyId);
                currencyIdBuffer = decodedId.slice(1, 21); // Remove version byte
                if (currencyIdBuffer.length !== 20) {
                    throw new Error('Invalid Verus ID length');
                }
            } catch (error) {
                throw new Error(`Invalid Verus ID format: ${error.message}`);
            }
        } else {
            try {
                currencyIdBuffer = Buffer.from(currencyId, 'hex');
                if (currencyIdBuffer.length < MIN_CURRENCY_ID_LENGTH || 
                    currencyIdBuffer.length > MAX_CURRENCY_ID_LENGTH) {
                    throw new Error('Invalid currency ID length');
                }
            } catch (error) {
                throw new Error(`Invalid currency ID hex format: ${error.message}`);
            }
        }

        // Create the script elements with proper minimal data encoding
        const scriptElements = [
            Buffer.from([opcodes.OP_CONVERT]),
            Buffer.from([CURRENCY_SCRIPT_VERSION]), // Version
            Buffer.from([scriptFlags]), // Flags
            Buffer.from([0x01]), // Number of outputs
            Buffer.from([0x01]), // Output index
            currencyIdBuffer, // Currency ID
            Buffer.from([opcodes.OP_DUP]),
            Buffer.from([opcodes.OP_HASH160]),
            hash160, // Destination address hash
            Buffer.from([opcodes.OP_EQUALVERIFY]),
            Buffer.from([opcodes.OP_CHECKSIG])
        ];

        // Compile the script by concatenating all elements
        const scriptBuffer = Buffer.concat(scriptElements);

        // Create P2SH script
        const scriptHash = crypto.createHash('sha256').update(scriptBuffer).digest().slice(0, 20);
        const p2shScript = script.compile([
            opcodes.OP_HASH160,
            scriptHash,
            opcodes.OP_EQUAL
        ]);

        // Log the script details for debugging
        console.log('Script components:', {
            convert: scriptElements[0].toString('hex'),
            version: scriptElements[1].toString('hex'),
            flags: scriptElements[2].toString('hex'),
            numOutputs: scriptElements[3].toString('hex'),
            outputIndex: scriptElements[4].toString('hex'),
            currencyId: scriptElements[5].toString('hex'),
            fullScript: scriptBuffer.toString('hex')
        });

        return {
            scriptHex: scriptBuffer.toString('hex'),
            scriptBuffer,
            p2shScript,
            flags: scriptFlags
        };
    } catch (error) {
        console.error('Error creating currency script:', error);
        throw new Error(`Failed to create currency output script: ${error.message}`);
    }
}

async function lockUnspent(lock, utxos) {
    try {
        return await makeRPCCall('lockunspent', [
            lock,
            utxos.map(u => ({
                txid: u.txid,
                vout: u.outputIndex
            }))
        ]);
    } catch (error) {
        console.error('Error locking/unlocking UTXOs:', error);
        return false;
    }
}

async function verifyUtxo(utxo) {
    try {
        const txInfo = await makeRPCCall('getrawtransaction', [utxo.txid, 1]);
        if (!txInfo || !txInfo.vout || !txInfo.vout[utxo.outputIndex]) {
            throw new Error(`UTXO ${utxo.txid}:${utxo.outputIndex} not found`);
        }
        return txInfo.vout[utxo.outputIndex];
    } catch (error) {
        console.error('Error verifying UTXO:', error);
        throw error;
    }
}

async function sendCurrency(fromAddressOrParams, toAddress, amount, privateKey, currency) {
    let params;
    let selectedUtxos = [];
    const networkInfo = await makeRPCCall('getinfo', []);
    console.log('Network info:', networkInfo);
    
    // Log all available currencies
    const allCurrencies = await makeRPCCall('listcurrencies', []);
    console.log('Available currencies:', allCurrencies?.map(c => c.currencyname || c.name));
    
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
        // Get currency ID if not main coin
        let currencyId;
        if (!isMainCoin) {
            currencyId = await getCurrencyId(params.currency);
            console.log('Using currency ID:', currencyId, 'for currency:', params.currency);
        }

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

        const amountSats = toSatoshis(params.amount);
        console.log('Amount in satoshis:', amountSats);

        // Get fresh UTXO data
        const utxos = await makeRPCCall('getaddressutxos', [{
            addresses: [resolvedFromAddress],
            currencynames: true
        }]);

        if (!utxos || utxos.length === 0) {
            throw new Error('No UTXOs available');
        }

        console.log('Available UTXOs:', utxos);

        const currentHeight = await makeRPCCall('getblockcount', []);
        
        const txBuilder = new TransactionBuilder(NETWORK);
        txBuilder.setVersion(4);
        txBuilder.setVersionGroupId(0x892f2085);
        txBuilder.setExpiryHeight(currentHeight + 20);
        txBuilder.setLockTime(currentHeight);

        const fee = await estimateFee(resolvedFromAddress, params.amount, mainCoin);
        const feeSats = toSatoshis(fee);

        let currencyTotal = 0;
        let feeTotal = 0;

        const isUtxoMatchingCurrency = (utxo, targetCurrency) => {
            console.log(`Checking UTXO for ${targetCurrency}:`, {
                txid: utxo.txid?.substring(0, 10) + '...',
                outputIndex: utxo.outputIndex,
                satoshis: utxo.satoshis,
                currencyvalues: utxo.currencyvalues
            });
            
            // For main coin (VRSC/VRSCTEST), use the satoshis field
            if (!targetCurrency || targetCurrency === store.getters['network/mainCoin']) {
                console.log(`${targetCurrency} is main coin, value:`, utxo.satoshis);
                return utxo.satoshis > 0;
            }
            
            // For other currencies, check in currencyvalues
            if (utxo.currencyvalues) {
                console.log('Currency values in UTXO:', utxo.currencyvalues);
                
                // Check all possible ways the currency could be referenced
                for (const [id, value] of Object.entries(utxo.currencyvalues)) {
                    console.log(`Comparing ${id} with ${targetCurrency}`);
                    
                    // Direct match with currency symbol
                    if (id === targetCurrency) {
                        console.log(`Direct match found for ${targetCurrency}, value:`, value);
                        return true;
                    }
                    
                    // Match with known currency ID
                    if (CURRENCY_IDS[targetCurrency] && id === CURRENCY_IDS[targetCurrency]) {
                        console.log(`ID match found for ${targetCurrency}, value:`, value);
                        return true;
                    }
                    
                    // Match with currency name in value object
                    if (value && typeof value === 'object' && value.currencyname === targetCurrency) {
                        console.log(`Name match found for ${targetCurrency} in value object:`, value);
                        return true;
                    }
                }
            }
            
            console.log(`No ${targetCurrency} value found in UTXO`);
            return false;
        };
        // Select UTXOs for the currency being sent
        const currencyUtxos = utxos.filter(utxo => isUtxoMatchingCurrency(utxo, params.currency));
        
        console.log(`Found ${currencyUtxos.length} UTXOs for ${params.currency}`);

        for (const utxo of currencyUtxos) {
            if (currencyTotal < amountSats) {
                // Verify UTXO is still unspent
                await verifyUtxo(utxo);
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
                    // Verify UTXO is still unspent
                    await verifyUtxo(utxo);
                    selectedUtxos.push(utxo);
                    txBuilder.addInput(utxo.txid, utxo.outputIndex);
                    feeTotal += getCurrencyValueFromUtxo(utxo, mainCoin);
                }
            }

            if (feeTotal < feeSats) {
                throw new Error(`Insufficient ${mainCoin} for fee. Need ${fromSatoshis(feeSats)} ${mainCoin}, but only have ${fromSatoshis(feeTotal)} ${mainCoin}`);
            }
        } else {
            if (currencyTotal < (amountSats + feeSats)) {
                throw new Error(`Insufficient ${mainCoin} funds. Need ${fromSatoshis(amountSats + feeSats)} ${mainCoin} (including fee), but only have ${fromSatoshis(currencyTotal)} ${mainCoin}`);
            }
            feeTotal = currencyTotal - amountSats;
        }

        // Add recipient output with appropriate script
        if (!isMainCoin) {
            try {
                const currencyScript = createCurrencyOutputScript(resolvedToAddress, currencyId);
                if (!currencyScript) {
                    throw new Error(`Failed to create output script for ${params.currency}`);
                }
                console.log('Currency script created:', currencyScript);
                
                // Add the output using the P2SH script
                txBuilder.addOutput(currencyScript.p2shScript, amountSats);
                
                // Add change output if needed
                const currencyChange = currencyTotal - amountSats;
                if (currencyChange > DUST_THRESHOLD) {
                    const changeScript = createCurrencyOutputScript(resolvedFromAddress, currencyId);
                    if (changeScript) {
                        console.log('Change script created:', changeScript);
                        txBuilder.addOutput(changeScript.p2shScript, currencyChange);
                    }
                }
            } catch (error) {
                console.error('Error creating currency outputs:', error);
                throw error;
            }
        } else {
            // For main coin, use standard output
            txBuilder.addOutput(resolvedToAddress, amountSats);
            
            // Add change
            const change = currencyTotal - amountSats - feeSats;
            if (change > DUST_THRESHOLD) {
                txBuilder.addOutput(resolvedFromAddress, change);
            }
        }

        const keyPair = ECPair.fromWIF(params.privateKey, NETWORK);

        // Sign all inputs
        for (let i = 0; i < selectedUtxos.length; i++) {
            const utxo = selectedUtxos[i];
            const value = getCurrencyValueFromUtxo(utxo, isMainCoin ? mainCoin : params.currency);
            
            try {
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

        const tx = txBuilder.build();
        const txHex = tx.toHex();
        console.log('Transaction built and serialized');

        // Debugging info
        console.log('Transaction details:', {
            inputs: txBuilder.inputs,
            outputs: tx.outs,
            hex: txHex
        });

        try {
            const txid = await makeRPCCall('sendrawtransaction', [txHex]);
            console.log('Transaction sent:', txid);

            const transactionData = {
                txid,
                type: 'sent',
                amount: params.amount,
                currency: params.currency,
                from: params.fromAddress,
                to: params.toAddress,
                resolvedFrom: resolvedFromAddress,
                resolvedTo: resolvedToAddress,
                timestamp: new Date().toISOString(),
                status: 'pending',
                isFromVerusId: isVerusID(params.fromAddress),
                isToVerusId: isVerusID(params.toAddress)
            };
            
            store.dispatch('transactions/addTransaction', transactionData);
            console.log('Transaction stored:', transactionData);

            return { txid };
        } catch (error) {
            console.error('RPC sendrawtransaction error:', error);
            throw new Error(`Failed to broadcast transaction: ${error.message}`);
        }
    } catch (error) {
        console.error('Error in sendCurrency:', error);
        throw error;
    }
}

async function sendConvertCurrency(fromAddressOrParams, toAddress, amount, privateKey, currency, via = DEFAULT_VIA_CURRENCY, convertto = DEFAULT_CONVERT_TO) {
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

        if (!params.fromAddress || !params.toAddress || !params.amount || !params.privateKey) {
            throw new Error('Missing required parameters');
        }

        if (!params.via || !params.convertto) {
            throw new Error('Missing conversion parameters (via or convertto)');
        }

        const network = getNetworkConfig();

        const keyPair = ECPair.fromWIF(params.privateKey, network);

        const txb = new TransactionBuilder(network);
        txb.setVersion(4);

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

        const relevantUtxos = utxosResponse
            .filter(utxo => {
                const value = getCurrencyValueFromUtxo(utxo, params.currency);
                console.log(`UTXO value for ${params.currency}:`, value);
                return value > 0;
            })
            .sort((a, b) => b.satoshis - a.satoshis);

        if (relevantUtxos.length === 0) {
            throw new Error(`No UTXOs found with currency ${params.currency}`);
        }

        const totalAvailable = relevantUtxos.reduce((sum, utxo) => sum + getCurrencyValueFromUtxo(utxo, params.currency), 0);

        if (totalAvailable < params.amount) {
            throw new Error(`Insufficient balance. Required: ${params.amount}, Available: ${totalAvailable}`);
        }

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

        const scriptInfo = createCurrencyOutputScript(params.toAddress, params.convertto);
        if (!scriptInfo) {
            throw new Error('Failed to create conversion output script');
        }
        console.log('Currency script created:', scriptInfo);

        const script = Buffer.concat([
            scriptInfo.scriptBuffer,
            Buffer.concat([
                Buffer.from([0x1c]),
                Buffer.from([params.via.length]),
                Buffer.from(params.via, 'utf8'),
                Buffer.from([params.convertto.length]),
                Buffer.from(params.convertto, 'utf8')
            ])
        ]);

        txb.addOutput(script, toSatoshis(params.amount));

        const change = inputAmount - params.amount - DEFAULT_FEE;
        if (change > 0) {
            txb.addOutput(params.fromAddress, toSatoshis(change));
        }

        relevantUtxos.forEach((utxo, index) => {
            if (index < txb.__inputs.length) {
                txb.sign(index, keyPair);
            }
        });

        const tx = txb.build();
        const serializedTx = tx.toHex();

        console.log('Serialized transaction:', serializedTx);

        const txid = await makeRPCCall('sendrawtransaction', [serializedTx]);
        console.log('Convert transaction sent:', txid);

        return txid;
    } catch (error) {
        console.error('Error in sendConvertCurrency:', error);
        throw error;
    }
}

async function estimateFee(fromAddress, amount, currency = 'VRSCTEST') {
    try {
        const utxos = await makeRPCCall('getaddressutxos', [{
            addresses: [fromAddress],
            currencynames: true
        }]);

        if (!utxos || utxos.length === 0) {
            console.log('No UTXOs found for fee estimation, using default fee');
            return 0.0001;
        }

        const inputSize = 148;
        const outputSize = 34;
        const baseSize = 10;

        const sortedUtxos = utxos
            .filter(utxo => getCurrencyValueFromUtxo(utxo, currency) > 0)
            .sort((a, b) => b.satoshis - a.satoshis);

        if (sortedUtxos.length === 0) {
            console.log('No relevant UTXOs found for fee estimation, using default fee');
            return 0.0001;
        }

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

        const outputCount = 2;

        const totalSize = baseSize + (inputSize * inputCount) + (outputSize * outputCount);

        const feeRate = 100;

        const feeSats = totalSize * feeRate;

        return Math.max(fromSatoshis(feeSats), 0.0001);
    } catch (error) {
        console.error('Fee estimation error:', error);
        return 0.0001;
    }
}

function validateAddress(address) {
    if (!address) return false;

    if (isVerusID(address)) {
        return true;
    }

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
    DEFAULT_CONVERT_TO,
    IS_GATEWAY_FLAG,
    IS_TOKEN_FLAG,
    IS_FRACTIONAL_FLAG,
    IS_PBAAS_CHAIN
};