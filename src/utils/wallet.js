import { Buffer } from 'buffer';
import browser from 'webextension-polyfill';
import { encrypt, decrypt } from './crypto.js';
import { 
  getAddressBalance,
  getAddressUtxos,
  createRawTransaction,
  sendRawTransaction,
  getTransaction,
  testConnection
} from './verus-rpc.js';
import crypto from 'crypto-browserify';
import * as bitgo from '@bitgo/utxo-lib';

// Network configuration for Verus (both mainnet and testnet use same address format)
const NETWORK = {
  messagePrefix: '\x18Verus Signed Message:\n',
  bip32: {
    public: 0x0488B21E,
    private: 0x0488ADE4
  },
  pubKeyHash: 0x3c,     // Verus address version (starts with R)
  scriptHash: 0x3d,     // Verus P2SH version
  wif: 0xBC,           // Verus WIF version
  coin: 'vrsc'
};

/**
 * Creates a new wallet with password protection
 * @param {string} password - Password to encrypt the wallet
 * @returns {Promise<{address: string, error?: string}>}
 */
export async function createWallet(password) {
  try {
    console.log('Starting wallet creation process');
    
    // Generate wallet seed
    const entropy = crypto.randomBytes(32); // 256 bits of entropy
    const mnemonic = bitgo.bip39.entropyToMnemonic(entropy);
    const seed = bitgo.bip39.mnemonicToSeedSync(mnemonic);
    
    // Derive the master key (BIP32)
    const master = bitgo.bip32.fromSeed(seed, NETWORK);
    
    // Derive the first account's external chain
    // m/44'/19167'/0'/0/0 for VRSC
    const path = "m/44'/19167'/0'/0/0";
    const child = master.derivePath(path);
    
    // Create key pair and address
    const keyPair = bitgo.ECPair.fromPrivateKey(child.privateKey, { network: NETWORK });
    const { address } = bitgo.payments.p2pkh({ 
      pubkey: keyPair.publicKey,
      network: NETWORK 
    });

    console.log('Generated Verus address:', address);
    
    if (!address.startsWith('R')) {
      throw new Error('Generated address does not match Verus format');
    }
    
    // Store encrypted data
    const privateKeyHex = keyPair.privateKey.toString('hex');
    const encryptedPrivateKey = await encrypt(privateKeyHex, password);
    const encryptedMnemonic = await encrypt(mnemonic, password);
    
    await browser.storage.local.set({
      encryptedPrivateKey,
      encryptedMnemonic,
      address,
      network: 'testnet', // We're using testnet but address format is same
      path,
      coin: 'VRSCTEST'
    });

    return { address };
  } catch (error) {
    console.error('Failed to create wallet:', error);
    return { error: error.message || 'Failed to create wallet' };
  }
}

/**
 * Signs and sends a transaction
 * @param {string} password - Wallet password
 * @param {string} toAddress - Recipient address
 * @param {number} amount - Amount in VRSC
 * @param {string} memo - Optional memo
 * @returns {Promise<{txid: string, error?: string}>}
 */
export async function sendTransaction(password, toAddress, amount, memo = '') {
  try {
    // Get wallet data
    const { encryptedPrivateKey, address, path } = await browser.storage.local.get(['encryptedPrivateKey', 'address', 'path']);
    if (!encryptedPrivateKey) throw new Error('Wallet not found');

    // Decrypt private key
    const privateKey = await decrypt(encryptedPrivateKey, password);
    const master = bitgo.bip32.fromSeed(bitgo.bip39.mnemonicToSeedSync(await decrypt(await browser.storage.local.get('encryptedMnemonic'), password)), NETWORK);
    const child = master.derivePath(path);
    const keyPair = bitgo.ECPair.fromPrivateKey(child.privateKey, { network: NETWORK });

    // Get UTXOs
    const utxos = await getAddressUtxos(address);
    if (!utxos.length) throw new Error('No funds available');

    // Create and sign transaction
    const tx = new bitgo.TransactionBuilder(NETWORK);
    
    let totalInput = 0;
    utxos.forEach(utxo => {
      tx.addInput(utxo.txid, utxo.vout);
      totalInput += utxo.satoshis;
    });

    const satoshiAmount = Math.floor(amount * 1e8);
    const fee = 10000; // 0.0001 VRSC
    
    if (totalInput < satoshiAmount + fee) {
      throw new Error('Insufficient funds');
    }

    // Add outputs
    tx.addOutput(toAddress, satoshiAmount);
    if (totalInput > satoshiAmount + fee) {
      tx.addOutput(address, totalInput - satoshiAmount - fee);
    }

    // Sign all inputs
    utxos.forEach((_, index) => {
      tx.sign(index, keyPair);
    });

    // Broadcast transaction
    const rawTx = tx.build().toHex();
    const txid = await sendRawTransaction(rawTx);

    return { txid };
  } catch (error) {
    console.error('Failed to send transaction:', error);
    return { error: error.message || 'Failed to send transaction' };
  }
}

/**
 * Gets the balance for a wallet address
 * @param {string} address - Wallet address
 * @returns {Promise<number>} Balance in VRSC
 */
export async function getBalance(address) {
  try {
    const balance = await getAddressBalance(address);
    return balance;
  } catch (error) {
    console.error('Failed to get balance:', error);
    return 0;
  }
}

/**
 * Tests connection to the Verus RPC server
 * @returns {Promise<boolean>}
 */
export async function checkConnection() {
  try {
    console.log('Starting connection test to Verus network');
    console.log('RPC Server:', import.meta.env.VITE_VRSCTEST_RPC_SERVER);
    
    const response = await fetch(import.meta.env.VITE_VRSCTEST_RPC_SERVER, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: Date.now(),
        method: 'getinfo',
        params: []
      })
    });

    console.log('Connection test response status:', response.status);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Connection test failed with status', response.status, errorText);
      return false;
    }

    const data = await response.json();
    console.log('Connection test response:', data);

    if (data.error) {
      console.error('Connection test RPC error:', data.error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Connection test failed with error:', error);
    return false;
  }
}

/**
 * Validates a Verus address
 * @param {string} address - Address to validate
 * @returns {boolean} Whether the address is valid
 */
export function validateAddress(address) {
  if (!address || typeof address !== 'string') {
    return false;
  }

  if (address.length !== 34) {
    return false;
  }

  const network = getAddressNetwork(address);
  return network !== null;
}

/**
 * Gets the network type for an address
 * @param {string} address - Verus address
 * @returns {'mainnet' | 'testnet' | null} Network type
 */
export function getAddressNetwork(address) {
  if (!address || typeof address !== 'string') {
    return null;
  }

  if (address.startsWith('R')) {
    return 'testnet';
  }

  return null;
}

/**
 * Gets transaction history for a wallet
 * @param {string} address - Wallet address
 * @returns {Promise<Array>} Array of transactions
 */
export async function getWalletHistory(address) {
  try {
    // TODO: Implement proper transaction history retrieval
    return [];
  } catch (error) {
    console.error('Failed to get wallet history:', error);
    return [];
  }
}