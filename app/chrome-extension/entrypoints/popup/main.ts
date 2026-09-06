import { createApp } from 'vue';
import './style.css';
import '../sidepanel/styles/agent-chat.css';
import { preloadAgentTheme } from '../sidepanel/composables/useAgentTheme';
import App from './App.vue';

preloadAgentTheme().then(() => {
  createApp(App).mount('#app');
});
