// Import polyfills first
import './polyfills';
import browser from 'webextension-polyfill';
import '@fortawesome/fontawesome-free/css/all.css'

import { createApp } from 'vue';
import App from './App.vue';
import store from './store';
import router from './router';
import './style.css';

// Initialize the app
const app = createApp(App);
app.use(store);
app.use(router);

// Mount the app immediately, RPC initialization will be handled by the store
app.mount('#app');
