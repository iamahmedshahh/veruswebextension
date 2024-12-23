<template>
    <div class="nft-gallery">
        <div v-if="!nfts.length" class="no-nfts">
            <i class="fas fa-image empty-icon"></i>
            <p>No NFTs found</p>
            <p class="sub-text">NFTs you receive will appear here</p>
        </div>
        <div v-else class="nft-grid">
            <div v-for="nft in nfts" :key="nft.id" class="nft-card">
                <div class="nft-image-container">
                    <img :src="nft.image" :alt="nft.name" class="nft-image">
                </div>
                <div class="nft-info">
                    <h3>{{ nft.name }}</h3>
                    <p class="collection-name">{{ nft.collection }}</p>
                </div>
            </div>
        </div>
    </div>
</template>

<script>
import { ref } from 'vue';

export default {
    name: 'NFTGallery',
    setup() {
        const nfts = ref([]);
        // This will be implemented later when we add NFT functionality
        return {
            nfts
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
</style>
