<script setup>
function handleSend() {
  // TODO: Implement send functionality
  console.log('Send clicked')
}

function handleReceive() {
  // TODO: Implement receive functionality
  console.log('Receive clicked')
}
</script>

<template>
  <div class="actions-container">
    <button @click="handleSend" class="action-button send">
      <span class="action-icon">↑</span>
      Send
    </button>
    <button @click="handleReceive" class="action-button receive">
      <span class="action-icon">↓</span>
      Receive
    </button>
  </div>
</template>

<style scoped>
.actions-container {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
  margin: 1rem 0;
}

.action-button {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  border: none;
  border-radius: 12px;
  background: white;
  cursor: pointer;
  transition: transform 0.2s, box-shadow 0.2s;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
}

.action-button:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
}

.action-button.send {
  background: var(--primary-color);
  color: white;
}

.action-button.receive {
  background: var(--secondary-color);
  color: white;
}

.action-icon {
  font-size: 1.5rem;
  margin-bottom: 0.5rem;
}
</style>
