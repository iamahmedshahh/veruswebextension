import { Buffer } from 'buffer';
import * as bitgo from '@bitgo/utxo-lib';
import BigInteger from 'bigi';
import bip39 from 'bip39';
import crypto from 'crypto';
import bs58check from 'bs58check';
import * as ethUtil from 'ethereumjs-util';
import bcrypt from 'bcryptjs';
import { encrypt, decrypt, hashPassword, verifyPassword, generateSecureId } from '../utils/crypto';

const lib = bitgo.default;

const NETWORK_CONFIG = {
    verus: lib.networks.verus,
    verustest: lib.networks.verustest,
    bitcoin: lib.networks.bitcoin
};

const VERUS_NETWORK = import.meta.env.VITE_VERUS_NETWORK === 'testnet' 
    ? NETWORK_CONFIG.verustest 
    : NETWORK_CONFIG.verus;

// Maximum wallet session time before auto-locking (30 minutes)
const MAX_SESSION_TIME = 30 * 60 * 1000;

function seedToWif(seed, network, iguana = true) {
    let bytes;
    let isWif = false;
    
    try {
        bytes = bs58check.decode(seed);
        isWif = true;
    } catch (e) {
        const hash = crypto.createHash('sha256').update(seed).digest();
        bytes = hash;

        if (iguana) {
            bytes[0] &= 248;
            bytes[31] &= 127;
            bytes[31] |= 64;
        }
    }

    const privKey = BigInteger.fromBuffer(bytes);
    const keyPair = new lib.ECPair(privKey, null, { network });

    // Return only the necessary data, avoid keeping extended objects in memory
    const result = {
        pub: keyPair.getAddress(),
        pubHex: keyPair.getPublicKeyBuffer().toString('hex'),
        priv: keyPair.toWIF()
    };
    
    // Clear private key data from memory when done
    if (privKey._d) {
        privKey._d.fill(0);
    }
    
    return result;
}

function seedToPriv(seed, type = 'btc') {
    const seedBuf = Buffer.from(seed);
    const hash = crypto.createHash('sha256').update(seedBuf).digest();
    
    let result;
    if (type === 'eth') {
        result = '0x' + hash.toString('hex');
    } else {
        result = hash.toString('hex');
    }
    
    // Clear sensitive data
    seedBuf.fill(0);
    hash.fill(0);
    
    return result;
}

async function deriveWeb3Keypair(seed) {
    let seedIsEthPrivkey = false;
    try {
        if (seed.length === 66 && seed.startsWith('0x')) {
            const privKeyBuf = Buffer.from(seed.slice(2), 'hex');
            if (privKeyBuf.length === 32) {
                seedIsEthPrivkey = true;
            }
            // Immediately clear private key buffer
            privKeyBuf.fill(0);
        }
    } catch(e) {}

    const electrumKeys = seedToWif(seed, NETWORK_CONFIG.bitcoin, true);
    const pubKeyBuffer = Buffer.from(electrumKeys.pubHex, 'hex');
    
    const addressBuffer = ethUtil.pubToAddress(pubKeyBuffer, true);
    const ethAddress = ethUtil.toChecksumAddress('0x' + addressBuffer.toString('hex'));
    
    const ethPrivKey = seedIsEthPrivkey ? seed : seedToPriv(electrumKeys.priv, 'eth');
    
    // Securely clear memory
    if (addressBuffer) addressBuffer.fill(0);
    if (pubKeyBuffer) pubKeyBuffer.fill(0);
    
    return {
        privKey: ethPrivKey,
        address: ethAddress
    };
}

export default class WalletService {
    /**
     * Creates a secure hash of the user's password with bcrypt
     * @param {string} password - The user's password to hash
     * @returns {Promise<string>} - Bcrypt hash of the password
     */
    static async hashPassword(password) {
        return bcrypt.hash(password, 12); // Increased from 10 rounds
    }

    /**
     * Compares a password against a bcrypt hash
     * @param {string} password - The password to check
     * @param {string} hash - The bcrypt hash to compare against
     * @returns {Promise<boolean>} - Whether the password matches
     */
    static async comparePassword(password, hash) {
        return bcrypt.compare(password, hash);
    }

    /**
     * Generates a secure encryption key derived from the password
     * @param {string} password - The user's password
     * @param {Buffer} [salt] - Optional salt for key derivation
     * @returns {Promise<{key: Buffer, salt: Buffer}>} - Derived key and salt
     */
    static async deriveEncryptionKey(password, salt = null) {
        // Use our enhanced crypto utility for key derivation
        const result = await hashPassword(password, salt);
        return {
            key: Buffer.from(result.hash, 'hex'),
            salt: result.salt
        };
    }

