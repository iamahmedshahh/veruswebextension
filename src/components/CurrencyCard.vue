<template>
  <div class="currency-card">
    <div class="currency-info">
      <div class="currency-name">{{ currency }}</div>
      <div class="balance">{{ formatBalance(balance) }}</div>
    </div>
    <div class="actions">
      <button class="action-btn send" @click="$emit('send', currency)">
        <i class="fas fa-arrow-up"></i>
        Send
      </button>
      <button class="action-btn receive" @click="$emit('receive', currency)">
        <i class="fas fa-arrow-down"></i>
        Receive
      </button>
    </div>
  </div>
</template>

<script setup>
defineProps({
  currency: {
    type: String,
    required: true
  },
  balance: {
    type: Number,
    required: true
  }
})

function formatBalance(value) {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 8
  }).format(value)
}
</script>

<style scoped>
.currency-card {
  background: #ffffff;
  border-radius: 12px;
  padding: 16px;
  margin-bottom: 12px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.currency-info {
  margin-bottom: 12px;
}

.currency-name {
  font-size: 14px;
  color: #666;
  margin-bottom: 4px;
}

.balance {
  font-size: 20px;
  font-weight: 600;
  color: #000;
}

.actions {
  display: flex;
  gap: 8px;
}

.action-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 8px;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: background-color 0.2s;
}

.action-btn.send {
  background-color: #4CAF50;
  color: white;
}

.action-btn.receive {
  background-color: #2196F3;
  color: white;
}

.action-btn:hover {
  opacity: 0.9;
}

.action-btn i {
  font-size: 12px;
}
</style>
