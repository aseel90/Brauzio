import { defineConfig } from 'wxt';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env') });
config({ path: resolve(process.cwd(), '.env.local') });

const CHROME_EXTENSION_KEY = process.env.CHROME_EXTENSION_KEY;

export default defineConfig({
  modules: ['@wxt-dev/module-vue'],
  runner: { disabled: true },
  manifest: {
    key: CHROME_EXTENSION_KEY,
    minimum_chrome_version: '116',
    default_locale: 'ar',
    name: '__MSG_extensionName__',
    description: '__MSG_extensionDescription__',
    icons: {
      16: 'icon/16.png',
      32: 'icon/32.png',
      48: 'icon/48.png',
      96: 'icon/96.png',
      128: 'icon/128.png',
    },
    permissions: [
      'tabs',
      'activeTab',
      'scripting',
      'downloads',
      'webRequest',
      'webNavigation',
      'debugger',
      'history',
      'bookmarks',
      'offscreen',
      'storage',
      'declarativeNetRequest',
    ],
    host_permissions: ['<all_urls>'],
    action: {
      default_popup: 'popup.html',
      default_title: 'Brauzio',
      default_icon: {
        16: 'icon/16.png',
        32: 'icon/32.png',
        48: 'icon/48.png',
        128: 'icon/128.png',
      },
    },
    web_accessible_resources: [
      {
        resources: ['/inject-scripts/*'],
        matches: ['<all_urls>'],
      },
    ],
  },
  vite: (env) => ({
    plugins: [
      viteStaticCopy({
        targets: [
          { src: 'inject-scripts/*.js', dest: 'inject-scripts' },
          { src: '_locales/**/*', dest: '_locales' },
        ],
        hook: 'buildStart',
        watch: {} as any,
      }) as any,
    ],
    build: {
      target: 'es2015',
      sourcemap: env.mode !== 'production',
      reportCompressedSize: false,
      chunkSizeWarningLimit: 1200,
      minify: false,
    },
  }),
});
