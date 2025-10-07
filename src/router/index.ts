import { createRouter, createWebHashHistory, type RouteRecordRaw } from 'vue-router';


const routes: RouteRecordRaw[] = [
  { path: '/', redirect: { name: 'media_view' } },
  {
    path: '/media',
    name: 'media_view',
    components: {
      default: () => import('../components/MediaView/MediaView.vue'),
      filelist: () => import('../components/FileList/MediaFileListPane.vue'),
    },
  },
  {
    path: '/editor',
    name: 'pdf_editor',
    components: {
      default: () => import('../components/PdfEditor/PdfEditorView.vue'),
      filelist: () => import('../components/FileList/PdfFileListPane.vue'),
    },
  },
  {
    path: '/settings',
    name: 'settings',
    components: {
      default: () => import('../components/Settings/SettingsView.vue'),
      filelist: () => import('../components/Settings/SettingsNav.vue'),
    },
  },
];


const router = createRouter({
  history: createWebHashHistory(),
  routes,
  scrollBehavior(to) {
    if (to.hash) {
      return { el: to.hash, behavior: 'smooth', top: 64 }
    }
    return { top: 0 }
  }
})


export default router;
