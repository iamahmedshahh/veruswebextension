import { Buffer } from 'buffer';
import crypto from 'crypto';
import bs58check from 'bs58check';
import BigInteger from 'bigi';
import * as bitgo from '@bitgo/utxo-lib';
import * as ethUtil from 'ethereumjs-util';

const lib = bitgo.default;

// Network configurations
const NETWORK_CONFIG = {
    verus: {
        messagePrefix: '\x18Verus Signed Message:\n',
        bech32: 'bc',
        bip32: {
            public: 0x0488b21e,
            private: 0x0488ade4
        },
        pubKeyHash: 0x3c,
        scriptHash: 0x55,
        wif: 0xbc
    },
    verustest: {
        messagePrefix: '\x18Verus Signed Message:\n',
        bech32: 'bc',
        bip32: {
            public: 0x0488b21e,
            private: 0x0488ade4
        },
        pubKeyHash: 0x3c,
        scriptHash: 0x55,
        wif: 0xbc
    },
    bitcoin: lib.networks.bitcoin
};

// Mimic agama-wallet-lib's seedToWif
export function seedToWif(seed, network, iguana = true) {
    let bytes;
    let isWif = false;
    
    // If seed is WIF, decode it
    try {
        bytes = bs58check.decode(seed);
        isWif = true;
    } catch (e) {
        // Create SHA256 hash of the seed
        const hash = crypto.createHash('sha256').update(seed).digest();
        bytes = hash;

        // Iguana compatible conversion
        if (iguana) {
            bytes[0] &= 248;
            bytes[31] &= 127;
            bytes[31] |= 64;
        }
    }

    const privKey = BigInteger.fromBuffer(bytes);
    const keyPair = new lib.ECPair(privKey, null, { network });

    return {
        pub: keyPair.getAddress(),
        pubHex: keyPair.getPublicKeyBuffer().toString('hex'),
        priv: keyPair.toWIF()
    };
}

// Mimic agama-wallet-lib's seedToPriv
export function seedToPriv(seed, type = 'btc') {
    const seedBuf = Buffer.from(seed);
    const hash = crypto.createHash('sha256').update(seedBuf).digest();
    
    if (type === 'eth') {
        return '0x' + hash.toString('hex');
    } else {
        return hash.toString('hex');
    }
}

// Generate VRSC address using mobile wallet's approach
export function generateVerusAddress(seed, isTestnet = false) {
    const network = isTestnet ? NETWORK_CONFIG.verustest : NETWORK_CONFIG.verus;
    const keys = seedToWif(seed, network, true);
    return {
        privateKey: keys.priv,
        address: keys.pub
    };
}

// Generate BTC address using mobile wallet's approach
export function generateBitcoinAddress(seed) {
    const keys = seedToWif(seed, NETWORK_CONFIG.bitcoin, true);
    return {
        privateKey: keys.priv,
        address: keys.pub
    };
}

// Derive Ethereum keypair using mobile wallet's approach
export async function deriveWeb3Keypair(seed) {
    // First check if seed is already an ETH private key
    let seedIsEthPrivkey = false;
    try {
        if (seed.length === 66 && seed.startsWith('0x')) {
            // Remove 0x prefix for the check
            const privKeyBuf = Buffer.from(seed.slice(2), 'hex');
            if (privKeyBuf.length === 32) {
                seedIsEthPrivkey = true;
            }
        }
    } catch(e) {}

    // Get Electrum keys
    const electrumKeys = seedToWif(seed, NETWORK_CONFIG.bitcoin, true);
    
    // Get public key buffer from electrum keys
    const pubKeyBuffer = Buffer.from(electrumKeys.pubHex, 'hex');
    
    // Compute ETH address directly from public key using ethereumjs-util
    const addressBuffer = ethUtil.pubToAddress(pubKeyBuffer, true);
    const ethAddress = ethUtil.toChecksumAddress('0x' + addressBuffer.toString('hex'));
    
    // Use seed directly if it's an ETH private key, otherwise derive it
    const ethPrivKey = seedIsEthPrivkey ? seed : seedToPriv(electrumKeys.priv, 'eth');
    
    return {
        privKey: ethPrivKey,
        address: ethAddress
    };
}
