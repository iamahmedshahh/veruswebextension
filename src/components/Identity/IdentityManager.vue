<template>
    <div class="identity-manager">
        <!-- Loading State -->
        <div v-if="loading" class="loading-state">
            <i class="fas fa-spinner fa-spin"></i>
            <p>Loading identities...</p>
        </div>

        <!-- Error State -->
        <div v-else-if="error" class="error-state">
            <i class="fas fa-exclamation-circle"></i>
            <p>{{ error }}</p>
        </div>

        <!-- No Identities State -->
        <div v-else-if="!hasIdentities" class="no-identities">
            <i class="fas fa-user-circle empty-icon"></i>
            <p>No VerusIDs Found</p>
            <p class="sub-text">Create or import a VerusID to get started</p>
            <button @click="showCreateIdentityModal = true" class="create-button">
                Create VerusID
            </button>
        </div>

        <!-- Identity List -->
        <div v-else class="identity-list">
            <div class="identity-header">
                <h2>Your VerusIDs</h2>
                <button @click="showCreateIdentityModal = true" class="add-button">
                    <i class="fas fa-plus"></i> New VerusID
                </button>
            </div>

            <div class="identity-grid">
                <div v-for="identity in identities" 
                     :key="identity.identity" 
                     class="identity-card"
                     :class="{ 'selected': currentIdentity?.identity === identity.identity }"
                     @click="selectIdentity(identity)">
                    <div class="identity-icon">
                        <i class="fas fa-user-circle"></i>
                    </div>
                    <div class="identity-info">
                        <h3>{{ identity.name }}</h3>
                        <p class="identity-id">{{ identity.identity }}</p>
                        <div class="identity-status" :class="getStatusClass(identity)">
                            {{ getStatusText(identity) }}
                        </div>
                    </div>
                    <div class="identity-actions">
                        <button @click.stop="showUpdateModal(identity)" 
                                class="action-button">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button v-if="canRevoke(identity)" 
                                @click.stop="showRevokeModal(identity)"
                                class="action-button danger">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
            </div>
        </div>

        <!-- Create Identity Modal -->
        <div v-if="showCreateIdentityModal" class="modal">
            <div class="modal-content">
                <h3>Create New VerusID</h3>
                <form @submit.prevent="createIdentity">
                    <div class="form-group">
                        <label>Identity Name</label>
                        <input v-model="newIdentity.name" 
                               type="text" 
                               required 
                               placeholder="Enter identity name">
                    </div>
                    <div class="form-group">
                        <label>Primary Address</label>
                        <input v-model="newIdentity.primaryAddress" 
                               type="text" 
                               required 
                               placeholder="Enter primary address">
                    </div>
                    <div class="form-actions">
                        <button type="button" 
                                @click="showCreateIdentityModal = false">
                            Cancel
                        </button>
                        <button type="submit" 
                                :disabled="!canCreateIdentity">
                            Create
                        </button>
                    </div>
                </form>
            </div>
        </div>
    </div>
</template>

<script>
import { ref, computed, onMounted } from 'vue';
import { useStore } from 'vuex';

export default {
    name: 'IdentityManager',
    
    setup() {
        const store = useStore();
        const showCreateIdentityModal = ref(false);
        const newIdentity = ref({
            name: '',
            primaryAddress: ''
        });

        // Computed properties
        const loading = computed(() => store.state.identity.loading);
        const error = computed(() => store.state.identity.error);
        const identities = computed(() => store.state.identity.identities);
        const currentIdentity = computed(() => store.state.identity.currentIdentity);
        const hasIdentities = computed(() => store.getters['identity/hasIdentities']);

        const canCreateIdentity = computed(() => 
            newIdentity.value.name && 
            newIdentity.value.primaryAddress
        );

        // Methods
        const fetchIdentities = async () => {
            try {
                await store.dispatch('identity/fetchIdentities');
            } catch (error) {
                console.error('Error fetching identities:', error);
            }
        };

        const selectIdentity = async (identity) => {
            try {
                await store.dispatch('identity/fetchIdentity', identity.identity);
            } catch (error) {
                console.error('Error selecting identity:', error);
            }
        };

        const createIdentity = async () => {
            try {
                await store.dispatch('identity/registerIdentity', {
                    identityName: newIdentity.value.name,
                    options: {
                        primaryAddresses: [newIdentity.value.primaryAddress],
                        minimumSignatures: 1
                    }
                });
                showCreateIdentityModal.value = false;
                newIdentity.value = { name: '', primaryAddress: '' };
            } catch (error) {
                console.error('Error creating identity:', error);
            }
        };

        const getStatusClass = (identity) => {
            if (identity.revoked) return 'status-revoked';
            if (identity.blocked) return 'status-blocked';
            return 'status-active';
        };

        const getStatusText = (identity) => {
            if (identity.revoked) return 'Revoked';
            if (identity.blocked) return 'Blocked';
            return 'Active';
        };

        const canRevoke = (identity) => {
            return !identity.revoked && !identity.blocked;
        };

        onMounted(() => {
            fetchIdentities();
        });

        return {
            loading,
            error,
            identities,
            currentIdentity,
            hasIdentities,
            showCreateIdentityModal,
            newIdentity,
            canCreateIdentity,
            selectIdentity,
            createIdentity,
            getStatusClass,
            getStatusText,
            canRevoke
        };
    }
};
</script>

