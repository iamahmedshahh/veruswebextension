<script setup>
import { ref, computed, defineProps, onMounted, defineEmits, watch, onBeforeUnmount } from 'vue'
import { useStore } from 'vuex'
import TransactionDetail from './TransactionDetail.vue'

const store = useStore()
const props = defineProps({
  currency: {
    type: String,
    required: true
  }
})

const emit = defineEmits(['viewTransaction'])

// State
const isLoading = ref(false)
const searchQuery = ref('')
const filterStatus = ref('all')
const showFilters = ref(false)
const selectedDateRange = ref('all')
const customStartDate = ref('')
const customEndDate = ref('')
const sortBy = ref('timestamp')
const sortDirection = ref('desc')
const selectedTransaction = ref(null)
const showDetailModal = ref(false)
const lastSyncTime = ref(null)
const isOffline = ref(false)

// Check online status
const checkOnlineStatus = () => {
  isOffline.value = !navigator.onLine
}

// Load transactions from store
onMounted(async () => {
  checkOnlineStatus()
  window.addEventListener('online', checkOnlineStatus)
  window.addEventListener('offline', checkOnlineStatus)
  
  isLoading.value = true
  await store.dispatch('transactions/loadTransactions')
  lastSyncTime.value = store.getters['transactions/getLastSyncTimestamp']
  isLoading.value = false
  
  // Try to sync with network if online
  if (navigator.onLine) {
    syncTransactions()
  }
})

// Clean up event listeners
onBeforeUnmount(() => {
  if (typeof window !== 'undefined') {
    window.removeEventListener('online', checkOnlineStatus)
    window.removeEventListener('offline', checkOnlineStatus)
  }
})

// Sync transactions with network
const syncTransactions = async () => {
  if (isOffline.value) return
  
  isLoading.value = true
  try {
    await store.dispatch('transactions/syncTransactionsWithNetwork')
    lastSyncTime.value = store.getters['transactions/getLastSyncTimestamp']
  } catch (error) {
    console.error('Failed to sync transactions:', error)
  } finally {
    isLoading.value = false
  }
}

// Watch for currency changes
watch(() => props.currency, () => {
  selectedTransaction.value = null
  showDetailModal.value = false
})

// Get all transactions for the currency
const transactions = computed(() => store.getters['transactions/getTransactions'](props.currency))

// Apply filters and sorting
const filteredTransactions = computed(() => {
  let result = [...transactions.value]
  
  // Apply search
  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    result = result.filter(tx => 
      tx.txid.toLowerCase().includes(query) ||
      (tx.from && tx.from.toLowerCase().includes(query)) ||
      (tx.to && tx.to.toLowerCase().includes(query)) ||
      (tx.memo && tx.memo.toLowerCase().includes(query))
    )
  }
  
  // Apply status filter
  if (filterStatus.value !== 'all') {
    result = result.filter(tx => tx.status === filterStatus.value)
  }
  
  // Apply date range filter
  if (selectedDateRange.value !== 'all') {
    const now = new Date()
    let startDate
    
    switch (selectedDateRange.value) {
      case 'today':
        startDate = new Date(now.setHours(0, 0, 0, 0))
        break
      case 'week':
        startDate = new Date(now.setDate(now.getDate() - 7))
        break
      case 'month':
        startDate = new Date(now.setMonth(now.getMonth() - 1))
        break
      case 'custom':
        if (customStartDate.value && customEndDate.value) {
          startDate = new Date(customStartDate.value)
          const endDate = new Date(customEndDate.value)
          endDate.setHours(23, 59, 59, 999) // End of day
          
          result = result.filter(tx => {
            const txDate = new Date(tx.timestamp)
            return txDate >= startDate && txDate <= endDate
          })
          break
        }
        return result // If custom dates aren't set properly, return without date filtering
      default:
        return result
    }
    
    if (selectedDateRange.value !== 'custom') {
      result = result.filter(tx => {
        const txDate = new Date(tx.timestamp)
        return txDate >= startDate
      })
    }
  }
  
  // Apply sorting
  result.sort((a, b) => {
    if (sortBy.value === 'timestamp') {
      return sortDirection.value === 'desc' 
        ? new Date(b.timestamp) - new Date(a.timestamp)
        : new Date(a.timestamp) - new Date(b.timestamp)
    }
    
    if (sortBy.value === 'amount') {
      return sortDirection.value === 'desc'
        ? parseFloat(b.amount) - parseFloat(a.amount)
        : parseFloat(a.amount) - parseFloat(b.amount)
    }
    
    return 0
  })
  
  return result
})

