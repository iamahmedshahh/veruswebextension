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

    async getBalance(address, currency = 'vrsctest') {
        if (!address) {
            console.error('No address provided for balance check');
            return 0;
        }

        try {
            const balanceResponse = await makeRPCCall('getaddressbalance', [{
                addresses: [address],
                currencynames: true
            }]);
            console.log('Balance response for', currency, ':', balanceResponse);

            let balance = 0;

            if (balanceResponse) {
                if ((currency.toUpperCase() === 'VRSCTEST' || currency.toUpperCase() === 'VRSC') && balanceResponse.balance) {
                    balance = balanceResponse.balance / 100000000;
                }
                
                if (balanceResponse.currencybalance && balanceResponse.currencybalance[currency]) {
                    balance = balanceResponse.currencybalance[currency];
                }
            }

            return balance;
        } catch (error) {
            console.error(`Error fetching balance for ${currency}:`, error);
            return 0;
        }
    }

    async getAllCurrencyBalances(address) {
        try {
            console.log('Getting balances for address:', address);
            
            if (!address) {
                throw new Error('Address is required');
            }

            // Initialize result array
            const result = [];

            // Get currency list first to get all valid currency IDs
            const currencyList = await makeRPCCall('listcurrencies', []);
            console.log('Currency list:', currencyList);

            // Create a map of currency IDs to their definitions
            const currencyMap = new Map();
            if (Array.isArray(currencyList)) {
                currencyList.forEach(currency => {
                    if (currency?.currencydefinition?.currencyid) {
                        const id = currency.currencydefinition.currencyid;
                        // Skip the lowercase vrsctest from currency list
                        if (id.toLowerCase() === 'vrsctest') return;
                        currencyMap.set(id, currency.currencydefinition);
                    }
                });
            }

            // Get all balances in one call
            const allBalances = await makeRPCCall('getaddressbalance', [{
                addresses: [address],
                allcurrencies: true
            }]);
            console.log('All balances response:', allBalances);

            // Process native VRSCTEST balance
            if (allBalances && typeof allBalances.balance === 'number') {
                result.push({
                    currencyid: 'VRSCTEST',
                    name: 'VRSCTEST',
                    balance: allBalances.balance * 100000000, // Multiply by 100000000 for correct display
                    currencytype: 'Currency',
                    supply: 0,
                    privatesupply: 0,
                    reserve: 0,
                    parent: null,
                    systemid: null,
                    options: {}
                });
            }

            // Process other currency balances
            if (allBalances && allBalances.currencybalance) {
                Object.entries(allBalances.currencybalance).forEach(([currencyId, balance]) => {
                    // Skip if it's any case variation of VRSCTEST
                    if (currencyId.toLowerCase() === 'vrsctest') return;

                    // Get currency definition if available
                    const currencyDef = currencyMap.get(currencyId);
                    const name = currencyDef?.name || currencyId;

                    // Adjust balance based on currency type
                    let adjustedBalance = balance;
                    if (typeof balance === 'number') {
                        adjustedBalance = balance * 100000000; // Multiply by 100000000 for correct display
                    }

                    console.log(`Processing currency ${name} (${currencyId}) with balance:`, balance, 'adjusted to:', adjustedBalance);

                    result.push({
                        currencyid: currencyId,
                        name: name,
                        balance: adjustedBalance,
                        currencytype: currencyId.startsWith('i') ? 'Identity' : 'Currency',
                        supply: currencyDef?.supply || 0,
                        privatesupply: currencyDef?.privatesupply || 0,
                        reserve: currencyDef?.reserve || 0,
                        parent: currencyDef?.parent || null,
                        systemid: currencyDef?.systemid || null,
                        options: currencyDef?.options || {}
                    });
                });
            }

            // Add remaining currencies with zero balance
            currencyMap.forEach((currencyDef, currencyId) => {
                // Skip if we already have this currency
                if (result.some(r => r.currencyid === currencyId)) return;

                result.push({
                    currencyid: currencyId,
                    name: currencyDef.name,
                    balance: 0,
                    currencytype: currencyId.startsWith('i') ? 'Identity' : 'Currency',
                    supply: currencyDef.supply || 0,
                    privatesupply: currencyDef.privatesupply || 0,
                    reserve: currencyDef.reserve || 0,
                    parent: currencyDef.parent || null,
                    systemid: currencyDef.systemid || null,
                    options: currencyDef.options || {}
                });
            });

            console.log('Final result with balances:', result);
            return result;
        } catch (error) {
            console.error('Error getting all currency balances:', error);
            throw error;
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