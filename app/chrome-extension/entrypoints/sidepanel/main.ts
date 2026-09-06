import { createApp } from 'vue';
import App from './App.vue';

import '../styles/tailwind.css';
import './styles/agent-chat.css';

import { preloadAgentTheme } from './composables';
import '../../brand.css';

/**
 * Initialize and mount the Vue app.
 * Preloads theme before mounting to prevent flash.
 */
async function init(): Promise<void> {
  await preloadAgentTheme();
  createApp(App).mount('#app');
}

void init();