<style scoped>
.identity-manager {
    padding: 20px;
    min-height: 300px;
}

.loading-state,
.error-state,
.no-identities {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 300px;
    color: #666;
}

.empty-icon {
    font-size: 48px;
    margin-bottom: 16px;
    opacity: 0.5;
}

.sub-text {
    font-size: 14px;
    color: #888;
    margin-bottom: 20px;
}

.create-button,
.add-button {
    background-color: #4CAF50;
    color: white;
    border: none;
    padding: 10px 20px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 14px;
    transition: background-color 0.2s;
}

.create-button:hover,
.add-button:hover {
    background-color: #45a049;
}

.identity-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20px;
}

.identity-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 20px;
}

.identity-card {
    background: white;
    border-radius: 8px;
    padding: 16px;
    display: flex;
    align-items: center;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    transition: transform 0.2s, box-shadow 0.2s;
    cursor: pointer;
}

.identity-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
}

.identity-card.selected {
    border: 2px solid #4CAF50;
}

.identity-icon {
    font-size: 32px;
    color: #4CAF50;
    margin-right: 16px;
}

.identity-info {
    flex: 1;
}

.identity-info h3 {
    margin: 0;
    font-size: 16px;
    color: #333;
}

.identity-id {
    font-size: 12px;
    color: #666;
    margin: 4px 0;
    word-break: break-all;
}

.identity-status {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 12px;
    font-size: 12px;
    margin-top: 4px;
}

.status-active {
    background-color: #E8F5E9;
    color: #4CAF50;
}

.status-revoked {
    background-color: #FFEBEE;
    color: #F44336;
}

.status-blocked {
    background-color: #FFF3E0;
    color: #FF9800;
}

.identity-actions {
    display: flex;
    gap: 8px;
}

.action-button {
    background: none;
    border: none;
    color: #666;
    cursor: pointer;
    padding: 4px;
    border-radius: 4px;
    transition: background-color 0.2s;
}

.action-button:hover {
    background-color: #f5f5f5;
}

.action-button.danger {
    color: #F44336;
}

.action-button.danger:hover {
    background-color: #FFEBEE;
}

.modal {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
}

.modal-content {
    background: white;
    padding: 24px;
    border-radius: 8px;
    width: 100%;
    max-width: 400px;
}

.form-group {
    margin-bottom: 16px;
}

.form-group label {
    display: block;
    margin-bottom: 8px;
    color: #333;
    font-size: 14px;
}

.form-group input {
    width: 100%;
    padding: 8px;
    border: 1px solid #ddd;
    border-radius: 4px;
    font-size: 14px;
}

.form-actions {
    display: flex;
    justify-content: flex-end;
    gap: 12px;
    margin-top: 24px;
}

.form-actions button {
    padding: 8px 16px;
    border-radius: 4px;
    font-size: 14px;
    cursor: pointer;
}

.form-actions button[type="button"] {
    background-color: #f5f5f5;
    border: 1px solid #ddd;
    color: #666;
}

.form-actions button[type="submit"] {
    background-color: #4CAF50;
    border: none;
    color: white;
}

.form-actions button[type="submit"]:disabled {
    background-color: #cccccc;
    cursor: not-allowed;
}
</style>
