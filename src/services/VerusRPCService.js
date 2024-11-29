import { makeRPCCall } from '../utils/verus-rpc';

class VerusRPCService {
    constructor() {
        this.initialized = false;
        this.testConnection = null;
    }

    async initialize() {
        if (this.initialized) return;

        try {
            // Test connection
            const info = await makeRPCCall('getinfo');
            if (!info || !info.version) {
                throw new Error('Invalid RPC response');
            }
            
            this.initialized = true;
            console.log('RPC connection status: Connected');
        } catch (error) {
            console.error('Failed to initialize RPC:', error);
            throw new Error('Failed to connect to Verus RPC server');
        }
    }

    async getBalance(address) {
        if (!this.initialized) {
            await this.initialize();
        }

        try {
            const result = await makeRPCCall('getaddressbalance', [{ addresses: [address] }]);
            if (!result || typeof result.balance === 'undefined') {
                throw new Error('Invalid balance response');
            }
            return result.balance;
        } catch (error) {
            console.error('Failed to get balance:', error);
            throw new Error('Failed to fetch balance');
        }
    }

    async getInfo() {
        if (!this.initialized) {
            await this.initialize();
        }

        try {
            return await makeRPCCall('getinfo');
        } catch (error) {
            console.error('Failed to get info:', error);
            throw new Error('Failed to fetch network info');
        }
    }

    async getNewAddress() {
        if (!this.initialized) {
            await this.initialize();
        }

        try {
            return await makeRPCCall('getnewaddress');
        } catch (error) {
            console.error('Failed to get new address:', error);
            throw new Error('Failed to generate new address');
        }
    }

    async validateAddress(address) {
        if (!this.initialized) {
            await this.initialize();
        }

        try {
            const result = await makeRPCCall('validateaddress', [address]);
            return result.isvalid === true;
        } catch (error) {
            console.error('Failed to validate address:', error);
            throw new Error('Failed to validate address');
        }
    }

    async getTransactions(address) {
        if (!this.initialized) {
            await this.initialize();
        }

        try {
            return await makeRPCCall('getaddresstxids', [{ "addresses": [address] }]);
        } catch (error) {
            console.error('Failed to get transactions:', error);
            throw error;
        }
    }

    async getNetworkInfo() {
        if (!this.initialized) {
            await this.initialize();
        }

        try {
            return await makeRPCCall('getnetworkinfo');
        } catch (error) {
            console.error('Failed to get network info:', error);
            throw new Error('Failed to fetch network info');
        }
    }

    async sendTransaction({ from, to, amount, privateKey }) {
        if (!this.initialized) {
            await this.initialize();
        }

        try {
            // First validate the recipient address
            const isValid = await this.validateAddress(to);
            if (!isValid) {
                throw new Error('Invalid recipient address');
            }

            // Convert amount to satoshis (multiply by 100000000)
            const satoshis = Math.round(amount * 100000000);

            // Create raw transaction
            const rawTx = await makeRPCCall('createrawtransaction', [
                [], // No inputs - they will be selected automatically
                {
                    [to]: amount // Amount in VRSC
                }
            ]);

            // Fund the raw transaction
            const fundedTx = await makeRPCCall('fundrawtransaction', [rawTx]);

            // Sign the transaction with private key
            const signedTx = await makeRPCCall('signrawtransaction', [
                fundedTx.hex,
                [], // No inputs to sign
                [privateKey]
            ]);

            if (!signedTx.complete) {
                throw new Error('Failed to sign transaction');
            }

            // Send the signed transaction
            const txid = await makeRPCCall('sendrawtransaction', [signedTx.hex]);

            return {
                txid,
                amount: satoshis,
                to,
                from
            };
        } catch (error) {
            console.error('Failed to send transaction:', error);
            throw new Error(error.message || 'Failed to send transaction');
        }
    }

    async listCurrencies() {
        if (!this.initialized) {
            await this.initialize();
        }

        try {
            const result = await makeRPCCall('listcurrencies');
            // Extract currency names from the response
            if (Array.isArray(result)) {
                return result.map(currency => {
                    if (currency.currencydefinition && currency.currencydefinition.name) {
                        return currency.currencydefinition.name;
                    }
                    return null;
                }).filter(name => name !== null);
            }
            return ['vrsctest']; // Fallback to default
        } catch (error) {
            console.error('Failed to list currencies:', error);
            throw new Error('Failed to fetch currencies');
        }
    }
}

// Create a singleton instance
export const verusRPC = new VerusRPCService();
