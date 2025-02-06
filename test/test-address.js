import { Buffer } from 'buffer';
import * as bitgo from '@bitgo/utxo-lib';
import BigInteger from 'bigi';
import bip39 from 'bip39';
import crypto from 'crypto';
import bs58check from 'bs58check';
import * as ethUtil from 'ethereumjs-util';

// Get the BitGo library instance
const lib = bitgo.default;

// Network configurations
const NETWORK_CONFIG = {
    verus: lib.networks.verus,
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

async function generateWallet() {
    try {
        // Generate BIP39 mnemonic (24 words)
        const entropy = crypto.randomBytes(32);
        const mnemonic = bip39.entropyToMnemonic(entropy);
        console.log('\n=== Generating New Cross-Chain Wallet ===\n');
        console.log(' Mnemonic (24 words):\n', mnemonic);

        // Generate addresses using agama-wallet-lib approach
        const vrscKeys = seedToWif(mnemonic, NETWORK_CONFIG.verus, true);
        const btcKeys = seedToWif(mnemonic, NETWORK_CONFIG.bitcoin, true);
        const ethKeys = await deriveWeb3Keypair(mnemonic);

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

        console.log('\n Generated Addresses:');
        console.log('VRSC:', addresses.VRSC.address);
        console.log('BTC:', addresses.BTC.address);
        console.log('ETH:', addresses.ETH.address);

        console.log('\n Private Keys:');
        console.log('VRSC (WIF):', addresses.VRSC.privateKey);
        console.log('BTC (WIF):', addresses.BTC.privateKey);
        console.log('ETH:', addresses.ETH.privateKey);

        return {
            mnemonic,
            addresses
        };
    } catch (error) {
        console.error('Generation failed:', error);
        throw error;
    }
}

// Run the test
(async () => {
    try {
        // Generate initial wallet
        const wallet = await generateWallet();
        
        // Test recovery
        console.log('\n=== Testing Recovery ===');
        
        const recoveredVrsc = seedToWif(wallet.mnemonic, NETWORK_CONFIG.verus, true);
        const recoveredBtc = seedToWif(wallet.mnemonic, NETWORK_CONFIG.bitcoin, true);
        const recoveredEth = await deriveWeb3Keypair(wallet.mnemonic);

        const recoveredAddresses = {
            VRSC: {
                address: recoveredVrsc.pub,
                privateKey: recoveredVrsc.priv
            },
            BTC: {
                address: recoveredBtc.pub,
                privateKey: recoveredBtc.priv
            },
            ETH: {
                address: recoveredEth.address,
                privateKey: recoveredEth.privKey
            }
        };

        // Verify matches
        const validations = {
            VRSC: wallet.addresses.VRSC.address === recoveredAddresses.VRSC.address,
            BTC: wallet.addresses.BTC.address === recoveredAddresses.BTC.address,
            ETH: wallet.addresses.ETH.address === recoveredAddresses.ETH.address
        };

        console.log('\n Recovery Validation:');
        console.log('Verus Match:', validations.VRSC ? '✅' : '❌');
        console.log('Bitcoin Match:', validations.BTC ? '✅' : '❌');
        console.log('Ethereum Match:', validations.ETH ? '✅' : '❌');

        if (Object.values(validations).every(v => v)) {
            console.log('\n All addresses recovered successfully!');
        } else {
            console.log('\n Recovery mismatch detected!');
            process.exit(1);
        }
    } catch (error) {
        console.error('Test failed:', error);
        process.exit(1);
    }
})();