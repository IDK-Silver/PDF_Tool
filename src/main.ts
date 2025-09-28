import { createApp } from "vue";
import App from "./App.vue";
import './styles/them.css'
// Bring in PDF.js viewer CSS so the text layer behaves correctly
import 'pdfjs-dist/web/pdf_viewer.css'
import { router } from './router'

createApp(App)
  .use(router)
  .mount("#app");
