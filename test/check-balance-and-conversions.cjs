const { makeRPCCall } = require('./transactiontest.cjs');

const address = 'RV2sJNR3Vi5nJT5h7AsNah7gPKTQaJ8e2L';

(async () => {
  try {
    // Get all UTXOs for the address
    const utxos = await makeRPCCall('getaddressutxos', [{ addresses: [address] }]);
    console.log('\nUTXOs:', utxos);

    // Get balances for all currencies
    const balance = await makeRPCCall('getaddressbalance', [{ addresses: [address] }]);
    console.log('\nBalance:', balance);

    // Try to get pending conversions (if supported)
    try {
      const pending = await makeRPCCall('getpendingconversions', [address]);
      console.log('\nPending conversions:', pending);
    } catch (e) {
      console.log('\nPending conversions RPC not available on this node.');
    }
  } catch (err) {
    console.error('Error checking address:', err);
  }
})();