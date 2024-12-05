import { createRouter, createWebHashHistory } from 'vue-router';
import UnlockPage from './components/UnlockPage.vue';

const routes = [
  {
    path: '/unlock',
    name: 'unlock',
    component: UnlockPage
  }
];

const router = createRouter({
  history: createWebHashHistory(),
  routes
});

export default router;
