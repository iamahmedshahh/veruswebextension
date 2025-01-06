import * as bitgo from '@bitgo/utxo-lib';
import crypto from 'crypto';
import BigInteger from 'bigi';
import bip39 from 'bip39';
import sha256 from 'js-sha256';

// Get the BitGo library instance
const lib = bitgo.default;

// Network configuration for Verus
const NETWORK = lib.networks.verustest;


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

function generateWallet() {
    console.log('Generating new wallet...');
    
    try {
        // Generate mnemonic (24 words for extra security)
        const mnemonic = bip39.generateMnemonic(256);
        console.log('\nMnemonic (save these 24 words):\n', mnemonic);
        
        // Convert mnemonic to private key using sha256
        const privateKeyBytes = seedToPrivateKey(mnemonic);
        
        // Create key pair using private key bytes
        const privateKey = BigInteger.fromBuffer(Buffer.from(privateKeyBytes));
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
        
        // Also verify we can recover the same address from WIF
        const recoveredKeyPair = lib.ECPair.fromWIF(wif, NETWORK);
        const recoveredAddress = recoveredKeyPair.getAddress();
        
        if (recoveredAddress !== address) {
            throw new Error('Address recovery verification failed');
        }
        console.log('\n✅ Address recovery verification passed');
        
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

// Add a function to test mnemonic recovery
function recoverFromMnemonic(mnemonic) {
    console.log('\nRecovering wallet from mnemonic...');
    
    try {
        // Convert mnemonic to private key using sha256
        const privateKeyBytes = seedToPrivateKey(mnemonic);
        
        // Create key pair using private key bytes
        const privateKey = BigInteger.fromBuffer(Buffer.from(privateKeyBytes));
        const keyPair = new lib.ECPair(privateKey, null, { network: NETWORK });
        
        // Get address
        const address = keyPair.getAddress();
        const wif = keyPair.toWIF();
        
        console.log('\nRecovered Address:', address);
        console.log('Recovered Private Key (WIF):', wif);
        
        return {
            privateKey: wif,
            address
        };
    } catch (error) {
        console.error('Failed to recover wallet:', error);
        throw error;
    }
}

// Generate a wallet and verify it
console.log('=== Generating New Verus Wallet ===\n');
const wallet = generateWallet();

// Test recovery
console.log('\n=== Testing Mnemonic Recovery ===');
const recovered = recoverFromMnemonic(wallet.mnemonic);

if (recovered.address === wallet.address && recovered.privateKey === wallet.privateKey) {
    console.log('\n✅ Recovery test passed - Generated and recovered addresses match');
} else {
    console.error('\n❌ Recovery test failed - Addresses do not match');
    console.log('Original:', wallet.address);
    console.log('Recovered:', recovered.address);
}

// Export functions
export { generateWallet, recoverFromMnemonic };