// Toggle sort direction
const toggleSort = (field) => {
  if (sortBy.value === field) {
    sortDirection.value = sortDirection.value === 'asc' ? 'desc' : 'asc'
  } else {
    sortBy.value = field
    sortDirection.value = 'desc'
  }
}

// Open transaction in explorer
const openTxInExplorer = (txid) => {
  const url = `https://testex.verus.io/tx/${txid}`
  window.open(url, '_blank')
}

// View transaction details
const viewTransactionDetails = (tx) => {
  selectedTransaction.value = tx
  showDetailModal.value = true
}

// Format date for display
const formatDate = (timestamp) => {
  return new Date(timestamp).toLocaleString()
}

// Format relative time
const formatRelativeTime = (timestamp) => {
  const now = new Date()
  const txDate = new Date(timestamp)
  const diffMs = now - txDate
  const diffSec = Math.floor(diffMs / 1000)
  const diffMin = Math.floor(diffSec / 60)
  const diffHour = Math.floor(diffMin / 60)
  const diffDay = Math.floor(diffHour / 24)
  
  if (diffSec < 60) return 'Just now'
  if (diffMin < 60) return `${diffMin}m ago`
  if (diffHour < 24) return `${diffHour}h ago`
  if (diffDay < 30) return `${diffDay}d ago`
  
  return formatDate(timestamp)
}

// Format last sync time
const formatLastSync = computed(() => {
  if (!lastSyncTime.value) return 'Never'
  return formatRelativeTime(lastSyncTime.value)
})

// Clear transaction history
const clearHistory = async () => {
  if (confirm('Are you sure you want to clear your transaction history? This action cannot be undone.')) {
    await store.dispatch('transactions/clearTransactionHistory')
  }
}

// Export transactions to CSV
const exportTransactions = () => {
  const headers = ['Date', 'Type', 'Amount', 'Currency', 'From', 'To', 'Status', 'Transaction ID', 'Memo']
  
  // Create CSV content
  let csvContent = headers.join(',') + '\n'
  
  transactions.value.forEach(tx => {
    const row = [
      new Date(tx.timestamp).toISOString(),
      tx.type,
      tx.amount,
      tx.currency,
      tx.from,
      tx.to,
      tx.status,
      tx.txid,
      tx.memo || ''
    ]
    
    csvContent += row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',') + '\n'
  })
  
  // Create download link
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  
  link.setAttribute('href', url)
  link.setAttribute('download', `${props.currency}_transactions_${new Date().toISOString().split('T')[0]}.csv`)
  link.style.visibility = 'hidden'
  
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}
</script>

