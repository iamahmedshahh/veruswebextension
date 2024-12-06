import { makeRPCCall } from '../utils/verus-rpc';

export class VerusRPCService {
    constructor() {
        this.initialized = false;
    }

    async initialize() {
        try {
            await makeRPCCall('getinfo', []);
            this.initialized = true;
        } catch (error) {
            console.error('Failed to initialize RPC:', error);
            throw new Error('Failed to connect to Verus RPC server');
        }
    }

    async getBalance(address, currency = 'VRSCTEST') {
        if (!address) {
            console.error('No address provided for balance check');
            return 0;
        }

        try {
            // Get UTXOs for more detailed balance information
            const utxoResponse = await makeRPCCall('getaddressutxos', [{
                addresses: [address],
                currencynames: true
            }]);
            
            console.log('UTXO response for', currency, ':', utxoResponse);
            
            if (!utxoResponse || !Array.isArray(utxoResponse)) {
                return 0;
            }

            // Filter UTXOs for the target currency
            const relevantUtxos = utxoResponse.filter(utxo => {
                const hasCurrencyInNames = utxo.currencynames && utxo.currencynames[currency];
                const hasCurrencyInValues = utxo.currencyvalues && utxo.currencyvalues[currency];
                const isNativeCurrency = currency === 'VRSCTEST';
                const hasNativeBalance = isNativeCurrency && utxo.satoshis > 0;
                
                return hasCurrencyInNames || hasCurrencyInValues || hasNativeBalance;
            });

            // Calculate total balance
            let totalBalance = 0;
            relevantUtxos.forEach(utxo => {
                if (currency === 'VRSCTEST') {
                    totalBalance += (utxo.satoshis || 0) / 100000000; // Convert satoshis to VRSCTEST
                } else {
                    const amountFromNames = utxo.currencynames?.[currency] || 0;
                    const amountFromValues = utxo.currencyvalues?.[currency] || 0;
                    totalBalance += parseFloat(amountFromNames || amountFromValues);
                }
            });

            return totalBalance;
        } catch (error) {
            console.error(`Error fetching balance for ${currency}:`, error);
            return 0;
        }
    }

    async getAllCurrencyBalances(address) {
        if (!address) {
            console.error('No address provided for balance check');
            return {};
        }

        try {
            // Get UTXOs for the address
            const utxoResponse = await makeRPCCall('getaddressutxos', [{
                addresses: [address],
                currencynames: true
            }]);

            // Get currency definitions
            const currencyList = await this.listCurrencies();
            const currencyMap = {};
            
            // Create a map of currency IDs to their fully qualified names
            if (Array.isArray(currencyList)) {
                currencyList.forEach(currency => {
                    if (currency?.currencydefinition) {
                        const def = currency.currencydefinition;
                        const id = def.currencyid;
                        const name = def.fullyqualifiedname || def.name;
                        currencyMap[id] = name;
                    }
                });
            }
            console.log('Currency map:', currencyMap);

            const balances = {};
            
            if (!utxoResponse || !Array.isArray(utxoResponse)) {
                return balances;
            }

            // Process each UTXO
            utxoResponse.forEach(utxo => {
                // Handle native currency (VRSCTEST)
                if (utxo.satoshis > 0) {
                    const nativeCurrency = 'VRSCTEST';
                    balances[nativeCurrency] = (balances[nativeCurrency] || 0) + (utxo.satoshis / 100000000);
                }

                // Handle other currencies from currencynames
                if (utxo.currencynames) {
                    Object.entries(utxo.currencynames).forEach(([currencyId, amount]) => {
                        const currencyName = currencyMap[currencyId] || currencyId;
                        balances[currencyName] = (balances[currencyName] || 0) + parseFloat(amount);
                    });
                }

                // Handle currencies from currencyvalues
                if (utxo.currencyvalues) {
                    Object.entries(utxo.currencyvalues).forEach(([currencyId, amount]) => {
                        const currencyName = currencyMap[currencyId] || currencyId;
                        balances[currencyName] = (balances[currencyName] || 0) + parseFloat(amount);
                    });
                }
            });

            console.log('Processed balances:', balances);
            return balances;
        } catch (error) {
            console.error('Error fetching all currency balances:', error);
            return {};
        }
    }

    async listCurrencies() {
        try {
            const response = await makeRPCCall('listcurrencies');
            console.log('Currency list response:', response);
            
            if (!Array.isArray(response)) {
                console.error('Invalid currency list response:', response);
                return [];
            }

            return response;
        } catch (error) {
            console.error('Failed to list currencies:', error);
            return [];
        }
    }
}

export const verusRPC = new VerusRPCService();