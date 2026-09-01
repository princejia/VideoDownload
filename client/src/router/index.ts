import { createRouter, createWebHistory } from 'vue-router';

const router = createRouter({
  // 跟随 Vite base，子路径部署（GitHub Pages 项目站点）时路由才能正确匹配
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', name: 'home', component: () => import('@/views/HomeView.vue') },
    { path: '/tasks', name: 'tasks', component: () => import('@/views/TasksView.vue'), meta: { title: '下载任务' } },
    { path: '/history', name: 'history', component: () => import('@/views/HistoryView.vue'), meta: { title: '下载历史' } },
    { path: '/dashboard', name: 'dashboard', component: () => import('@/views/DashboardView.vue'), meta: { title: 'Dashboard' } },
    { path: '/settings', name: 'settings', component: () => import('@/views/SettingsView.vue'), meta: { title: '设置' } },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
});

router.afterEach((to) => {
  const title = (to.meta.title as string) ?? '在线视频下载管理器';
  document.title = `${title} · 在线视频下载管理器`;
});

export default router;
