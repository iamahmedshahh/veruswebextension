import { Buffer } from 'buffer';
import * as bitgo from '@bitgo/utxo-lib';
import bip39 from 'bip39';
import HDKey from 'hdkey';
import BigInteger from 'bigi';
import bcrypt from 'bcryptjs';

// Get the BitGo library instance and ECPair
const lib = bitgo.default;
const ECPair = lib.ECPair;

// Network configuration for Verus
const NETWORK = {
    messagePrefix: '\x18Verus Signed Message:\n',
    bip32: {
        public: 0x0488B21E,
        private: 0x0488ADE4
    },
    pubKeyHash: 0x3c,     // Verus address version (starts with R)
    scriptHash: 0x3d,     // Verus P2SH version
    wif: 0xBC,           // Verus WIF version
    coin: 'VRSCTEST'     // Use 'VRSC' for mainnet
};

// BIP44 path for Verus (using Bitcoin's coin type for now)
const BIP44_PATH = "m/44'/0'/0'/0/0";

export class WalletService {
    /**
     * Generate a new wallet with mnemonic phrase, private key, and address
     * @returns {Promise<Object>} Wallet data including mnemonic, privateKey (WIF), and address
     */
    static async generateWallet() {
        try {
            // Generate mnemonic (24 words for extra security)
            const mnemonic = bip39.generateMnemonic(256);
            
            // Convert mnemonic to seed
            const seed = await bip39.mnemonicToSeed(mnemonic);
            
            // Create HD wallet
            const hdkey = HDKey.fromMasterSeed(seed);
            const childKey = hdkey.derive(BIP44_PATH);
            
            // Get private key from derived path
            const privateKeyBuffer = childKey.privateKey;
            
            // Create key pair using ECPair
            const keyPair = ECPair.fromPrivateKey(privateKeyBuffer, { network: NETWORK });
            
            // Get WIF (Wallet Import Format)
            const wif = keyPair.toWIF();
            
            // Generate P2PKH address
            const { address } = lib.payments.p2pkh({
                pubkey: keyPair.publicKey,
                network: NETWORK
            });

            // Verify address format
            if (!address.startsWith('R') || address.length !== 34) {
                throw new Error('Generated address format is invalid');
            }
            
            return {
                mnemonic,
                privateKey: wif,
                address,
                network: NETWORK.coin
            };
        } catch (error) {
            console.error('Failed to generate wallet:', error);
            throw new Error('Wallet generation failed: ' + error.message);
        }
    }

    /**
     * Recover a wallet from mnemonic phrase
     * @param {string} mnemonic The 24-word mnemonic phrase
     * @returns {Promise<Object>} Wallet data including privateKey (WIF) and address
     */
    static async recoverFromMnemonic(mnemonic) {
        try {
            // Validate mnemonic
            if (!bip39.validateMnemonic(mnemonic)) {
                throw new Error('Invalid mnemonic phrase');
            }

            // Convert mnemonic to seed
            const seed = await bip39.mnemonicToSeed(mnemonic);
            
            // Create HD wallet
            const hdkey = HDKey.fromMasterSeed(seed);
            const childKey = hdkey.derive(BIP44_PATH);
            
            // Get private key from derived path
            const privateKeyBuffer = childKey.privateKey;
            
            // Create key pair using ECPair
            const keyPair = ECPair.fromPrivateKey(privateKeyBuffer, { network: NETWORK });
            
            // Get WIF
            const wif = keyPair.toWIF();
            
            // Generate address
            const { address } = lib.payments.p2pkh({
                pubkey: keyPair.publicKey,
                network: NETWORK
            });

            return {
                privateKey: wif,
                address,
                network: NETWORK.coin
            };
        } catch (error) {
            console.error('Failed to recover wallet:', error);
            throw new Error('Wallet recovery failed: ' + error.message);
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
            const keyPair = ECPair.fromWIF(wif, NETWORK);
            
            // Generate address
            const { address } = lib.payments.p2pkh({
                pubkey: keyPair.publicKey,
                network: NETWORK
            });

            return {
                address,
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
