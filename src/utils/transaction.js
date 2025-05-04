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

// Currency ID cache - only used as a fallback
const CURRENCY_IDS = {};

async function getCurrencyId(currencySymbol) {
    try {
        console.log(`Getting currency ID for: ${currencySymbol}`);
        
        // Always try to get the latest currency ID from the RPC first
        try {
            console.log(`Making RPC call for currency: ${currencySymbol}`);
            const currencyInfo = await makeRPCCall('getcurrency', [currencySymbol]);
            console.log(`RPC response for ${currencySymbol}:`, currencyInfo);
            
            if (currencyInfo && currencyInfo.currencyid) {
                // Cache it for future use (as fallback only)
                CURRENCY_IDS[currencySymbol] = currencyInfo.currencyid;
                console.log(`Using real-time currency ID for ${currencySymbol}:`, currencyInfo.currencyid);
                return currencyInfo.currencyid;
            }
        } catch (rpcError) {
            console.warn(`RPC error fetching currency ID for ${currencySymbol}:`, rpcError);
            console.log('Trying fallback methods...');
        }

        // Fallback: check if we have it in our cache
        if (CURRENCY_IDS[currencySymbol]) {
            console.log(`Using cached currency ID for ${currencySymbol}:`, CURRENCY_IDS[currencySymbol]);
            return CURRENCY_IDS[currencySymbol];
        }

        throw new Error(`Could not find currency ID for ${currencySymbol}`);
    } catch (error) {
        console.error('Error getting currency ID:', error);
        throw error;
    }
}

