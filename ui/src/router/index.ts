import { createRouter, createWebHistory } from 'vue-router';
import { installGuards } from './guards';
import { routes } from './routes';

export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
  scrollBehavior: () => ({ top: 0 }),
});

installGuards(router);
