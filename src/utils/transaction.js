/**
 * Convert satoshis to the main currency unit (e.g., VRSC)
 * @param {number|string} satoshis - The amount in satoshis
 * @param {number} [decimals=8] - Number of decimal places (default: 8 for VRSC)
 * @returns {number} The converted amount in the main currency unit
 */
export function fromSatoshis(satoshis, decimals = 8) {
  const satoshisNum = typeof satoshis === 'string' ? parseFloat(satoshis) : satoshis;
  if (isNaN(satoshisNum)) {
    console.error('Invalid satoshis value:', satoshis);
    return 0;
  }
  return satoshisNum / Math.pow(10, decimals);
}

// Transaction functionality is currently disabled
export const sendCurrency = async () => {
  throw new Error('Sending functionality is currently disabled');
};

export const estimateFee = () => 0.0001; // Default fee

export const validateAddress = () => false; // Always return false as validation is disabled