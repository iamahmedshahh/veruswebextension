import { makeRPCCall } from '../utils/verus-rpc';
import store from '../store';

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

    getNativeCurrency() {
        return store.getters['network/mainCoin'];
    }

    async getBalance(address, currency) {
        if (!address) {
            console.error('No address provided for balance check');
            return 0;
        }

        const nativeCurrency = this.getNativeCurrency().toLowerCase();

        try {
            // Get UTXOs for more detailed balance information
            const utxoResponse = await makeRPCCall('getaddressutxos', [{
                addresses: [address],
                currencynames: true
            }], null, nativeCurrency);
            
            console.log('UTXO response for', currency, ':', utxoResponse);
            
            if (!utxoResponse || !Array.isArray(utxoResponse)) {
                return 0;
            }

            // Filter UTXOs for the target currency
            const relevantUtxos = utxoResponse.filter(utxo => {
                const hasCurrencyInNames = utxo.currencynames && utxo.currencynames[currency];
                const hasCurrencyInValues = utxo.currencyvalues && utxo.currencyvalues[currency];
                const isNativeCurrency = currency === this.getNativeCurrency();
                const hasNativeBalance = isNativeCurrency && utxo.satoshis > 0;
                
                return hasCurrencyInNames || hasCurrencyInValues || hasNativeBalance;
            });

            // Calculate total balance
            let totalBalance = 0;
            relevantUtxos.forEach(utxo => {
                if (currency === this.getNativeCurrency()) {
                    totalBalance += (utxo.satoshis || 0) / 100000000; // Convert satoshis to native currency
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

        const nativeCurrency = this.getNativeCurrency().toLowerCase();

        try {
            // Get UTXOs for the address with the native currency path
            const utxoResponse = await makeRPCCall('getaddressutxos', [{
                addresses: [address],
                currencynames: true
            }], null, nativeCurrency);

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
                // Handle native currency
                if (utxo.satoshis > 0) {
                    balances[this.getNativeCurrency()] = (balances[this.getNativeCurrency()] || 0) + (utxo.satoshis / 100000000);
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
            // For listing currencies, we use the base URL without the currency path
            const response = await makeRPCCall('listcurrencies', [], { server: store.getters['network/rpcServer'] });
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