<template>
  <div class="history-container">
    <div class="history-header">
      <h3 class="history-title">Transaction History</h3>
      
      <div class="sync-status" :class="{ offline: isOffline }">
        <span v-if="isOffline" class="offline-indicator">Offline Mode</span>
        <span v-else>
          Last synced: {{ formatLastSync }}
          <button @click="syncTransactions" class="sync-button" :disabled="isLoading">
            <i class="fas fa-sync" :class="{ 'fa-spin': isLoading }"></i>
          </button>
        </span>
      </div>
    </div>
    
    <div class="search-filters">
      <div class="search-container">
        <input 
          v-model="searchQuery" 
          type="text" 
          placeholder="Search transactions..." 
          class="search-input"
        />
        
        <button @click="showFilters = !showFilters" class="filter-button">
          <i class="fas fa-filter"></i>
          Filters
        </button>
      </div>
      
      <div v-if="showFilters" class="filters-panel">
        <div class="filter-group">
          <label>Status:</label>
          <select v-model="filterStatus">
            <option value="all">All</option>
            <option value="pending">Pending</option>
            <option value="confirmed">Confirmed</option>
            <option value="failed">Failed</option>
          </select>
        </div>
        
        <div class="filter-group">
          <label>Date Range:</label>
          <select v-model="selectedDateRange">
            <option value="all">All Time</option>
            <option value="today">Today</option>
            <option value="week">Last 7 Days</option>
            <option value="month">Last 30 Days</option>
            <option value="custom">Custom Range</option>
          </select>
        </div>
        
        <div v-if="selectedDateRange === 'custom'" class="custom-date-range">
          <div class="date-input">
            <label>From:</label>
            <input type="date" v-model="customStartDate" />
          </div>
          <div class="date-input">
            <label>To:</label>
            <input type="date" v-model="customEndDate" />
          </div>
        </div>
        
        <div class="filter-group">
          <label>Sort By:</label>
          <div class="sort-options">
            <button 
              class="sort-button" 
              :class="{ active: sortBy === 'timestamp' }"
              @click="toggleSort('timestamp')"
            >
              Date
              <i class="fas" :class="sortBy === 'timestamp' ? (sortDirection === 'desc' ? 'fa-arrow-down' : 'fa-arrow-up') : ''"></i>
            </button>
            
            <button 
              class="sort-button" 
              :class="{ active: sortBy === 'amount' }"
              @click="toggleSort('amount')"
            >
              Amount
              <i class="fas" :class="sortBy === 'amount' ? (sortDirection === 'desc' ? 'fa-arrow-down' : 'fa-arrow-up') : ''"></i>
            </button>
          </div>
        </div>
        
        <div class="filter-actions">
          <button @click="exportTransactions" class="export-button">
            <i class="fas fa-download"></i> Export CSV
          </button>
          <button @click="clearHistory" class="clear-button">
            <i class="fas fa-trash"></i> Clear History
          </button>
        </div>
      </div>
    </div>
    
    <div v-if="isLoading" class="loading-state">
      <i class="fas fa-circle-notch fa-spin"></i>
      <span>Loading transactions...</span>
    </div>
    
    <div v-else-if="transactions.length === 0" class="empty-state">
      <i class="fas fa-receipt empty-icon"></i>
      <p>No transactions yet</p>
      <p class="empty-subtitle">Transactions will appear here after you send or receive funds</p>
    </div>
    
    <div v-else-if="filteredTransactions.length === 0" class="empty-state">
      <i class="fas fa-search empty-icon"></i>
      <p>No matching transactions</p>
      <p class="empty-subtitle">Try adjusting your search filters</p>
    </div>
    
    <div v-else class="transactions-list">
      <div v-for="tx in filteredTransactions" 
           :key="tx.txid" 
           class="transaction-item"
           @click="viewTransactionDetails(tx)">
        <div class="tx-icon" :class="tx.type">
          <i :class="tx.type === 'received' ? 'fas fa-arrow-down' : 'fas fa-arrow-up'"></i>
        </div>
        <div class="tx-details">
          <div class="tx-primary">
            <span class="tx-type">{{ tx.type === 'received' ? 'Received' : 'Sent' }}</span>
            <span class="tx-amount" :class="tx.type === 'received' ? 'received' : 'sent'">
              {{ tx.type === 'received' ? '+' : '-' }} {{ tx.amount }} {{ tx.currency }}
            </span>
          </div>
          <div class="tx-addresses">
            <div class="tx-address">
              <span class="address-label">From:</span>
              <span :class="{ 'verus-id': tx.isFromVerusId }">
                {{ tx.from && tx.from.length > 20 ? tx.from.substring(0, 10) + '...' + tx.from.substring(tx.from.length - 10) : tx.from }}
              </span>
            </div>
            <div class="tx-address">
              <span class="address-label">To:</span>
              <span :class="{ 'verus-id': tx.isToVerusId }">
                {{ tx.to && tx.to.length > 20 ? tx.to.substring(0, 10) + '...' + tx.to.substring(tx.to.length - 10) : tx.to }}
              </span>
            </div>
          </div>
          <div class="tx-secondary">
            <span class="tx-date">{{ formatRelativeTime(tx.timestamp) }}</span>
            <span class="tx-status" :class="tx.status">{{ tx.status }}</span>
          </div>
        </div>
      </div>
    </div>
    
    <!-- Pagination (future enhancement) -->
    
    <!-- Transaction Detail Modal -->
    <transition name="fade">
      <div v-if="showDetailModal" class="modal-overlay" @click="showDetailModal = false">
        <div class="modal-content" @click.stop>
          <div class="modal-header">
            <h3>Transaction Details</h3>
            <button class="close-button" @click="showDetailModal = false">
              <i class="fas fa-times"></i>
            </button>
          </div>
          
          <TransactionDetail 
            v-if="selectedTransaction" 
            :transaction="selectedTransaction"
            @explorer="openTxInExplorer(selectedTransaction.txid)" 
          />
        </div>
      </div>
    </transition>
  </div>
