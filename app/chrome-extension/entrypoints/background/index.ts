import { initRemoteRelayListener } from './remote-relay';
import {
  initSemanticSimilarityListener,
  initializeSemanticEngineIfCached,
} from './semantic-similarity';
import { initStorageManagerListener } from './storage-manager';
import { cleanupModelCache } from '@/utils/semantic-similarity-engine';
import { initRecordReplayListeners } from './record-replay';
import { initElementMarkerListeners } from './element-marker';
import { initWebEditorListeners } from './web-editor';
import { initQuickPanelAgentHandler } from './quick-panel/agent-handler';
import { initQuickPanelCommands } from './quick-panel/commands';
import { initQuickPanelTabsHandler } from './quick-panel/tabs-handler';

// Record-Replay V3 (feature flag)
import { bootstrapV3 } from './record-replay-v3/bootstrap';

/**
 * Feature flag for RR-V3.
 */
const ENABLE_RR_V3 = true;

/**
 * Background script entry point.
 * Brauzio uses the Cloudflare relay by default; the legacy native host remains
 * in the source tree only as a compatibility path and is not auto-started.
 */
export default defineBackground(() => {
  chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === 'install') {
      chrome.tabs.create({
        url: chrome.runtime.getURL('/welcome.html'),
      });
    }
  });

  // Cloud connection used by ChatGPT Remote MCP -> Cloudflare -> Brauzio.
  initRemoteRelayListener();

  // Core extension services.
  initSemanticSimilarityListener();
  initStorageManagerListener();
  initRecordReplayListeners();

  if (ENABLE_RR_V3) {
    bootstrapV3()
      .then((runtime) => {
        console.log(`[RR-V3] Bootstrap complete, ownerId: ${runtime.ownerId}`);
      })
      .catch((error) => {
        console.error('[RR-V3] Bootstrap failed:', error);
      });
  }

  initElementMarkerListeners();
  initWebEditorListeners();
  initQuickPanelAgentHandler();
  initQuickPanelTabsHandler();
  initQuickPanelCommands();

  initializeSemanticEngineIfCached()
    .then((initialized) => {
      if (initialized) {
        console.log('Background: Semantic similarity engine initialized from cache');
      } else {
        console.log(
          'Background: Semantic similarity engine initialization skipped (no cache found)',
        );
      }
    })
    .catch((error) => {
      console.warn('Background: Failed to conditionally initialize semantic engine:', error);
    });

  cleanupModelCache().catch((error) => {
    console.warn('Background: Initial cache cleanup failed:', error);
  });
});
