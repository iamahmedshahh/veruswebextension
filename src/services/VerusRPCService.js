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

    async getBalance(address, currency = 'VRSC') {
        if (!address) {
            console.error('No address provided for balance check');
            return 0;
        }

        try {
            const balanceResponse = await makeRPCCall('getaddressbalance', [{
                addresses: [address],
                currencynames: true,
                includePrivate: true
            }]);
            console.log('Balance response for', currency, ':', balanceResponse);

            let balance = 0;
            currency = currency.toUpperCase();

            if (balanceResponse) {
                // Handle VRSC balance
                if (currency === 'VRSC' && balanceResponse.balance) {
                    balance = balanceResponse.balance / 100000000; // Convert from satoshis
                }
                
                // Handle other currency balances
                if (balanceResponse.currencybalance) {
                    const currencyBalance = balanceResponse.currencybalance[currency];
                    if (currencyBalance !== undefined) {
                        balance = currencyBalance;
                    }
                }
            }

            return balance;
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
            const balanceResponse = await makeRPCCall('getaddressbalance', [{
                addresses: [address],
                currencynames: true,
                includePrivate: true
            }]);

            const balances = {};

            if (balanceResponse) {
                // Handle VRSC balance
                if (balanceResponse.balance) {
                    balances.VRSC = balanceResponse.balance / 100000000;
                }

                // Handle other currency balances
                if (balanceResponse.currencybalance) {
                    Object.entries(balanceResponse.currencybalance).forEach(([currency, amount]) => {
                        balances[currency.toUpperCase()] = amount;
                    });
                }
            }

            return balances;
        } catch (error) {
            console.error('Error fetching all currency balances:', error);
            return {};
        }
    }

    async listCurrencies() {
        try {
            const response = await makeRPCCall('listcurrencies');
            const currencies = new Set(['VRSCTEST']);

            if (Array.isArray(response)) {
                response.forEach(currency => {
                    if (currency?.currencydefinition?.name) {
                        currencies.add(currency.currencydefinition.name.toUpperCase());
                    }
                });
            }

            return Array.from(currencies);
        } catch (error) {
            console.error('Failed to list currencies:', error);
            return ['VRSCTEST'];
        }
    }
}

export const verusRPC = new VerusRPCService();