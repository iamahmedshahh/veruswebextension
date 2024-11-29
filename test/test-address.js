import * as bitgo from '@bitgo/utxo-lib';
import crypto from 'crypto';
import BigInteger from 'bigi';
import bip39 from 'bip39';
import HDKey from 'hdkey';

// Get the BitGo library instance
const lib = bitgo.default;

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
    coin: 'VRSCTEST'
};

// BIP44 path for Verus (using Bitcoin's coin type for now)
const BIP44_PATH = "m/44'/0'/0'/0/0";

function generateWallet() {
    console.log('Generating new wallet...');
    
    try {
        // Generate mnemonic (24 words for extra security)
        const mnemonic = bip39.generateMnemonic(256);
        console.log('\nMnemonic (save these 24 words):\n', mnemonic);
        
        // Convert mnemonic to seed
        const seed = bip39.mnemonicToSeedSync(mnemonic);
        
        // Create HD wallet
        const hdkey = HDKey.fromMasterSeed(seed);
        const childKey = hdkey.derive(BIP44_PATH);
        
        // Get private key from derived path
        const privateKeyBuffer = childKey.privateKey;
        const privateKey = BigInteger.fromBuffer(privateKeyBuffer);
        
        // Create key pair using the library's ECPair class
        const keyPair = new lib.ECPair(privateKey, null, { network: NETWORK });
        
        // Get WIF (Wallet Import Format) - this is the private key in a more readable format
        const wif = keyPair.toWIF();
        console.log('\nPrivate Key (WIF format):\n', wif);
        
        // Generate P2PKH address
        const pubKeyHash = lib.crypto.hash160(keyPair.getPublicKeyBuffer());
        const scriptPubKey = lib.script.pubKeyHash.output.encode(pubKeyHash);
        const address = lib.address.fromOutputScript(scriptPubKey, NETWORK);

        console.log('\nPublic Address:\n', address);
        
        // Verify address format
        if (!address.startsWith('R')) {
            throw new Error('Generated address does not start with R');
        }
        
        if (address.length !== 34) {
            throw new Error('Generated address length is not 34 characters');
        }
        
        console.log('\n✅ SUCCESS: Wallet generated successfully');
        console.log('Important: Save your mnemonic phrase and private key in a secure location!');
        
        return {
            mnemonic,
            privateKey: wif,
            address
        };
    } catch (error) {
        console.error('Failed to generate wallet:', error);
        throw error;
    }
}

// Generate a wallet and verify it
console.log('=== Generating New Verus Wallet ===\n');
const wallet = generateWallet();
