// Crypto utility functions for secure key management
import { Buffer } from 'buffer';
import crypto from 'crypto-browserify';

const SALT_LENGTH = 32; // Increased from 16
const IV_LENGTH = 16; // Increased from 12
const KEY_LENGTH = 32;
const ITERATIONS = 310000; // Increased from 100000
const AUTH_TAG_LENGTH = 16;
const MEMORY_CLEANUP_DELAY = 30000; // 30 seconds

/**
 * Encrypts sensitive data using AES-256-GCM with enhanced security
 * @param {string} data - Data to encrypt
 * @param {string} password - User's password
 * @returns {Promise<string>} - Encrypted data as base64 string
 */
export async function encrypt(data, password) {
  try {
    // Generate salt and derive key
    const salt = crypto.randomBytes(SALT_LENGTH);
    const key = await deriveKey(password, salt);
    
    // Generate IV and create cipher
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    
    // Encrypt the data
    let encrypted = cipher.update(data, 'utf8', 'base64');
    encrypted += cipher.final('base64');
    const authTag = cipher.getAuthTag();
    
    // Combine all components
    const combined = Buffer.concat([
      Buffer.from([1]), // Version byte for future compatibility
      salt,
      iv,
      authTag,
      Buffer.from(encrypted, 'base64')
    ]);

    const result = combined.toString('base64');
    
    // Securely clear key from memory
    secureMemoryCleanup(key);
    
    return result;
  } catch (error) {
    console.error('Encryption failed:', error);
    throw new Error(`Encryption failed: ${error.message}`);
  }
}

/**
 * Decrypts encrypted data using AES-256-GCM
 * @param {string} encryptedData - Encrypted data as base64 string
 * @param {string} password - User's password
 * @returns {Promise<string>} - Decrypted data
 */
export async function decrypt(encryptedData, password) {
  try {
    // Convert from base64 and extract components
    const combined = Buffer.from(encryptedData, 'base64');
    
    // Check version byte
    const version = combined[0];
    let offset = 1; // Skip version byte
    
    if (version !== 1) {
      // For backward compatibility with existing data
      offset = 0;
    }
    
    const salt = combined.slice(offset, offset + SALT_LENGTH);
    const iv = combined.slice(offset + SALT_LENGTH, offset + SALT_LENGTH + IV_LENGTH);
    const authTag = combined.slice(offset + SALT_LENGTH + IV_LENGTH, offset + SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH);
    const encrypted = combined.slice(offset + SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH);
    
    // Derive the key
    const key = await deriveKey(password, salt);
    
    // Create decipher
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    
    // Decrypt the data
    let decrypted;
    try {
      decrypted = decipher.update(encrypted, undefined, 'utf8');
      decrypted += decipher.final('utf8');
    } catch (error) {
      throw new Error('Invalid password or corrupted data');
    }
    
    // Securely clear key from memory
    secureMemoryCleanup(key);
    
    return decrypted;
  } catch (error) {
    console.error('Decryption failed:', error);
    throw new Error(`Decryption failed: ${error.message}`);
  }
}

/**
 * Derives an encryption key from a password using PBKDF2 with enhanced parameters
 * @param {string} password - User's password
 * @param {Buffer} salt - Salt for key derivation
 * @returns {Promise<Buffer>} - Derived key
 */
async function deriveKey(password, salt) {
  return new Promise((resolve, reject) => {
    crypto.pbkdf2(
      password,
      salt,
      ITERATIONS,
      KEY_LENGTH,
      'sha512', // Upgraded from sha256
      (err, derivedKey) => {
        if (err) {
          reject(new Error(`Key derivation failed: ${err.message}`));
        } else {
          resolve(derivedKey);
        }
      }
    );
  });
}

/**
 * Creates a hash of a password for comparison (not for key derivation)
 * @param {string} password - Password to hash
 * @param {Buffer} [salt] - Optional salt, generated if not provided
 * @returns {Promise<{hash: string, salt: Buffer}>} - Hash and salt
 */
export async function hashPassword(password, existingSalt = null) {
  const salt = existingSalt || crypto.randomBytes(SALT_LENGTH);
  
  return new Promise((resolve, reject) => {
    crypto.pbkdf2(
      password,
      salt,
      ITERATIONS,
      KEY_LENGTH,
      'sha512',
      (err, derivedKey) => {
        if (err) {
          reject(new Error(`Password hashing failed: ${err.message}`));
        } else {
          resolve({
            hash: derivedKey.toString('hex'),
            salt: salt
          });
        }
      }
    );
  });
}

/**
 * Verifies a password against a hash
 * @param {string} password - Password to verify
 * @param {string} storedHash - Stored hash
 * @param {Buffer} salt - Salt used for hashing
 * @returns {Promise<boolean>} - Whether password is valid
 */
export async function verifyPassword(password, storedHash, salt) {
  const { hash } = await hashPassword(password, salt);
  return hash === storedHash;
}

/**
 * Alias for verifyPassword to maintain compatibility
 */
export const verifyHash = verifyPassword;

/**
 * Securely clears sensitive data from memory
 * @param {Buffer} buffer - Buffer containing sensitive data
 */
export function secureMemoryCleanup(buffer) {
  if (buffer && Buffer.isBuffer(buffer)) {
    // Overwrite with random data
    crypto.randomFillSync(buffer);
    
    // Schedule another overwrite with zeros after a delay
    setTimeout(() => {
      if (buffer && Buffer.isBuffer(buffer)) {
        buffer.fill(0);
      }
    }, MEMORY_CLEANUP_DELAY);
  }
}

/**
 * Generate a secure unique ID with specified length
 * @param {number} length - Length of the ID to generate
 * @returns {string} - Random ID in hex format
 */
export function generateSecureId(length = 32) {
  return crypto.randomBytes(length).toString('hex');
}
