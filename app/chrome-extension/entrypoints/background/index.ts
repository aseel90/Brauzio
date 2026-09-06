import { initRemoteRelayListener } from './remote-relay';
import { initElementMarkerListeners } from './element-marker';

/**
 * Brauzio v2 background runtime.
 *
 * Keep startup intentionally small: the Cloudflare relay is the transport used
 * by ChatGPT, while Element Picker is a browser-control primitive used by MCP.
 * Legacy local-model, record/replay, web-editor and quick-panel runtimes are not
 * started here and are being removed from the v2 product surface.
 */
export default defineBackground(() => {
  initRemoteRelayListener();
  initElementMarkerListeners();

  console.info('[Brauzio] Core runtime ready', {
    version: chrome.runtime.getManifest().version,
    relay: 'cloudflare',
  });
});
