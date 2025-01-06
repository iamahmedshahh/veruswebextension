import { Buffer } from 'buffer';
import * as bitgo from '@bitgo/utxo-lib';
import bip39 from 'bip39';
import BigInteger from 'bigi';
import bcrypt from 'bcryptjs';
import sha256 from 'js-sha256';

// Get the BitGo library instance
const lib = bitgo.default;
const networks = lib.networks;
const address = lib.address;

// Network configuration for Verus
const NETWORK = networks.verustest;

function seedToPrivateKey(seed, iguana = true) {
    // Create SHA256 hash of the seed
    const hash = sha256.create().update(seed);
    const bytes = hash.array();

    // Iguana compatible conversion
    if (iguana) {
        bytes[0] &= 248;
        bytes[31] &= 127;
        bytes[31] |= 64;
    }

    return bytes;
}

export class WalletService {
    /**
     * Generate a new wallet with mnemonic phrase, private key, and address
     * @param {string} mnemonic - Optional mnemonic phrase. If not provided, one will be generated.
     * @param {string} password - Password to encrypt the wallet
     * @returns {Promise<Object>} Wallet data including mnemonic, privateKey (WIF), and address
     */
    static async generateWallet(mnemonic, password) {
        try {
            // Generate mnemonic if not provided (24 words for extra security)
            if (!mnemonic) {
                const entropy = crypto.randomBytes(32);
                mnemonic = bip39.entropyToMnemonic(entropy);
            }

            // Convert mnemonic to private key using sha256
            const privateKeyBytes = seedToPrivateKey(mnemonic);
            
            // Create key pair using private key bytes
            const privateKey = BigInteger.fromBuffer(Buffer.from(privateKeyBytes));
            const keyPair = new lib.ECPair(privateKey, null, { network: NETWORK });
            
            // Get WIF (Wallet Import Format)
            const privateKeyWIF = keyPair.toWIF();

            // Generate P2PKH address
            const pubKeyHash = lib.crypto.hash160(keyPair.getPublicKeyBuffer());
            const scriptPubKey = lib.script.pubKeyHash.output.encode(pubKeyHash);
            const verusAddress = lib.address.fromOutputScript(scriptPubKey, NETWORK);

            // Verify address format
            if (!verusAddress.startsWith('R')) {
                throw new Error('Generated address does not start with R');
            }

            if (verusAddress.length !== 34) {
                throw new Error('Generated address length is not 34 characters');
            }

            // Hash password
            const hashedPassword = await this.hashPassword(password);

            return {
                mnemonic,
                privateKey: privateKeyWIF,
                address: verusAddress,
                hashedPassword
            };
        } catch (error) {
            console.error('Error generating wallet:', error);
            throw error;
        }
    }

    /**
     * Recover wallet from mnemonic phrase
     * @param {string} mnemonic - Mnemonic phrase
     * @param {string} password - Password to encrypt the wallet
     * @returns {Promise<Object>} Wallet data including privateKey (WIF) and address
     */
    static async recoverFromMnemonic(mnemonic, password) {
        try {
            // Convert mnemonic to private key using sha256
            const privateKeyBytes = seedToPrivateKey(mnemonic);
            
            // Create key pair using private key bytes
            const privateKey = BigInteger.fromBuffer(Buffer.from(privateKeyBytes));
            const keyPair = new lib.ECPair(privateKey, null, { network: NETWORK });
            
            // Get WIF (Wallet Import Format)
            const privateKeyWIF = keyPair.toWIF();

            // Generate P2PKH address
            const pubKeyHash = lib.crypto.hash160(keyPair.getPublicKeyBuffer());
            const scriptPubKey = lib.script.pubKeyHash.output.encode(pubKeyHash);
            const verusAddress = lib.address.fromOutputScript(scriptPubKey, NETWORK);

            // Hash password
            const hashedPassword = await this.hashPassword(password);

            return {
                privateKey: privateKeyWIF,
                address: verusAddress,
                hashedPassword
            };
        } catch (error) {
            console.error('Error recovering wallet:', error);
            throw error;
        }
    }

    /**
     * Recover wallet from WIF private key
     * @param {string} wif - Private key in WIF format
     * @returns {Promise<Object>} Wallet data including address
     */
    static async recoverFromWIF(wif) {
        try {
            // Create key pair from WIF
            const keyPair = lib.ECPair.fromWIF(wif, NETWORK);
            
            // Get address using P2PKH script
            const pubKeyHash = lib.crypto.hash160(keyPair.getPublicKeyBuffer());
            const scriptPubKey = lib.script.pubKeyHash.output.encode(pubKeyHash);
            const verusAddress = lib.address.fromOutputScript(scriptPubKey, NETWORK);

            return {
                privateKey: wif,
                address: verusAddress
            };
        } catch (error) {
            console.error('Error recovering from WIF:', error);
            throw error;
        }
    }

    /**
     * Hash a password using bcrypt
     * @param {string} password - Password to hash
     * @returns {Promise<string>} Hashed password
     */
    static async hashPassword(password) {
        const salt = await bcrypt.genSalt(10);
        const hash = await bcrypt.hash(password, salt);
        return hash;
    }

    /**
     * Verify a password against a hash
     * @param {string} password - Password to verify
     * @param {string} hash - Hash to verify against
     * @returns {Promise<boolean>} True if password matches hash
     */
    static async verifyPassword(password, hash) {
        return await bcrypt.compare(password, hash);
    }
}
