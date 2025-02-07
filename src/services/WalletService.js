import { Buffer } from 'buffer';
import * as bitgo from '@bitgo/utxo-lib';
import BigInteger from 'bigi';
import bip39 from 'bip39';
import crypto from 'crypto';
import bs58check from 'bs58check';
import * as ethUtil from 'ethereumjs-util';
import bcrypt from 'bcryptjs';

const lib = bitgo.default;

const NETWORK_CONFIG = {
    verus: lib.networks.verus,
    verustest: lib.networks.verustest,
    bitcoin: lib.networks.bitcoin
};

const VERUS_NETWORK = import.meta.env.VITE_VERUS_NETWORK === 'testnet' 
    ? NETWORK_CONFIG.verustest 
    : NETWORK_CONFIG.verus;

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

    return {
        pub: keyPair.getAddress(),
        pubHex: keyPair.getPublicKeyBuffer().toString('hex'),
        priv: keyPair.toWIF()
    };
}

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
    let seedIsEthPrivkey = false;
    try {
        if (seed.length === 66 && seed.startsWith('0x')) {
            const privKeyBuf = Buffer.from(seed.slice(2), 'hex');
            if (privKeyBuf.length === 32) {
                seedIsEthPrivkey = true;
            }
        }
    } catch(e) {}

    const electrumKeys = seedToWif(seed, NETWORK_CONFIG.bitcoin, true);
    const pubKeyBuffer = Buffer.from(electrumKeys.pubHex, 'hex');
    
    const addressBuffer = ethUtil.pubToAddress(pubKeyBuffer, true);
    const ethAddress = ethUtil.toChecksumAddress('0x' + addressBuffer.toString('hex'));
    
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
            if (!mnemonic) {
                const entropy = crypto.randomBytes(32);
                mnemonic = bip39.entropyToMnemonic(entropy);
            }

            if (!bip39.validateMnemonic(mnemonic)) {
                throw new Error('Invalid mnemonic');
            }

            // Generate addresses using agama-wallet-lib approach
            const vrscKeys = seedToWif(mnemonic, VERUS_NETWORK, true);
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