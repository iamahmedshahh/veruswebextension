import { createRouter, createWebHashHistory } from 'vue-router';
import UnlockPage from './components/UnlockPage.vue';
import WalletSetup from './components/WalletSetup.vue';
import ConnectApproval from './components/ConnectApproval.vue';
import WalletDashboard from './components/WalletDashboard.vue';
import CurrencyDetails from './components/CurrencyDetails.vue';
import Login from './components/Login.vue';
import store from './store';

const routes = [
  {
    path: '/',
    name: 'dashboard',
    component: WalletDashboard,
    meta: { requiresAuth: true }
  },
  {
    path: '/login',
    name: 'login',
    component: Login
  },
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
  },
  {
    path: '/currency/:currency',
    name: 'currency-details',
    component: CurrencyDetails,
    props: true,
    meta: { requiresAuth: true }
  }
];

const router = createRouter({
  history: createWebHashHistory(),
  routes
});

// Navigation guard
router.beforeEach(async (to, from, next) => {
  // Wait for store to initialize
  if (!store.state.wallet.initialized) {
    await store.dispatch('wallet/initializeState');
  }

  const requiresAuth = to.matched.some(record => record.meta.requiresAuth);
  const isLoggedIn = store.state.wallet.isLoggedIn;
  const isLocked = store.state.wallet.isLocked;
  const hasWallet = store.state.wallet.hasWallet;

  console.log('Route guard:', { 
    to: to.path, 
    requiresAuth, 
    isLoggedIn, 
    isLocked, 
    hasWallet 
  });

  if (!hasWallet && to.path !== '/setup') {
    next('/setup');
  } else if (requiresAuth && !isLoggedIn) {
    next('/login');
  } else if (requiresAuth && isLocked) {
    next('/login');
  } else if (to.path === '/login' && isLoggedIn && !isLocked) {
    next('/');
  } else {
    next();
  }
});

export default router;
