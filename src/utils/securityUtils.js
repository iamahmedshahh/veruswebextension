/**
 * Security Utilities for Verus Web Extension
 * Provides centralized security functions and policies
 */

import { encrypt, decrypt, verifyPassword } from './crypto';

// Security policy settings
const SECURITY_POLICY = {
  // Session management
  SESSION_TIMEOUT_MS: 30 * 60 * 1000, // 30 minutes default session timeout
  SESSION_EXTENSION_MS: 15 * 60 * 1000, // 15 minutes added when session is extended
  
  // Password policy
  PASSWORD_MIN_LENGTH: 12,
  PASSWORD_REQUIRE_UPPERCASE: true,
  PASSWORD_REQUIRE_LOWERCASE: true,
  PASSWORD_REQUIRE_NUMBER: true,
  PASSWORD_REQUIRE_SPECIAL: true,
  PASSWORD_MIN_STRENGTH: 60, // Minimum acceptable strength (0-100)
  
  // Login security
  MAX_LOGIN_ATTEMPTS: 5,
  ACCOUNT_LOCKOUT_DURATION_MS: 30 * 1000, // 30 seconds
  
  // Memory protection
  MEMORY_CLEANUP_INTERVAL_MS: 5 * 60 * 1000, // Clean memory every 5 minutes
  SENSITIVE_DATA_TIMEOUT_MS: 60 * 1000, // Sensitive data auto-cleanup after 1 minute
};

/**
 * Checks if a password meets the minimum requirements
 * @param {string} password - The password to check
 * @returns {Object} Result with isValid and reasons if invalid
 */
export function validatePasswordStrength(password) {
  const result = {
    isValid: true,
    reasons: [],
    strength: 0,
    hasMinLength: false,
    hasUppercase: false, 
    hasLowercase: false,
    hasNumber: false,
    hasSpecial: false
  };
  
  // Check individual requirements
  result.hasMinLength = password.length >= SECURITY_POLICY.PASSWORD_MIN_LENGTH;
  result.hasUppercase = /[A-Z]/.test(password);
  result.hasLowercase = /[a-z]/.test(password);
  result.hasNumber = /[0-9]/.test(password);
  result.hasSpecial = /[^A-Za-z0-9]/.test(password);
  
  // Calculate strength
  let strength = 0;
  
  // Length contributes up to 25%
  strength += Math.min(password.length * 2, 25);
  
  // Each character type contributes 15%
  if (result.hasUppercase) strength += 15;
  if (result.hasLowercase) strength += 15;
  if (result.hasNumber) strength += 15;
  if (result.hasSpecial) strength += 15;
  
  // Entropy bonus for longer passwords up to 15%
  if (password.length > 14) strength += Math.min((password.length - 14) * 2, 15);
  
  result.strength = Math.min(strength, 100);
  
  // Validate against policy
  if (SECURITY_POLICY.PASSWORD_REQUIRE_UPPERCASE && !result.hasUppercase) {
    result.isValid = false;
    result.reasons.push('Password must contain at least one uppercase letter');
  }
  
  if (SECURITY_POLICY.PASSWORD_REQUIRE_LOWERCASE && !result.hasLowercase) {
    result.isValid = false;
    result.reasons.push('Password must contain at least one lowercase letter');
  }
  
  if (SECURITY_POLICY.PASSWORD_REQUIRE_NUMBER && !result.hasNumber) {
    result.isValid = false;
    result.reasons.push('Password must contain at least one number');
  }
  
  if (SECURITY_POLICY.PASSWORD_REQUIRE_SPECIAL && !result.hasSpecial) {
    result.isValid = false;
    result.reasons.push('Password must contain at least one special character');
  }
  
  if (password.length < SECURITY_POLICY.PASSWORD_MIN_LENGTH) {
    result.isValid = false;
    result.reasons.push(`Password must be at least ${SECURITY_POLICY.PASSWORD_MIN_LENGTH} characters`);
  }
  
  if (result.strength < SECURITY_POLICY.PASSWORD_MIN_STRENGTH) {
    result.isValid = false;
    result.reasons.push('Password is not strong enough');
  }
  
  return result;
}

/**
 * Securely disposes of sensitive data in memory
 * @param {Object} obj - Object containing sensitive data
 * @param {Array} sensitiveKeys - Keys of sensitive properties to clear
 */
