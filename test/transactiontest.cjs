const pkg = require('@bitgo/utxo-lib');
const { ECPair, TransactionBuilder } = pkg;

// Static configuration
const TEST_PRIVATE_KEY = 'Your privkey here';
const TEST_FROM_ADDRESS = 'Your address here';
const TEST_TO_ADDRESS = 'Receiver address here';

// Network configuration for Verus
const NETWORK = pkg.networks.verustest

// RPC Configuration
const RPC_CONFIG = {
    server: 'https://api.verustest.net',
};

// Function to make RPC calls
async function makeRPCCall(method, params = [], config = RPC_CONFIG) {
    try {
        const response = await fetch(config.server, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: Date.now(),
                method,
                params
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
        }

        const data = await response.json();
        if (data.error) {
            throw new Error(data.error.message || 'Unknown RPC error');
        }

        return data.result;
    } catch (error) {
        console.error('RPC call failed:', error);
        throw error;
    }
}

async function sendCurrency(fromAddress, toAddress, amount, privateKeyWIF, currency = 'VRSCTEST') {
    try {
        console.log('Starting sendCurrency with params:', { fromAddress, toAddress, amount, currency });
        
        // Validate private key format
        if (!privateKeyWIF) {
            throw new Error('Private key is required');
        }

        // Validate that the private key is in WIF format
        try {
            ECPair.fromWIF(privateKeyWIF, NETWORK);
        } catch (error) {
            console.error('Invalid private key:', error);
            throw new Error('Invalid private key format. Must be in WIF format.');
        }

        // Convert amount to satoshis
        const SATS_PER_COIN = 1e8;
        const amountToSend = amount;
        const satoshiAmount = Math.floor(amountToSend * SATS_PER_COIN);
        console.log('Amount in satoshis:', satoshiAmount);
        
        // Step 1: Fetch UTXOs
        console.log('Fetching UTXOs for address:', fromAddress);
        const utxos = await makeRPCCall('getaddressutxos', [{
            addresses: [fromAddress],
            currencynames: true
        }]);
        
        if (!utxos || utxos.length === 0) {
            throw new Error('No UTXOs available');
        }

        console.log('Raw UTXOs:', JSON.stringify(utxos, null, 2));
        console.log('Found UTXOs:', utxos.length);

        // Filter UTXOs with VRSCTEST balance
        const relevantUtxos = utxos.filter(utxo => utxo.satoshis > 0);
        console.log('Relevant UTXOs:', JSON.stringify(relevantUtxos, null, 2));
        console.log('Relevant UTXOs for currency:', relevantUtxos.length);

        if (relevantUtxos.length === 0) {
            throw new Error(`No UTXOs available for ${currency}`);
        }

        // Build transaction
        const txBuilder = new TransactionBuilder(NETWORK);
        
        // Set version for Overwinter support
        txBuilder.setVersion(4);
        txBuilder.setVersionGroupId(0x892f2085);

        // Add all inputs
        let runningTotal = BigInt(0);
        for (const utxo of relevantUtxos) {
            txBuilder.addInput(utxo.txid, utxo.outputIndex);
            runningTotal += BigInt(utxo.satoshis);
            console.log('Running total:', Number(runningTotal) / SATS_PER_COIN, currency);
        }

        // Calculate output amounts
        const satoshisToSend = BigInt(Math.floor(amountToSend * SATS_PER_COIN));
        const fee = BigInt(20000); // 0.0002 VRSC fee
        
        if (runningTotal < satoshisToSend + fee) {
            throw new Error(`Insufficient funds. Required: ${Number(satoshisToSend + fee) / SATS_PER_COIN} ${currency}, Available: ${Number(runningTotal) / SATS_PER_COIN} ${currency}`);
        }

        // Add recipient output
        txBuilder.addOutput(toAddress, Number(satoshisToSend));

        // Calculate and add change output
        const changeAmount = Number(runningTotal - satoshisToSend - fee);
        if (changeAmount > 546) { // Dust threshold
            txBuilder.addOutput(fromAddress, changeAmount);
            console.log('Change output added:', changeAmount / SATS_PER_COIN, currency);
        }

        // Sign each input
        const keyPair = ECPair.fromWIF(privateKeyWIF, NETWORK);
        for (let i = 0; i < relevantUtxos.length; i++) {
            txBuilder.sign(
                i,
                keyPair,
                null,
                pkg.Transaction.SIGHASH_ALL,
                relevantUtxos[i].satoshis
            );
        }

        // Build and serialize the transaction
        const tx = txBuilder.build();
        const serializedTx = tx.toHex();
        console.log('Transaction built and serialized');

        // Step 8: Broadcast transaction
        console.log('Broadcasting transaction...');
        const txid = await makeRPCCall('sendrawtransaction', [serializedTx]);
        
        console.log('Transaction broadcast successful. TXID:', txid);
        return { txid };
    } catch (error) {
        console.error('Error in sendCurrency:', error);
        throw error;
    }
}

// Run the transaction with static values
async function runTransaction() {
    try {
        const result = await sendCurrency(
            TEST_FROM_ADDRESS,
            TEST_TO_ADDRESS,
            60, // amount in VRSCTEST
            TEST_PRIVATE_KEY
        );
        console.log('Transaction Result:', result);
    } catch (error) {
        console.error('Transaction failed:', error);
    }
}

// Execute the transaction
runTransaction();
