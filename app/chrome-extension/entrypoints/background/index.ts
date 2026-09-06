import { initRemoteRelayListener } from './remote-relay';

/**
 * Brauzio background entry point.
 *
 * Brauzio is a cloud-first MCP bridge. The background service worker only owns
 * the Cloudflare relay lifecycle and the browser tools reached through it.
 */
export default defineBackground(() => {
  chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === 'install') {
      chrome.tabs.create({ url: chrome.runtime.getURL('/welcome.html') });
    }
  });

  initRemoteRelayListener();
});
