<template>
    <div class="nft-gallery">
        <div v-if="loading" class="loading-state">
            <i class="fas fa-spinner fa-spin"></i>
            <p>Loading NFTs...</p>
        </div>
        
        <div v-else-if="error" class="error-state">
            <i class="fas fa-exclamation-circle"></i>
            <p>{{ error }}</p>
        </div>
        
        <div v-else-if="!nfts.length" class="no-nfts">
            <i class="fas fa-image empty-icon"></i>
            <p>No NFTs found</p>
            <p class="sub-text">NFTs you receive will appear here</p>
            <p class="sub-text">(Currencies with options=2080)</p>
        </div>
        
        <div v-else class="nft-grid">
            <div v-for="nft in nfts" :key="nft.id" class="nft-card">
                <div class="nft-image-container">
                    <img :src="nft.image" :alt="nft.name" class="nft-image">
                </div>
                <div class="nft-info">
                    <h3>{{ nft.name }}</h3>
                    <p class="collection-name">Collection: {{ nft.collection }}</p>
                    <p class="nft-balance">Balance: {{ nft.balance }}</p>
                    <p class="nft-id">ID: {{ nft.id }}</p>
                </div>
            </div>
        </div>
    </div>
</template>

<script>
import { ref, onMounted, computed } from 'vue';
import { useStore } from 'vuex';

export default {
    name: 'NFTGallery',
    setup() {
        const store = useStore();
        const nfts = ref([]);
        const loading = ref(false);
        const error = ref(null);

        // Get all NFT currencies (options = 2080)
        const nftCurrencies = computed(() => {
            const availableCurrencies = store.state.currencies.availableCurrencies;
            return availableCurrencies.filter(currency => 
                currency?.currencydefinition?.options === 2080
            );
        });

        const fetchNFTs = async () => {
            try {
                loading.value = true;
                
                // Add all NFT currencies to selected currencies
                for (const nftCurrency of nftCurrencies.value) {
                    const currencyId = nftCurrency.currencydefinition.currencyid;
                    if (!store.state.currencies.selectedCurrencies.includes(currencyId)) {
                        await store.dispatch('currencies/selectCurrency', currencyId);
                    }
                }
                
                // Fetch updated balances
                await store.dispatch('currencies/fetchBalances');
                
                // Create NFT objects from currencies with balances
                const nftList = [];
                for (const nftCurrency of nftCurrencies.value) {
                    const def = nftCurrency.currencydefinition;
                    const balance = store.state.currencies.balances[def.currencyid];
                    
                    if (balance && balance > 0) {
                        nftList.push({
                            id: def.currencyid,
                            name: def.name || def.fullyqualifiedname,
                            collection: def.parent || 'Verus NFT Collection',
                            image: '/placeholder-nft.png',
                            balance: balance,
                            definition: def
                        });
                    }
                }
                
                nfts.value = nftList;
            } catch (err) {
                error.value = err.message;
                console.error('Error fetching NFTs:', err);
            } finally {
                loading.value = false;
            }
        };

        onMounted(() => {
            fetchNFTs();
        });

        return {
            nfts,
            loading,
            error,
            nftCurrencies
        };
    }
};
</script>

<style scoped>
.nft-gallery {
    padding: 20px;
    min-height: 300px;
}

.no-nfts {
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
}

.nft-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 20px;
}

.nft-card {
    background: white;
    border-radius: 12px;
    overflow: hidden;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    transition: transform 0.2s;
}

.nft-card:hover {
    transform: translateY(-4px);
}

.nft-image-container {
    aspect-ratio: 1;
    overflow: hidden;
}

.nft-image {
    width: 100%;
    height: 100%;
    object-fit: cover;
}

.nft-info {
    padding: 12px;
}

.nft-info h3 {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
}

.collection-name {
    margin: 4px 0 0;
    font-size: 14px;
    color: #666;
}

.loading-state,
.error-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 300px;
    color: #666;
}

.loading-state i,
.error-state i {
    font-size: 32px;
    margin-bottom: 16px;
}

.error-state {
    color: #dc3545;
}

.nft-balance {
    margin-top: 8px;
    font-size: 14px;
    color: #666;
}

.nft-id {
    font-size: 12px;
    color: #888;
    word-break: break-all;
    margin-top: 4px;
}
</style>
