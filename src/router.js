import { createRouter, createWebHashHistory } from 'vue-router';
import UnlockPage from './components/UnlockPage.vue';
import WalletSetup from './components/WalletSetup.vue';
import ConnectApproval from './components/ConnectApproval.vue';

const routes = [
  {
    path: '/unlock',
    name: 'unlock',
    component: UnlockPage,
    props: route => ({ 
      requestId: route.query.requestId,
      origin: route.query.origin
    })
  },
  {
    path: '/setup',
    name: 'setup',
    component: WalletSetup
  },
  {
    path: '/approve',
    name: 'approve',
    component: ConnectApproval,
    props: route => ({ 
      requestId: route.query.requestId,
      origin: route.query.origin
    })
  }
];

const router = createRouter({
  history: createWebHashHistory(),
  routes
});

export default router;
