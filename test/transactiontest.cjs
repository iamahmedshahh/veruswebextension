const pkg = require('@bitgo/utxo-lib');
const { ECPair, TransactionBuilder } = pkg;

// Static configuration
const TEST_PRIVATE_KEY = '';
const TEST_FROM_ADDRESS = '';
const TEST_TO_ADDRESS = '';

// Network configuration for Verus
const NETWORK = {
    messagePrefix: '\x18Verus Coin Signed Message:\n',
    bech32: 'bc',
    bip32: {
        public: 0x0488b21e,
        private: 0x0488ade4
    },
    pubKeyHash: 0x3c,
    scriptHash: 0x55,
    wif: 0xBC,
    consensusBranchId: {
        1: 0x00,
        2: 0x00,
        3: 0x5ba81b19,
        4: 0x76b809bb
    },
    isZcash: true,
    overwinter: {
        activationHeight: 1,
        version: 4,
        versionGroupId: 0x892f2085
    },
    coin: 'verus'
};

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

// Function to resolve Verus ID to transparent address
async function resolveVerusId(verusId) {
    try {
        console.log('Resolving Verus ID:', verusId);
        
        // Validate Verus ID format
        if (!verusId.startsWith('i')) {
            throw new Error('Not a valid Verus ID format - must start with "i"');
        }

        const response = await makeRPCCall('getidentity', [verusId]);
        console.log('Identity info:', JSON.stringify(response, null, 2));
        
        if (!response || !response.identity) {
            throw new Error(`Could not resolve Verus ID: ${verusId}`);
        }

        const identityInfo = response.identity;

        // Check for identity address in different possible locations
        // First try primary addresses
        if (identityInfo.primaryaddresses && identityInfo.primaryaddresses.length > 0) {
            const primaryAddress = identityInfo.primaryaddresses[0];
            console.log('Found primary address:', primaryAddress);
            return primaryAddress;
        }

        // Then try identity address
        if (identityInfo.identityaddress) {
            console.log('Found identity address:', identityInfo.identityaddress);
            return identityInfo.identityaddress;
        }

        throw new Error(`No valid address found for Verus ID: ${verusId}`);
    } catch (error) {
        console.error('Error resolving Verus ID:', error);
        if (error.message.includes('has no matching Script')) {
            throw new Error(`Invalid destination address format for Verus ID: ${verusId}`);
        }
        throw error;
    }
}

async function sendCurrency(fromAddress, toAddress, amount, privateKeyWIF, currency = 'VRSCTEST') {
    try {
        console.log('Starting sendCurrency with params:', { fromAddress, toAddress, amount, currency });
        
        // Check if the destination is a Verus ID (starts with 'i')
        let resolvedToAddress = toAddress;
        if (toAddress.startsWith('i')) {
            console.log('Destination appears to be a Verus ID, resolving...');
            resolvedToAddress = await resolveVerusId(toAddress);
            console.log('Resolved destination address:', resolvedToAddress);
        }

        // Validate private key format
        if (!privateKeyWIF) {
            throw new Error('Private key is required');
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
        
        // Set version for Verus
        txBuilder.setVersion(NETWORK.overwinter.version);
        txBuilder.setVersionGroupId(NETWORK.overwinter.versionGroupId);

        // Add all inputs
        let runningTotal = BigInt(0);
        for (const utxo of relevantUtxos) {
            txBuilder.addInput(utxo.txid, utxo.outputIndex);
            runningTotal += BigInt(utxo.satoshis);
            console.log('Running total:', Number(runningTotal) / SATS_PER_COIN, currency);
        }

        // Calculate output amounts
        const satoshisToSend = BigInt(Math.floor(amountToSend * SATS_PER_COIN));
        const fee = BigInt(10000); // Lower fee: 0.0001 VRSC
        
        if (runningTotal < satoshisToSend + fee) {
            throw new Error(`Insufficient funds. Required: ${Number(satoshisToSend + fee) / SATS_PER_COIN} ${currency}, Available: ${Number(runningTotal) / SATS_PER_COIN} ${currency}`);
        }

        // Add recipient output
        txBuilder.addOutput(resolvedToAddress, Number(satoshisToSend));

        // Calculate and add change output
        const changeAmount = Number(runningTotal - satoshisToSend - fee);
        if (changeAmount > 546) { // Dust threshold
            txBuilder.addOutput(fromAddress, changeAmount);
            console.log('Change output added:', changeAmount / SATS_PER_COIN, currency);
        }

        // Sign each input
        const keyPair = ECPair.fromWIF(privateKeyWIF, NETWORK);
        
        // Sign all inputs with SIGHASH_ALL
        for (let i = 0; i < relevantUtxos.length; i++) {
            txBuilder.sign(i, keyPair, null, pkg.Transaction.SIGHASH_ALL, relevantUtxos[i].satoshis);
        }

        // Build and serialize the transaction
        const tx = txBuilder.build();
        const serializedTx = tx.toHex();
        console.log('Transaction built and serialized');
        console.log('Raw transaction:', serializedTx);

        // Broadcast transaction
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
