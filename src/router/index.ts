import { createRouter, createWebHashHistory, type RouteRecordRaw } from 'vue-router';


const routes: RouteRecordRaw[] = [
    { path: '/', name: 'media_view', component: () => import('../view/MediaView.vue')}
];


const router = createRouter({
    history: createWebHashHistory(),
    routes
})


export default router;