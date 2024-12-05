<template>
  <div class="connected-sites-modal" v-if="showModal">
    <div class="modal-content">
      <div class="modal-header">
        <h3>Connected Sites</h3>
        <div class="close-icon" @click="closeModal">
          <i class="fas fa-times"></i>
        </div>
      </div>
      <div class="modal-body">
        <div v-if="sites.length === 0" class="no-sites">
          No connected sites
        </div>
        <div v-else class="sites-list">
          <div v-for="site in sites" :key="site.origin" class="site-item">
            <div class="site-info">
              <img :src="site.favicon || defaultFavicon" class="site-favicon" />
              <span class="site-origin">{{ site.origin }}</span>
            </div>
            <button class="disconnect-btn" @click="disconnectSite(site.origin)">
              Disconnect
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useStore } from 'vuex'
import defaultFavicon from '../assets/default-favicon.svg'

const store = useStore()
const showModal = ref(false)
const sites = ref([])

const loadConnectedSites = async () => {
  try {
    const connectedSites = await store.dispatch('wallet/getConnectedSites')
    sites.value = connectedSites
  } catch (error) {
    console.error('Failed to load connected sites:', error)
  }
}

const disconnectSite = async (origin) => {
  try {
    await store.dispatch('wallet/disconnectSite', origin)
    await loadConnectedSites()
  } catch (error) {
    console.error('Failed to disconnect site:', error)
  }
}

const closeModal = () => {
  showModal.value = false
}

const open = () => {
  showModal.value = true
  loadConnectedSites()
}

defineExpose({
  open
})

onMounted(() => {
  loadConnectedSites()
})
</script>

<style scoped>
.connected-sites-modal {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}

.modal-content {
  background: white;
  border-radius: 8px;
  width: 90%;
  max-width: 400px;
  max-height: 80vh;
  overflow-y: auto;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem;
  border-bottom: 1px solid #eee;
}

.modal-header h3 {
  margin: 0;
  font-size: 1.2rem;
}

.close-icon {
  cursor: pointer;
  padding: 0.5rem;
}

.modal-body {
  padding: 1rem;
}

.no-sites {
  text-align: center;
  color: #666;
  padding: 1rem;
}

.sites-list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.site-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.5rem;
  border: 1px solid #eee;
  border-radius: 4px;
}

.site-info {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.site-favicon {
  width: 16px;
  height: 16px;
  object-fit: contain;
}

.site-origin {
  font-size: 0.9rem;
}

.disconnect-btn {
  padding: 0.25rem 0.5rem;
  background-color: #ff4444;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.8rem;
}

.disconnect-btn:hover {
  background-color: #cc0000;
}
</style>
