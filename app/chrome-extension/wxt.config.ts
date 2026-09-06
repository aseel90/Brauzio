import { defineConfig } from 'wxt';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import { config } from 'dotenv';
import { resolve } from 'path';

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
      'contextMenus',
      'downloads',
      'webRequest',
      'webNavigation',
      'debugger',
      'history',
      'bookmarks',
      'storage',
      'declarativeNetRequest',
      'alarms',
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
    ...(IS_DEV
      ? {}
      : {
          content_security_policy: {
            extension_pages:
              "script-src 'self'; object-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:;",
          },
        }),
  },
  vite: (env) => ({
    plugins: [
      // WXT validates web_accessible_resources before Rollup's writeBundle phase.
      // Copy these files at buildStart so they always exist before manifest validation.
      viteStaticCopy({
        targets: [
          {
            src: 'inject-scripts/*.js',
            dest: 'inject-scripts',
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
