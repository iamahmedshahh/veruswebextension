import { Buffer } from 'buffer';
import * as bitgo from '@bitgo/utxo-lib';
import bip39 from 'bip39';
import BigInteger from 'bigi';
import bcrypt from 'bcryptjs';
import HDKey from 'hdkey';

// Get the BitGo library instance
const lib = bitgo.default;
const networks = lib.networks;
const address = lib.address;

// Network configuration for Verus
const NETWORK = networks.verustest;

// BIP44 path for Verus (using Bitcoin's coin type for now)
const BIP44_PATH = "m/44'/0'/0'/0/0";

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

            // Convert mnemonic to seed
            const seed = await bip39.mnemonicToSeed(mnemonic);
            
            // Create HD wallet
            const hdkey = HDKey.fromMasterSeed(seed);
            const childKey = hdkey.derive(BIP44_PATH);
            
            // Get private key from derived path
            const privateKeyBuffer = childKey.privateKey;
            const privateKey = BigInteger.fromBuffer(privateKeyBuffer);
            
            // Create key pair using the library's ECPair class
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
            // Convert mnemonic to seed
            const seed = await bip39.mnemonicToSeed(mnemonic);
            
            // Create HD wallet
            const hdkey = HDKey.fromMasterSeed(seed);
            const childKey = hdkey.derive(BIP44_PATH);
            
            // Get private key from derived path
            const privateKeyBuffer = childKey.privateKey;
            const privateKey = BigInteger.fromBuffer(privateKeyBuffer);
            
            // Create key pair using the library's ECPair class
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
     * Recover a wallet from WIF
     * @param {string} wif The wallet import format string
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
                address: verusAddress,
                network: NETWORK.coin
            };
        } catch (error) {
            console.error('Failed to recover wallet from WIF:', error);
            throw new Error('WIF recovery failed: ' + error.message);
        }
    }

    /**
     * Hash a password for secure storage
     * @param {string} password The password to hash
     * @returns {Promise<string>} The hashed password
     */
    static async hashPassword(password) {
        try {
            const salt = await bcrypt.genSalt(10);
            const hash = await bcrypt.hash(password, salt);
            return hash;
        } catch (error) {
            console.error('Failed to hash password:', error);
            throw new Error('Password hashing failed');
        }
    }

    /**
     * Verify a password against a hash
     * @param {string} password The password to verify
     * @param {string} hash The hash to verify against
     * @returns {Promise<boolean>} True if password matches, false otherwise
     */
    static async verifyPassword(password, hash) {
        try {
            return await bcrypt.compare(password, hash);
        } catch (error) {
            console.error('Failed to verify password:', error);
            throw new Error('Password verification failed');
        }
    }
}
