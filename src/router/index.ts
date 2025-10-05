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
];


const router = createRouter({
    history: createWebHashHistory(),
    routes
})


export default router;
