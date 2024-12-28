import { makeRPCCall } from '../utils/verus-rpc';

export class VerusIDService {
    static async getIdentity(identityName) {
        try {
            const response = await makeRPCCall('getidentity', [identityName]);
            return response;
        } catch (error) {
            console.error('Error fetching identity:', error);
            throw error;
        }
    }

    static async listIdentities() {
        try {
            // First get the list of identities
            const response = await makeRPCCall('listidentities', []);
            
            // If that fails, try an alternative approach using getaddressidentity
            if (!response) {
                const identityList = await makeRPCCall('getaddressidentity', []);
                return identityList || [];
            }
            
            return response;
        } catch (error) {
            console.error('Error listing identities:', error);
            // Return empty array instead of throwing to handle gracefully
            return [];
        }
    }

    static async registerIdentity(identityName, options = {}) {
        try {
            const {
                primaryAddresses = [],
                minimumSignatures = 1,
                recoveryAuthority = null,
                revocationAuthority = null,
                privateAddresses = [],
                timelock = 0
            } = options;

            const response = await makeRPCCall('registernamecommitment', [
                identityName,
                primaryAddresses,
                minimumSignatures,
                recoveryAuthority,
                revocationAuthority,
                privateAddresses,
                timelock
            ]);
            return response;
        } catch (error) {
            console.error('Error registering identity:', error);
            throw error;
        }
    }

    static async revokeIdentity(identityName, revocationReason) {
        try {
            const response = await makeRPCCall('revokeidentity', [
                identityName,
                revocationReason
            ]);
            return response;
        } catch (error) {
            console.error('Error revoking identity:', error);
            throw error;
        }
    }

    static async recoverIdentity(identityName, recoveryAddress) {
        try {
            const response = await makeRPCCall('recoveridentity', [
                identityName,
                recoveryAddress
            ]);
            return response;
        } catch (error) {
            console.error('Error recovering identity:', error);
            throw error;
        }
    }

    static async updateIdentity(identityName, updates) {
        try {
            const response = await makeRPCCall('updateidentity', [
                identityName,
                updates
            ]);
            return response;
        } catch (error) {
            console.error('Error updating identity:', error);
            throw error;
        }
    }

    static async signMessage(identityName, message) {
        try {
            const response = await makeRPCCall('signmessage', [
                identityName,
                message
            ]);
            return response;
        } catch (error) {
            console.error('Error signing message:', error);
            throw error;
        }
    }

    static async verifyMessage(identityName, signature, message) {
        try {
            const response = await makeRPCCall('verifymessage', [
                identityName,
                signature,
                message
            ]);
            return response;
        } catch (error) {
            console.error('Error verifying message:', error);
            throw error;
        }
    }
}

export default VerusIDService;