export function secureClearMemory(obj, sensitiveKeys) {
  if (!obj || typeof obj !== 'object') return;
  
  sensitiveKeys.forEach(key => {
    if (obj[key]) {
      if (typeof obj[key] === 'string') {
        // Overwrite with zeros first
        obj[key] = '0'.repeat(obj[key].length);
      } else if (Array.isArray(obj[key])) {
        // Fill array with zeros
        obj[key].fill(0);
      } else if (typeof obj[key] === 'object') {
        // Recursively clear object properties
        Object.keys(obj[key]).forEach(k => {
          secureClearMemory(obj[key], [k]);
        });
      }
      
      // Then set to undefined/empty
      if (Array.isArray(obj[key])) {
        obj[key] = [];
      } else if (typeof obj[key] === 'object') {
        obj[key] = {};
      } else {
        obj[key] = '';
      }
    }
  });
  
  // Force garbage collection hints (not guaranteed but helpful)
  setTimeout(() => {
    sensitiveKeys.forEach(key => {
      obj[key] = null;
    });
  }, 0);
}

/**
 * Creates a new session with timeout
 * @param {string} userId - User identifier
 * @returns {Object} Session data
 */
export function createSession(userId) {
  const now = Date.now();
  return {
    userId,
    issuedAt: now,
    expiresAt: now + SECURITY_POLICY.SESSION_TIMEOUT_MS,
    sessionId: generateSessionId(),
  };
}

/**
 * Validates if a session is still valid
 * @param {Object} session - Session data
 * @returns {boolean} True if session is valid
 */
export function isSessionValid(session) {
  if (!session || !session.expiresAt) return false;
  return Date.now() < session.expiresAt;
}

/**
 * Extends a session's expiration time
 * @param {Object} session - Session data
 * @returns {Object} Updated session data
 */
export function extendSession(session) {
  if (!session) return null;
  
  const updatedSession = { ...session };
  updatedSession.expiresAt = Date.now() + SECURITY_POLICY.SESSION_EXTENSION_MS;
  return updatedSession;
}

/**
 * Generates a unique session ID
 * @returns {string} Session ID
 */
function generateSessionId() {
  return Math.random().toString(36).substring(2, 15) + 
         Math.random().toString(36).substring(2, 15) +
         Date.now().toString(36);
}

/**
 * Applies constant-time comparison to prevent timing attacks
 * @param {string} a - First string
 * @param {string} b - Second string
 * @returns {boolean} True if strings match
 */
export function secureCompare(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') {
    return false;
  }
  
  // Different lengths, early return but in constant time
  if (a.length !== b.length) {
    // Still do the comparison to ensure constant time
    let result = 0;
    const maxLength = Math.max(a.length, b.length);
    for (let i = 0; i < maxLength; i++) {
      result |= (i < a.length ? a.charCodeAt(i) : 0) ^ (i < b.length ? b.charCodeAt(i) : 0);
    }
    return false;
  }
  
  // Compare in constant time
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    // XOR the characters, any difference will make result non-zero
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  
  return result === 0;
}

/**
 * Checks if a value might contain sensitive data
 * @param {any} value - Value to check
 * @param {string} key - Key name (for context)
 * @returns {boolean} True if potentially sensitive
 */
export function isSensitiveData(value, key) {
  // Check key names that commonly contain sensitive data
  const sensitiveKeyPatterns = [
    /^priv(ate)?/i,
    /key/i,
    /secret/i,
    /token/i,
    /password/i,
    /mnemonic/i,
    /seed/i,
    /wallet/i,
    /crypt/i
  ];
  
  // Check if key matches sensitive patterns
  if (key && typeof key === 'string') {
    if (sensitiveKeyPatterns.some(pattern => pattern.test(key))) {
      return true;
    }
  }
  
  // Additional heuristics for values
  if (typeof value === 'string') {
    // Check for patterns that look like private keys/mnemonics
    if (value.length >= 64 && /^[A-Fa-f0-9]+$/.test(value)) {
      return true; // Potential hex private key
    }
    if (value.split(' ').length >= 12 && value.split(' ').length <= 24) {
      return true; // Potential mnemonic
    }
  }
  
  return false;
}

/**
 * Anti-debugging measures to protect code execution
 * Call periodically to deter tampering
 */
export function applyAntiDebugMeasures() {
  const startTime = Date.now();
  
  // Detection of DevTools through performance analysis
  setTimeout(() => {
    const endTime = Date.now();
    const elapsedTime = endTime - startTime;
    
    // Significant slowdown could indicate breakpoint/debugging
    if (elapsedTime > 100) {
      // Potential debugging detected
      console.warn("Abnormal code execution detected");
      // Additional protection measures could be implemented here
    }
  }, 0);
  
  // Further anti-debug measures could be added
}

export default {
  SECURITY_POLICY,
  validatePasswordStrength,
  secureClearMemory,
  createSession,
  isSessionValid,
  extendSession,
  secureCompare,
  isSensitiveData,
  applyAntiDebugMeasures
};