    /**
     * Generates a new wallet with strong encryption
     * @param {string} mnemonic - Mnemonic phrase (optional, will generate if not provided)
     * @param {string} password - Password to encrypt the wallet
     * @returns {Promise<object>} - Wallet data
     */
    static async generateWallet(mnemonic, password) {
        try {
            if (!mnemonic) {
                const entropy = crypto.randomBytes(32);
                mnemonic = bip39.entropyToMnemonic(entropy);
                // Securely clear entropy from memory
                entropy.fill(0);
            }

            if (!bip39.validateMnemonic(mnemonic)) {
                throw new Error('Invalid mnemonic');
            }

            // Generate addresses using agama-wallet-lib approach
            const vrscKeys = seedToWif(mnemonic, VERUS_NETWORK, true);
            const btcKeys = seedToWif(mnemonic, NETWORK_CONFIG.bitcoin, true);
            const ethKeys = await deriveWeb3Keypair(mnemonic);

            // Encrypt sensitive data
            const encryptedMnemonic = await encrypt(mnemonic, password);
            const vrscPrivateKeyEncrypted = await encrypt(vrscKeys.priv, password);
            const btcPrivateKeyEncrypted = await encrypt(btcKeys.priv, password);
            const ethPrivateKeyEncrypted = await encrypt(ethKeys.privKey, password);

            // Create wallet ID for secure reference
            const walletId = generateSecureId();

            // Store addresses only, with encrypted private keys
            const addresses = {
                VRSC: {
                    address: vrscKeys.pub,
                    encryptedPrivateKey: vrscPrivateKeyEncrypted,
                    // Do not store unencrypted private key
                },
                BTC: {
                    address: btcKeys.pub,
                    encryptedPrivateKey: btcPrivateKeyEncrypted,
                    // Do not store unencrypted private key
                },
                ETH: {
                    address: ethKeys.address,
                    encryptedPrivateKey: ethPrivateKeyEncrypted,
                    // Do not store unencrypted private key
                }
            };

            // Hash password for authentication (not for encryption)
            const passwordHash = await this.hashPassword(password);

            // Clear sensitive data from memory
            // Clear the mnemonic from memory
            if (typeof mnemonic === 'string') {
                // This isn't a perfect solution but helps reduce exposure
                mnemonic = mnemonic.split('').map(() => '*').join('');
                mnemonic = null;
            }

            // Create session data with timeout
            const sessionData = {
                createdAt: Date.now(),
                expiresAt: Date.now() + MAX_SESSION_TIME,
                id: generateSecureId()
            };

            return {
                walletId,
                encryptedMnemonic,
                addresses,
                passwordHash,
                sessionData
            };
        } catch (error) {
            console.error('Wallet generation failed:', error);
            throw error;
        }
    }

    /**
     * Recovers a wallet from mnemonic with secure encryption
     * @param {string} mnemonic - Mnemonic phrase to recover from
     * @param {string} password - Password to encrypt the wallet
     * @returns {Promise<object>} - Recovered wallet data
     */
    static async recoverFromMnemonic(mnemonic, password) {
        return this.generateWallet(mnemonic, password);
    }

    /**
     * Decrypts private key for a specific address
     * @param {string} encryptedPrivateKey - Encrypted private key
     * @param {string} password - User's password
     * @returns {Promise<string>} - Decrypted private key
     */
    static async getPrivateKey(encryptedPrivateKey, password) {
        try {
            const privateKey = await decrypt(encryptedPrivateKey, password);
            
            // Schedule cleanup of private key from memory
            setTimeout(() => {
                if (typeof privateKey === 'string') {
                    // This isn't a perfect solution but helps reduce exposure
                    privateKey = privateKey.split('').map(() => '*').join('');
                }
            }, 30000); // After 30 seconds
            
            return privateKey;
        } catch (error) {
            console.error('Failed to decrypt private key:', error);
            throw new Error('Failed to decrypt private key. Check your password.');
        }
    }

    /**
     * Creates a new wallet session or extends existing session
     * @returns {object} - Session data
     */
    static createSession() {
        return {
            createdAt: Date.now(),
            expiresAt: Date.now() + MAX_SESSION_TIME,
            id: generateSecureId()
        };
    }

    /**
     * Checks if a session is valid
     * @param {object} session - Session data
     * @returns {boolean} - Whether the session is valid
     */
    static isSessionValid(session) {
        if (!session || !session.expiresAt) return false;
        return Date.now() < session.expiresAt;
    }

    /**
     * Extends a session's expiration time
     * @param {object} session - Session data
     * @returns {object} - Updated session data
     */
    static extendSession(session) {
        if (!session) return this.createSession();
        
        return {
            ...session,
            expiresAt: Date.now() + MAX_SESSION_TIME
        };
    }
}