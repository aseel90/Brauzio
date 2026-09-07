import { initRemoteRelayListener } from './remote-relay';
import { initMouseHoldSafetyListeners } from '@/utils/mouse-hold-safety';
import { initPopupLiveViewControls } from './popup-live-view';

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

  initMouseHoldSafetyListeners();
  initPopupLiveViewControls();
  initRemoteRelayListener();
});
