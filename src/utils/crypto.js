// Crypto utility functions for secure key management
import { Buffer } from 'buffer';
import crypto from 'crypto-browserify';

const SALT_LENGTH = 16;
const IV_LENGTH = 12;
const KEY_LENGTH = 32;
const ITERATIONS = 100000;

/**
 * Encrypts sensitive data using AES-GCM
 * @param {string} data - Data to encrypt
 * @param {string} password - User's password
 * @returns {Promise<string>} - Encrypted data as base64 string
 */
export async function encrypt(data, password) {
  try {
    console.log('Starting encryption process');
    
    // Generate salt and derive key
    console.log('Generating salt and deriving key');
    const salt = crypto.randomBytes(SALT_LENGTH);
    const key = await deriveKey(password, salt);
    console.log('Key derived successfully');
    
    // Generate IV and create cipher
    console.log('Setting up encryption');
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    
    // Encrypt the data
    console.log('Encrypting data');
    let encrypted = cipher.update(data, 'utf8', 'base64');
    encrypted += cipher.final('base64');
    const authTag = cipher.getAuthTag();
    console.log('Data encrypted successfully');

    // Combine all components
    console.log('Combining encrypted components');
    const combined = Buffer.concat([
      salt,
      iv,
      authTag,
      Buffer.from(encrypted, 'base64')
    ]);

    const result = combined.toString('base64');
    console.log('Encryption completed successfully');
    return result;
  } catch (error) {
    console.error('Encryption failed:', error);
    throw new Error(`Encryption failed: ${error.message}`);
  }
}

/**
 * Decrypts encrypted data using AES-GCM
 * @param {string} encryptedData - Encrypted data as base64 string
 * @param {string} password - User's password
 * @returns {Promise<string>} - Decrypted data
 */
export async function decrypt(encryptedData, password) {
  try {
    console.log('Starting decryption process');
    
    // Convert from base64 and extract components
    const combined = Buffer.from(encryptedData, 'base64');
    
    const salt = combined.slice(0, SALT_LENGTH);
    const iv = combined.slice(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
    const authTag = combined.slice(SALT_LENGTH + IV_LENGTH, SALT_LENGTH + IV_LENGTH + 16);
    const encrypted = combined.slice(SALT_LENGTH + IV_LENGTH + 16);
    
    // Derive the key
    console.log('Deriving key for decryption');
    const key = await deriveKey(password, salt);
    
    // Create decipher
    console.log('Setting up decryption');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    
    // Decrypt the data
    console.log('Decrypting data');
    let decrypted = decipher.update(encrypted, 'base64', 'utf8');
    decrypted += decipher.final('utf8');
    
    console.log('Decryption completed successfully');
    return decrypted;
  } catch (error) {
    console.error('Decryption failed:', error);
    throw new Error(`Decryption failed: ${error.message}`);
  }
}

/**
 * Derives an encryption key from a password using PBKDF2
 * @param {string} password - User's password
 * @param {Buffer} salt - Salt for key derivation
 * @returns {Promise<Buffer>} - Derived key
 */
async function deriveKey(password, salt) {
  console.log('Starting key derivation');
  return new Promise((resolve, reject) => {
    crypto.pbkdf2(
      password,
      salt,
      ITERATIONS,
      KEY_LENGTH,
      'sha256',
      (err, derivedKey) => {
        if (err) {
          console.error('Key derivation failed:', err);
          reject(new Error(`Key derivation failed: ${err.message}`));
        } else {
          console.log('Key derived successfully');
          resolve(derivedKey);
        }
      }
    );
  });
}