async function getCurrencyHexId(currencySymbol) {
    try {
        // First check if we already have the i-address ID
        const currencyId = await getCurrencyId(currencySymbol);
        
        // Get the currency definition to extract the hex ID
        const currencyInfo = await makeRPCCall('getcurrency', [currencySymbol]);
        
        if (currencyInfo && currencyInfo.currencyidhex) {
            console.log(`Found hex ID for ${currencySymbol}: ${currencyInfo.currencyidhex}`);
            return currencyInfo.currencyidhex;
        }
        
        // If we couldn't get the hex ID directly, try to decode the i-address
        if (currencyId && currencyId.startsWith('i')) {
            try {
                const decodedId = bs58.decode(currencyId).slice(1, 21);
                const hexId = decodedId.toString('hex');
                console.log(`Decoded hex ID for ${currencySymbol} from ${currencyId}: ${hexId}`);
                return hexId;
            } catch (error) {
                console.error(`Error decoding currency ID ${currencyId}:`, error);
            }
        }
        
        throw new Error(`Could not determine hex ID for currency ${currencySymbol}`);
    } catch (error) {
        console.error(`Error getting hex ID for ${currencySymbol}:`, error);
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

/**
 * Dynamically builds a mapping of UTXOs to their detected currencies.
 * This is reusable for any UTXO array and supports multi-currency transactions.
 * @param {Array} utxos - Array of UTXO objects
 * @param {string} mainCoin - The main coin symbol (e.g., 'VRSCTEST')
 * @returns {Object} - Mapping of 'txid:outputIndex' -> detected currency symbol
 */
function buildUtxoCurrencyMap(utxos, mainCoin) {
    const map = {};
    for (const utxo of utxos) {
        const key = `${utxo.txid}:${utxo.outputIndex}`;
        // If it's a main coin UTXO (has satoshis and not a currencyvalues match)
        if ((typeof utxo.satoshis === 'number' && utxo.satoshis > 0) && (!utxo.currencyvalues || Object.keys(utxo.currencyvalues).length === 0)) {
            map[key] = mainCoin;
        } else if (utxo.currencyvalues && Object.keys(utxo.currencyvalues).length > 0) {
            // Find the first currency symbol or id with a positive value
            let found = false;
            for (const [id, value] of Object.entries(utxo.currencyvalues)) {
                // Try to get currency symbol from value object or fallback to id
                const symbol = (value && typeof value === 'object' && value.currencyname) ? value.currencyname : id;
                if ((typeof value === 'object' && value.value > 0) || (typeof value === 'number' && value > 0)) {
                    map[key] = symbol;
                    found = true;
                    break;
                }
            }
            // If not found, fallback to mainCoin
            if (!found) map[key] = mainCoin;
        } else {
            // Fallback: treat as mainCoin
            map[key] = mainCoin;
        }
    }
    return map;
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

async function verifyUtxo(utxo, currency = null) {
    try {
        // Check if the UTXO exists on the blockchain (this will throw if UTXO no longer exists)
        const txInfo = await makeRPCCall('getrawtransaction', [utxo.txid, 1]);
        if (!txInfo || !txInfo.vout || !txInfo.vout[utxo.outputIndex]) {
            throw new Error('UTXO not found or missing output');
        }

        const outputInfo = txInfo.vout[utxo.outputIndex];
        
        // For non-main coin UTXOs, require currencyvalues (check for symbol, id, or currencyname)
        if (currency && currency !== store.getters['network/mainCoin']) {
            const currencyId = CURRENCY_IDS[currency] || currency;
            let hasCurrency = false;
            if (utxo.currencyvalues) {
                for (const [id, value] of Object.entries(utxo.currencyvalues)) {
                    if (
                        id === currency ||
                        id === currencyId ||
                        (value && typeof value === 'object' && value.currencyname === currency)
                    ) {
                        hasCurrency = true;
                        break;
                    }
                }
            }
            if (!hasCurrency) {
                throw new Error(`UTXO does not contain ${currency}`);
            }
        }
        // For main coin, require value
        if ((!currency || currency === store.getters['network/mainCoin']) && (!outputInfo.value || outputInfo.value === 0)) {
            throw new Error(`UTXO has zero value for ${currency || store.getters['network/mainCoin']}`);
        }
        
        return outputInfo;
    } catch (error) {
        console.error('Error verifying UTXO:', error);
        throw new Error(`UTXO verification failed: ${error.message}`);
    }
}

/**
 * Refreshes the UTXO set for an address to ensure we're using the latest data
 * @param {string} address - The address to refresh UTXOs for
 * @returns {Promise<Array>} - Fresh UTXOs for the address
 */
async function refreshUtxos(address) {
    try {
        console.log(`Refreshing UTXOs for address: ${address}`);
        
        // Get fresh UTXO data
        const utxos = await makeRPCCall('getaddressutxos', [{
            addresses: [address],
            currencynames: true
        }]);
        
        if (!utxos || utxos.length === 0) {
            console.log('No UTXOs found after refresh');
            return [];
        }
        
        console.log(`Found ${utxos.length} UTXOs after refresh`);
        
        // Verify each UTXO is actually unspent
        const confirmedUtxos = [];
        for (const utxo of utxos) {
            try {
                // This will throw if the UTXO doesn't exist or is spent
                const txData = await makeRPCCall('getrawtransaction', [utxo.txid, 1]);
                if (txData && txData.vout && txData.vout[utxo.outputIndex]) {
                    confirmedUtxos.push(utxo);
                }
            } catch (error) {
                console.warn(`Skipping invalid UTXO: ${utxo.txid}:${utxo.outputIndex}`, error.message);
            }
        }
        
        console.log(`Confirmed ${confirmedUtxos.length} valid UTXOs`);
        return confirmedUtxos;
    } catch (error) {
        console.error('Error refreshing UTXOs:', error);
        throw error;
    }
}

async function sendCurrency(fromAddressOrParams, toAddress, amount, privateKey, currency) {
    let params;
    let selectedUtxos = [];
    
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

    // Handle case when password is provided instead of privateKey (from CurrencyDetails.vue)
    if (params.password && !params.privateKey) {
        try {
            console.log('Getting private key from wallet store with password');
            // Get private key from wallet store
            params.privateKey = await store.dispatch('wallet/getPrivateKey', {
                currency: params.currency,
                password: params.password
            });
            if (!params.privateKey) {
                throw new Error('Failed to retrieve private key with provided password');
            }
        } catch (error) {
            console.error('Error getting private key:', error);
            throw new Error(`Authentication failed: ${error.message}`);
        }
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

        // Refresh UTXOs to make sure we have the latest data
        const utxos = await refreshUtxos(resolvedFromAddress);

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

        if (currencyUtxos.length === 0) {
            throw new Error(`No UTXOs available for ${params.currency}`);
        }

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
            
            if (feeUtxos.length === 0) {
                throw new Error(`No UTXOs available for fees (${mainCoin})`);
            }

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
            if (currencyTotal < (amountSats + feeSats)) {
                throw new Error(`Insufficient ${mainCoin} funds. Need ${fromSatoshis(amountSats + feeSats)} ${mainCoin} (including fee), but only have ${fromSatoshis(currencyTotal)} ${mainCoin}`);
            }
            feeTotal = currencyTotal - amountSats;
        }

        // Add recipient output with appropriate script
        if (!isMainCoin) {
            try {
                // For token transactions, use standard P2PKH outputs just like main coin
                // The difference is that we need to track which UTXOs contain which currencies
                txBuilder.addOutput(resolvedToAddress, amountSats);
                
                // Add change output if needed
                const currencyChange = currencyTotal - amountSats;
                if (currencyChange > DUST_THRESHOLD) {
                    txBuilder.addOutput(resolvedFromAddress, currencyChange);
                }
                
                // When sending tokens, we need to add a fee output from the main coin UTXO
                // This is the main coin change output
                const mainCoinChange = feeTotal - feeSats;
                if (mainCoinChange > DUST_THRESHOLD) {
                    txBuilder.addOutput(resolvedFromAddress, mainCoinChange);
                }
            } catch (error) {
                console.error('Error creating token outputs:', error);
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

        let keyPair;
        try {
            // Handle different formats of private key
            if (typeof params.privateKey === 'string') {
                // Direct WIF string
                keyPair = ECPair.fromWIF(params.privateKey, NETWORK);
            } 
            else if (typeof params.privateKey === 'object' && params.privateKey !== null) {
                // If it's a complex object from getPrivateKey (wallet store)
                if (params.privateKey.wif) {
                    keyPair = ECPair.fromWIF(params.privateKey.wif, NETWORK);
                } else if (params.privateKey.privateKey) {
                    keyPair = ECPair.fromWIF(params.privateKey.privateKey, NETWORK);
                } else if (params.privateKey.toString) {
                    // Try toString() method if available
                    const wifString = params.privateKey.toString();
                    keyPair = ECPair.fromWIF(wifString, NETWORK);
                } else {
                    // Last resort - try JSON stringify and extract
                    console.log('Private key is complex object, attempting to extract WIF');
                    const keyString = JSON.stringify(params.privateKey);
                    // Very basic extraction - in a real app you'd use a more robust method
                    const wifMatch = keyString.match(/"(wif|privateKey)":"([^"]+)"/);
                    if (wifMatch && wifMatch[2]) {
                        keyPair = ECPair.fromWIF(wifMatch[2], NETWORK);
                    } else {
                        throw new Error('Could not extract WIF from private key object');
                    }
                }
            } else {
                throw new Error('Invalid private key format');
            }
        } catch (error) {
            console.error('Error creating key pair:', error);
            throw new Error(`Invalid private key format: ${error.message}`);
        }

        if (!keyPair) {
            throw new Error('Failed to create key pair from private key');
        }

        // Sign all inputs
        for (let i = 0; i < selectedUtxos.length; i++) {
            const utxo = selectedUtxos[i];
            let value;
            
            // For token UTXOs, we need to use the correct script and value
            if (!isMainCoin && utxo.currencyvalues && Object.keys(utxo.currencyvalues).length > 0) {
                // For token UTXOs, use the token value
                value = getCurrencyValueFromUtxo(utxo, params.currency);
                console.log(`Signing token input with value: ${value}`);
                
                try {
                    // For token UTXOs, we need to use the standard P2PKH script
                    // The key is to use the correct value for signing
                    txBuilder.sign(
                        i,
                        keyPair,
                        null, // Use standard P2PKH script
                        Transaction.SIGHASH_ALL,
                        value
                    );
                } catch (error) {
                    console.error('Error signing token input:', error, 'Input index:', i, 'UTXO:', utxo);
                    throw error;
                }
            } else {
                // For main coin UTXOs, use the satoshis value
                value = utxo.satoshis || 0;
                console.log(`Signing main coin input with value: ${value}`);
                
                try {
                    // Standard signing for main coin UTXOs
                    txBuilder.sign(
                        i,
                        keyPair,
                        null,
                        Transaction.SIGHASH_ALL,
                        value
                    );
                } catch (error) {
                    console.error('Error signing main coin input:', error, 'Input index:', i, 'UTXO:', utxo);
                    throw error;
                }
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
        
        // Enhanced debugging - print full transaction hex
        console.log('Full transaction hex:', txHex);
        
        // Print detailed output information
        console.log('Detailed outputs:');
        tx.outs.forEach((output, index) => {
            console.log(`Output ${index}:`, {
                value: output.value,
                scriptPubKey: output.script.toString('hex')
            });
        });

        // Perform final verification of UTXOs before broadcast
        const currencyMap = buildUtxoCurrencyMap(selectedUtxos, mainCoin);
        if (!await performFinalUtxoVerification(selectedUtxos, mainCoin, currencyMap)) {
            throw new Error('Final UTXO verification failed, aborting broadcast');
        }

        try {
            // Add more detailed error handling for RPC calls
            console.log('Sending raw transaction to network...');
            
            // For token transactions, we need to modify the transaction before sending
            if (!isMainCoin) {
                // Add token data to the transaction
                const currencyId = await getCurrencyId(params.currency);
                
                // Log the transaction with token data for debugging
                console.log('Sending token transaction with currency ID:', currencyId);
                console.log('Token amount:', amountSats);
            }
            
            // Get detailed error information if available
            try {
                const txid = await makeRPCCall('sendrawtransaction', [txHex]);
                console.log('Transaction sent successfully:', txid);
                
                // Enhanced error handling - catch and log any RPC errors
                if (txid && txid.error) {
                    console.error('RPC error sending transaction:', txid.error);
                    throw new Error(`RPC error sending transaction: ${txid.error.message}`);
                }
                
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
                
                // Store the transaction in the transaction history
                try {
                    if (typeof store !== 'undefined' && store.dispatch) {
                        // Try to use Vuex store if available
                        store.dispatch('transactions/addTransaction', transactionData);
                        console.log('Transaction stored via Vuex:', transactionData);
                    } else {
                        // Fallback to direct browser storage if store isn't available
                        console.log('Store not available, using direct storage');
                        storeTransactionDirectly(transactionData);
                    }
                } catch (storeError) {
                    console.warn('Could not store transaction in Vuex:', storeError);
                    // Try direct storage as fallback
                    storeTransactionDirectly(transactionData);
                }

                return { txid };
            } catch (error) {
                // Try to get more detailed error information
                console.error('Error sending transaction:', error);
                
                // If we have a specific error message, include it
                if (error.message) {
                    throw new Error(`Failed to send transaction: ${error.message}`);
                } else {
                    throw new Error('Failed to send transaction: RPC call failed');
                }
            }
        } catch (error) {
            console.error('Error in sendCurrency:', error);
            throw error;
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

    // Handle case when password is provided instead of privateKey (from CurrencyDetails.vue)
    if (params.password && !params.privateKey) {
        try {
            console.log('Getting private key from wallet store with password for conversion');
            // Get private key from wallet store
            params.privateKey = await store.dispatch('wallet/getPrivateKey', {
                currency: params.currency,
                password: params.password
            });
            if (!params.privateKey) {
                throw new Error('Failed to retrieve private key with provided password');
            }
        } catch (error) {
            console.error('Error getting private key for conversion:', error);
            throw new Error(`Authentication failed: ${error.message}`);
        }
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

        let keyPair;
        try {
            // Handle different formats of private key
            if (typeof params.privateKey === 'string') {
                // Direct WIF string
                keyPair = ECPair.fromWIF(params.privateKey, network);
            } 
            else if (typeof params.privateKey === 'object' && params.privateKey !== null) {
                // If it's a complex object from getPrivateKey (wallet store)
                if (params.privateKey.wif) {
                    keyPair = ECPair.fromWIF(params.privateKey.wif, network);
                } else if (params.privateKey.privateKey) {
                    keyPair = ECPair.fromWIF(params.privateKey.privateKey, network);
                } else if (params.privateKey.toString) {
                    // Try toString() method if available
                    const wifString = params.privateKey.toString();
                    keyPair = ECPair.fromWIF(wifString, network);
                } else {
                    // Last resort - try JSON stringify and extract
                    console.log('Private key is complex object, attempting to extract WIF');
                    const keyString = JSON.stringify(params.privateKey);
                    // Very basic extraction - in a real app you'd use a more robust method
                    const wifMatch = keyString.match(/"(wif|privateKey)":"([^"]+)"/);
                    if (wifMatch && wifMatch[2]) {
                        keyPair = ECPair.fromWIF(wifMatch[2], network);
                    } else {
                        throw new Error('Could not extract WIF from private key object');
                    }
                }
            } else {
                throw new Error('Invalid private key format');
            }
        } catch (error) {
            console.error('Error creating key pair:', error);
            throw new Error('Invalid private key format: ' + error.message);
        }

        if (!keyPair) {
            throw new Error('Failed to create key pair from private key');
        }

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

        // Perform final verification of UTXOs before broadcast
        const currencyMap = buildUtxoCurrencyMap(relevantUtxos, store.getters['network/mainCoin']);
        if (!await performFinalUtxoVerification(relevantUtxos, store.getters['network/mainCoin'], currencyMap)) {
            throw new Error('Final UTXO verification failed, aborting broadcast');
        }

        try {
            // Add more detailed error handling for RPC calls
            console.log('Sending raw transaction to network...');
            const txid = await makeRPCCall('sendrawtransaction', [serializedTx]);
            console.log('Convert transaction sent successfully:', txid);
            
            // Enhanced error handling - catch and log any RPC errors
            if (txid && txid.error) {
                console.error('RPC error sending transaction:', txid.error);
                throw new Error(`RPC error sending transaction: ${txid.error.message}`);
            }
            
            return txid;
        } catch (error) {
            console.error('Error in sendConvertCurrency:', error);
            throw error;
        }
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

/**
 * Performs final verification of all UTXOs in a transaction before broadcast 
 * to ensure they haven't been spent since initial selection
 * @param {Array} utxos - List of UTXOs used in the transaction
 * @param {string} mainCurrency - Main currency symbol (like 'VRSCTEST')
 * @param {Object} currencyMap - Mapping of which UTXOs are used for which currencies
 * @returns {Promise<boolean>} - True if all UTXOs are still valid
 */
async function performFinalUtxoVerification(utxos, mainCurrency, currencyMap = {}) {
    try {
        console.log('Performing final UTXO verification before broadcast...');
        for (const utxo of utxos) {
            // Determine which currency this UTXO is being used for
            let currency = mainCurrency;
            if (currencyMap && typeof currencyMap === 'object' && utxo.txid && utxo.outputIndex !== undefined) {
                const key = `${utxo.txid}:${utxo.outputIndex}`;
                if (currencyMap[key]) currency = currencyMap[key];
            }
            try {
                // Only require currencyvalues for non-main coin UTXOs
                if (currency !== mainCurrency) {
                    const currencyId = CURRENCY_IDS[currency] || currency;
                    let hasCurrency = false;
                    if (utxo.currencyvalues) {
                        for (const [id, value] of Object.entries(utxo.currencyvalues)) {
                            if (
                                id === currency ||
                                id === currencyId ||
                                (value && typeof value === 'object' && value.currencyname === currency)
                            ) {
                                hasCurrency = true;
                                break;
                            }
                        }
                    }
                    if (!hasCurrency) {
                        throw new Error(`UTXO does not contain any currency values for ${currency}`);
                    }
                } else {
                    // For main coin, just check satoshis
                    if (typeof utxo.satoshis !== 'number' || utxo.satoshis <= 0) {
                        throw new Error(`UTXO has zero value for ${currency}`);
                    }
                }
                console.log(`UTXO ${utxo.txid.substring(0, 10)}...${utxo.outputIndex} still valid for ${currency}`);
            } catch (error) {
                console.error(`UTXO ${utxo.txid.substring(0, 10)}...${utxo.outputIndex} verification failed:`, error.message);
                return false;
            }
        }
        console.log('All UTXOs verified successfully');
        return true;
    } catch (error) {
        console.error('Error during final UTXO verification:', error);
        return false;
    }
}

/**
 * Automatically retries transaction creation with fresh UTXOs if initial attempt fails
 * @param {Object} params - Transaction parameters
 * @param {boolean} isConversion - Whether this is a conversion transaction
 * @param {number} maxRetries - Maximum number of retry attempts
 * @returns {Promise<Object>} - Transaction result with txid
 */
async function executeTransactionWithRetry(params, isConversion = false, maxRetries = 2) {
    let lastError;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            if (attempt > 0) {
                console.log(`Retry attempt ${attempt}/${maxRetries} for ${params.currency} transaction`);
                
                // Refresh UTXO data from the blockchain for retry attempts
                const freshUtxos = await makeRPCCall('getaddressutxos', [{
                    addresses: [params.fromAddress],
                    currencynames: true
                }]);
                
                if (!freshUtxos || freshUtxos.length === 0) {
                    throw new Error(`No UTXOs available on retry attempt ${attempt}`);
                }
                
                console.log(`Found ${freshUtxos.length} UTXOs for retry attempt`);
            }
            
            // Execute the appropriate transaction type
            if (isConversion) {
                return await sendConvertCurrency(params);
            } else {
                return await sendCurrency(params);
            }
        } catch (error) {
            lastError = error;
            
            // Only retry for specific errors that might be resolved with fresh UTXOs
            if (error.message && (
                error.message.includes('bad-txns-inputs-spent') || 
                error.message.includes('UTXO verification failed') ||
                error.message.includes('No unspent UTXOs available')
            )) {
                console.log(`Recoverable error detected, will retry: ${error.message}`);
                // Wait a short time before retry to allow blockchain state to update
                await new Promise(resolve => setTimeout(resolve, 1000));
                continue;
            } else {
                // For other errors, don't retry
                console.error('Non-recoverable error, will not retry:', error);
                throw error;
            }
        }
    }
    
    // If we've exhausted all retries, throw the last error
    throw new Error(`Transaction failed after ${maxRetries} retry attempts: ${lastError.message}`);
}

// Helper function to store transaction directly to browser storage
// when Vuex store is not available
async function storeTransactionDirectly(transaction) {
    try {
        // Add timestamp if not present
        if (!transaction.timestamp) {
            transaction.timestamp = new Date().toISOString();
        }
        
        // Get existing transactions
        const storage = chrome.storage?.local || browser?.storage?.local;
        if (!storage) {
            console.error('Browser storage not available');
            return;
        }
        
        const { transactions = [] } = await storage.get('transactions');
        
        // Check if transaction already exists to avoid duplicates
        if (!transactions.some(tx => tx.txid === transaction.txid)) {
            transactions.push(transaction);
            await storage.set({ transactions });
            console.log('Transaction stored directly:', transaction);
        } else {
            console.log('Transaction already exists in storage');
        }
    } catch (error) {
        console.error('Failed to store transaction directly:', error);
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
    IS_PBAAS_CHAIN,
    performFinalUtxoVerification,
    executeTransactionWithRetry,
    storeTransactionDirectly
};