const { testConversionTransactionWithUTXO, TEST_PRIVATE_KEY } = require('./transactiontest.cjs');

// Define test parameters
const fromAddress = 'RV2sJNR3Vi5nJT5h7AsNah7gPKTQaJ8e2L';
const toAddress = 'RV2sJNR3Vi5nJT5h7AsNah7gPKTQaJ8e2L';
const amount = 1;
const currency = 'VRSCTEST';
const convertTo = 'iCtawpxUiCc2sEupt7Z4u8SDAncGZpgSKm'; // vETH
const privateKey = TEST_PRIVATE_KEY;
const viaCurrency = 'iSojYsotVzXz4wh2eJriASGo6UidJDDhL2'; // bridge.veth

console.log(`Testing UTXO conversion transaction: ${amount} from ${fromAddress} to ${toAddress} converting to ${convertTo} via ${viaCurrency}`);

// Run the conversion transaction test
testConversionTransactionWithUTXO({
    fromAddress,
    toAddress,
    amount,
    currency,
    convertTo,
    viaCurrency,
    privateKey
})
    .then(result => {
        console.log('Conversion transaction complete:', JSON.stringify(result, null, 2));
    })
    .catch(error => {
        console.error('Error:', error);
    });
