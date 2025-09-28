import { createApp } from "vue";
import App from "./App.vue";
import './styles/them.css'
import { router } from './router'

createApp(App)
  .use(router)
  .mount("#app");
