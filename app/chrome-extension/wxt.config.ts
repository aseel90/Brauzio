import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import { config } from 'dotenv';
import { resolve } from 'path';
import Icons from 'unplugin-icons/vite';
import Components from 'unplugin-vue-components/vite';
import IconsResolver from 'unplugin-icons/resolver';

config({ path: resolve(process.cwd(), '.env') });
config({ path: resolve(process.cwd(), '.env.local') });

const CHROME_EXTENSION_KEY = process.env.CHROME_EXTENSION_KEY;
const IS_DEV = process.env.NODE_ENV !== 'production' && process.env.MODE !== 'production';

export default defineConfig({
  modules: ['@wxt-dev/module-vue'],
  runner: {
    disabled: true,

    // chromiumArgs: [
    //   '--user-data-dir=' + homedir() + (process.platform === 'darwin'
    //     ? '/Library/Application Support/Google/Chrome'
    //     : process.platform === 'win32'
    //     ? '/AppData/Local/Google/Chrome/User Data'
    //     : '/.config/google-chrome'),
    //   '--remote-debugging-port=9222',
    // ],
  },
  manifest: {
    key: CHROME_EXTENSION_KEY,
    default_locale: 'ar',
    name: '__MSG_extensionName__',
    description: '__MSG_extensionDescription__',
    permissions: [
      'tabs',
      'activeTab',
      'scripting',
      'contextMenus',
      'downloads',
      'webRequest',
      'webNavigation',
      'debugger',
      'history',
      'bookmarks',
      'offscreen',
      'storage',
      'declarativeNetRequest',
      'alarms',
      'sidePanel',
    ],
    host_permissions: ['<all_urls>'],
    options_ui: {
      page: 'options.html',
      open_in_tab: true,
    },
    action: {
      default_popup: 'popup.html',
      default_title: 'Brauzio',
    },
    side_panel: {
      default_path: 'sidepanel.html',
    },
    commands: {
      toggle_web_editor: {
        suggested_key: { default: 'Ctrl+Shift+O', mac: 'Command+Shift+O' },
        description: 'Toggle Web Editor mode',
      },
      toggle_quick_panel: {
        suggested_key: { default: 'Ctrl+Shift+U', mac: 'Command+Shift+U' },
        description: 'Toggle Quick Panel AI Chat',
      },
    },
    web_accessible_resources: [
      {
        resources: ['/models/*', '/workers/*', '/inject-scripts/*'],
        matches: ['<all_urls>'],
      },
    ],
    ...(IS_DEV
      ? {}
      : {
          cross_origin_embedder_policy: { value: 'require-corp' as const },
          cross_origin_opener_policy: { value: 'same-origin' as const },
          content_security_policy: {
            extension_pages:
              "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:;",
          },
        }),
  },
  vite: (env) => ({
    plugins: [
      tailwindcss(),
      Components({
        dts: false,
        resolvers: [IconsResolver({ prefix: 'i', enabledCollections: ['lucide', 'mdi', 'ri'] })],
      }) as any,
      Icons({ compiler: 'vue3', autoInstall: false }) as any,
      // WXT validates web_accessible_resources before Rollup's writeBundle phase.
      // Copy these files at buildStart so they always exist before manifest validation.
      viteStaticCopy({
        targets: [
          {
            src: 'inject-scripts/*.js',
            dest: 'inject-scripts',
          },
          {
            src: ['workers/*'],
            dest: 'workers',
          },
          {
            src: '_locales/**/*',
            dest: '_locales',
          },
        ],
        hook: 'buildStart',
        watch: {} as any,
      }) as any,
    ],
    build: {
      target: 'es2015',
      sourcemap: env.mode !== 'production',
      reportCompressedSize: false,
      chunkSizeWarningLimit: 1500,
      minify: false,
    },
  }),
});