</template>

<style scoped>
.history-container {
  background: white;
  border-radius: 12px;
  padding: 1rem;
  margin-top: 1rem;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
}

.history-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}

.history-title {
  margin: 0;
  padding: 0;
  font-size: 1.2rem;
  color: var(--text-color);
}

.sync-status {
  font-size: 0.85rem;
  color: #666;
  display: flex;
  align-items: center;
}

.sync-status.offline {
  color: #f44336;
}

.offline-indicator {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.offline-indicator::before {
  content: '';
  display: inline-block;
  width: 8px;
  height: 8px;
  background-color: #f44336;
  border-radius: 50%;
  animation: pulse 1.5s infinite;
}

.sync-button {
  background: none;
  border: none;
  color: #2196f3;
  cursor: pointer;
  margin-left: 0.5rem;
  padding: 0.25rem;
  border-radius: 50%;
  transition: background-color 0.2s;
}

.sync-button:hover {
  background-color: rgba(33, 150, 243, 0.1);
}

.sync-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.search-filters {
  margin-bottom: 1rem;
}

.search-container {
  display: flex;
  gap: 0.5rem;
}

.search-input {
  flex: 1;
  padding: 0.5rem 1rem;
  border: 1px solid var(--border-color);
  border-radius: 20px;
  font-size: 0.9rem;
}

.filter-button {
  padding: 0.5rem 1rem;
  background: #f5f5f5;
  border: 1px solid var(--border-color);
  border-radius: 20px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.9rem;
  transition: background-color 0.2s;
}

.filter-button:hover {
  background: #e0e0e0;
}

.filters-panel {
  margin-top: 1rem;
  padding: 1rem;
  background: #f9f9f9;
  border-radius: 8px;
  border: 1px solid var(--border-color);
}

.filter-group {
  margin-bottom: 1rem;
  display: flex;
  align-items: center;
  gap: 1rem;
}

.filter-group label {
  font-size: 0.9rem;
  font-weight: 500;
  min-width: 80px;
}

.filter-group select {
  padding: 0.5rem;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: white;
}

.custom-date-range {
  display: flex;
  gap: 1rem;
  margin-bottom: 1rem;
  margin-left: 80px;
}

.date-input {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.date-input label {
  font-size: 0.8rem;
  color: #666;
}

.date-input input {
  padding: 0.5rem;
  border: 1px solid var(--border-color);
  border-radius: 4px;
}

.sort-options {
  display: flex;
  gap: 0.5rem;
}

.sort-button {
  padding: 0.5rem 1rem;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: white;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  transition: all 0.2s;
}

.sort-button.active {
  background: #f0f7ff;
  border-color: #2196f3;
  color: #2196f3;
}

.filter-actions {
  display: flex;
  justify-content: flex-end;
  gap: 1rem;
  margin-top: 1rem;
}

.export-button, .clear-button {
  padding: 0.5rem 1rem;
  border-radius: 4px;
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.85rem;
  transition: background-color 0.2s;
}

.export-button {
  background: #e8f5e9;
  color: #2e7d32;
}

.export-button:hover {
  background: #c8e6c9;
}

.clear-button {
  background: #ffebee;
  color: #c62828;
}

.clear-button:hover {
  background: #ffcdd2;
}

.loading-state {
  padding: 2rem;
  text-align: center;
  color: #666;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
}

.loading-state i {
  font-size: 2rem;
  color: #2196f3;
}

.empty-state {
  padding: 2rem;
  text-align: center;
  color: #666;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.empty-icon {
  font-size: 3rem;
  margin-bottom: 1rem;
  color: #ddd;
}

.empty-subtitle {
  font-size: 0.9rem;
  color: #999;
  margin-top: 0.5rem;
}

.transactions-list {
  margin-top: 0.5rem;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  overflow: hidden;
}

.transaction-item {
  display: flex;
  align-items: flex-start;
  padding: 1rem;
  border-bottom: 1px solid var(--border-color);
  cursor: pointer;
  transition: background-color 0.2s;
}

.transaction-item:last-child {
  border-bottom: none;
}

.transaction-item:hover {
  background-color: rgba(0, 0, 0, 0.02);
}

.tx-icon {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-right: 1rem;
  font-size: 1rem;
}

.tx-icon.sent {
  background: #ffebee;
  color: #f44336;
}

.tx-icon.received {
  background: #e8f5e9;
  color: #4caf50;
}

.tx-details {
  flex: 1;
}

.tx-primary {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.5rem;
}

.tx-type {
  font-weight: 500;
}

.tx-amount {
  font-weight: bold;
}

.tx-amount.received {
  color: #4caf50;
}

.tx-amount.sent {
  color: #f44336;
}

.tx-addresses {
  margin: 0.5rem 0;
  font-size: 0.85rem;
}

.tx-address {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 0.25rem;
  word-break: break-all;
}

.address-label {
  color: #666;
  min-width: 3rem;
}

.verus-id {
  color: #2196f3;
  font-weight: 500;
}

.tx-secondary {
  display: flex;
  justify-content: space-between;
  font-size: 0.85rem;
  color: #666;
  margin-top: 0.5rem;
}

.tx-date {
  color: #666;
}

.tx-status {
  padding: 0.25rem 0.5rem;
  border-radius: 12px;
  font-size: 0.8rem;
}

.tx-status.confirmed {
  background: #e8f5e9;
  color: #2e7d32;
}

.tx-status.pending {
  background: #fff3e0;
  color: #f57c00;
}

.tx-status.failed {
  background: #ffebee;
  color: #c62828;
}

.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}

.modal-content {
  background: white;
  border-radius: 12px;
  width: 90%;
  max-width: 500px;
  max-height: 90vh;
  overflow-y: auto;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem;
  border-bottom: 1px solid var(--border-color);
}

.modal-header h3 {
  margin: 0;
  font-size: 1.2rem;
}

.close-button {
  background: none;
  border: none;
  font-size: 1.2rem;
  cursor: pointer;
  color: #666;
  padding: 0.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  transition: background-color 0.2s;
}

.close-button:hover {
  background-color: rgba(0, 0, 0, 0.05);
}

.fade-enter-active, .fade-leave-active {
  transition: opacity 0.3s;
}

.fade-enter-from, .fade-leave-to {
  opacity: 0;
}

@keyframes pulse {
  0% {
    opacity: 0.5;
    transform: scale(0.8);
  }
  50% {
    opacity: 1;
    transform: scale(1);
  }
  100% {
    opacity: 0.5;
    transform: scale(0.8);
  }
}
</style>
