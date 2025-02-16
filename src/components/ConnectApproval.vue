<template>
  <div class="connect-approval">
    <div class="header">
      <h2>Connect to Site</h2>
      <div class="site-info">
        <img :src="favicon || defaultFavicon" class="site-favicon" />
        <span class="site-origin">{{ origin }}</span>
      </div>
    </div>

    <div class="content">
      <p>This site is requesting to:</p>
      <ul class="permissions">
        <li>
          <i class="fas fa-wallet"></i>
          View your wallet address
        </li>
        <li>
          <i class="fas fa-signature"></i>
          Request transaction signatures
        </li>
      </ul>
    </div>

    <div class="actions">
      <button class="reject-btn" @click="handleReject" :disabled="isProcessing">
        Reject
      </button>
      <button class="approve-btn" @click="handleApprove" :disabled="isProcessing">
        Connect
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import browser from 'webextension-polyfill';
import defaultFavicon from '../assets/default-favicon.svg';

const route = useRoute();
const origin = ref('');
const favicon = ref(null);
const requestId = ref('');
const isProcessing = ref(false);

onMounted(async () => {
  requestId.value = route.query.requestId;
  origin.value = decodeURIComponent(route.query.origin || '');
  
  // Try to get favicon
  if (origin.value) {
    try {
      const url = new URL(origin.value);
      favicon.value = `${url.origin}/favicon.ico`;
    } catch (err) {
      console.error('Error getting favicon:', err);
    }
  }
});

const handleApprove = async () => {
  try {
    isProcessing.value = true;
    console.log('Sending approval for request:', requestId.value);
    
    // Send approval message
    const response = await browser.runtime.sendMessage({
      type: 'APPROVE_CONNECTION',
      payload: { requestId: requestId.value }
    });

    console.log('Got approval response:', response);
    if (response.error) {
      throw new Error(response.error);
    }

    // Close window
    window.close();
  } catch (error) {
    console.error('Error approving connection:', error);
    isProcessing.value = false;
  }
};

const handleReject = async () => {
  try {
    isProcessing.value = true;
    console.log('Sending rejection for request:', requestId.value);
    
    // Send rejection message
    const response = await browser.runtime.sendMessage({
      type: 'REJECT_CONNECTION',
      payload: { requestId: requestId.value }
    });

    console.log('Got rejection response:', response);

    // Close window
    window.close();
  } catch (error) {
    console.error('Error rejecting connection:', error);
    isProcessing.value = false;
  }
};
</script>

<style scoped>
.connect-approval {
  padding: 1.5rem;
}

.header {
  text-align: center;
  margin-bottom: 1.5rem;
}

h2 {
  margin-bottom: 1rem;
  color: #374151;
}

.site-info {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
}

.site-favicon {
  width: 24px;
  height: 24px;
}

.site-origin {
  font-size: 1rem;
  color: #4b5563;
}

.content {
  margin-bottom: 1.5rem;
}

.permissions {
  list-style: none;
  padding: 0;
  margin: 1rem 0;
}

.permissions li {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem;
  color: #4b5563;
}

.permissions i {
  color: #3b82f6;
}

.actions {
  display: flex;
  gap: 1rem;
}

button {
  flex: 1;
  padding: 0.75rem;
  border: none;
  border-radius: 0.375rem;
  cursor: pointer;
  font-weight: 500;
}

button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.reject-btn {
  background-color: #f3f4f6;
  color: #374151;
}

.reject-btn:hover:not(:disabled) {
  background-color: #e5e7eb;
}

.approve-btn {
  background-color: #3b82f6;
  color: white;
}

.approve-btn:hover:not(:disabled) {
  background-color: #2563eb;
}
</style>
