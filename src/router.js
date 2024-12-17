import { createRouter, createWebHashHistory } from 'vue-router';
import UnlockPage from './components/UnlockPage.vue';
import WalletSetup from './components/WalletSetup.vue';
import ConnectApproval from './components/ConnectApproval.vue';

const routes = [
  {
    path: '/unlock',
    name: 'unlock',
    component: UnlockPage
  },
  {
    path: '/setup',
    name: 'setup',
    component: WalletSetup
  },
  {
    path: '/connect',
    name: 'connect',
    component: ConnectApproval
  }
];

const router = createRouter({
  history: createWebHashHistory(),
  routes
});

export default router;
