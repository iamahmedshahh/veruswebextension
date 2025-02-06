import { Buffer } from 'buffer';
import * as bitgo from '@bitgo/utxo-lib';
import BigInteger from 'bigi';
import bip39 from 'bip39';
import crypto from 'crypto';
import bs58check from 'bs58check';
import * as ethUtil from 'ethereumjs-util';
import bcrypt from 'bcryptjs';
import store from '../store';

// Get the BitGo library instance
const lib = bitgo.default;

// Network configurations
const NETWORK_CONFIG = {
    verus: lib.networks.verus,
    verustest: lib.networks.verustest,
    bitcoin: lib.networks.bitcoin
};

// Mimic agama-wallet-lib's seedToWif
function seedToWif(seed, network, iguana = true) {
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
function seedToPriv(seed, type = 'btc') {
    const seedBuf = Buffer.from(seed);
    const hash = crypto.createHash('sha256').update(seedBuf).digest();
    
    if (type === 'eth') {
        return '0x' + hash.toString('hex');
    } else {
        return hash.toString('hex');
    }
}

async function deriveWeb3Keypair(seed) {
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

export default class WalletService {
    static async hashPassword(password) {
        return bcrypt.hash(password, 10);
    }

    static async comparePassword(password, hash) {
        return bcrypt.compare(password, hash);
    }

    static async generateWallet(mnemonic, password) {
        try {
            // Generate or use provided mnemonic
            if (!mnemonic) {
                const entropy = crypto.randomBytes(32);
                mnemonic = bip39.entropyToMnemonic(entropy);
            }

            // Convert mnemonic to seed
            const seed = bip39.mnemonicToSeedSync(mnemonic).toString('hex');

            // Generate addresses using agama-wallet-lib approach
            const vrscKeys = seedToWif(seed, NETWORK_CONFIG.verus, true);
            const btcKeys = seedToWif(seed, NETWORK_CONFIG.bitcoin, true);
            const ethKeys = await deriveWeb3Keypair(seed);

            const addresses = {
                VRSC: {
                    address: vrscKeys.pub,
                    privateKey: vrscKeys.priv
                },
                BTC: {
                    address: btcKeys.pub,
                    privateKey: btcKeys.priv
                },
                ETH: {
                    address: ethKeys.address,
                    privateKey: ethKeys.privKey
                }
            };

            // Hash password for storage
            const passwordHash = await this.hashPassword(password);

            return {
                mnemonic,
                addresses,
                passwordHash
            };
        } catch (error) {
            console.error('Wallet generation failed:', error);
            throw error;
        }
    }

    static async recoverFromMnemonic(mnemonic, password) {
        return this.generateWallet(mnemonic, password);
    }
}