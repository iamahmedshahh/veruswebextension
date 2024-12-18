<template>
  <div v-if="show" class="loading-bar">
    <div class="loading-progress"></div>
  </div>
</template>

<script>
export default {
  name: 'LoadingBar',
  props: {
    show: {
      type: Boolean,
      default: false
    }
  }
}
</script>

<style scoped>
.loading-bar {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 3px;
  background-color: #f0f0f0;
  z-index: 1000;
}

.loading-progress {
  height: 100%;
  background-color: #4CAF50;
  animation: loading 2s infinite linear;
  width: 30%;
}

@keyframes loading {
  0% {
    transform: translateX(-100%);
  }
  100% {
    transform: translateX(400%);
  }
}
</style>
