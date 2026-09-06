/**
  * Brauzio internal note.
  * Brauzio internal note.
 */

import type { NodeId, RunId } from '../../domain/ids';
import type { RRError } from '../../domain/errors';
import { RR_ERROR_CODES, createRRError } from '../../domain/errors';

/**
  * Brauzio internal note.
 */
export type ScreenshotResult = { ok: true; base64: string } | { ok: false; error: RRError };

/**
  * Brauzio internal note.
  * Brauzio internal note.
 */
export interface ArtifactService {
  /**
    * Brauzio internal note.
   * @param tabId Tab ID
    * Brauzio internal note.
   */
  screenshot(
    tabId: number,
    options?: {
      format?: 'png' | 'jpeg';
      quality?: number;
    },
  ): Promise<ScreenshotResult>;

  /**
    * Brauzio internal note.
   * @param runId Run ID
   * @param nodeId Node ID
    * Brauzio internal note.
    * Brauzio internal note.
   */
  saveScreenshot(
    runId: RunId,
    nodeId: NodeId,
    base64: string,
    filename?: string,
  ): Promise<{ savedAs: string } | { error: RRError }>;
}

/**
  * Brauzio internal note.
  * Brauzio internal note.
 */
export function createNotImplementedArtifactService(): ArtifactService {
  return {
    screenshot: async () => ({
      ok: false,
      error: createRRError(RR_ERROR_CODES.INTERNAL, 'ArtifactService.screenshot not implemented'),
    }),
    saveScreenshot: async () => ({
      error: createRRError(
        RR_ERROR_CODES.INTERNAL,
        'ArtifactService.saveScreenshot not implemented',
      ),
    }),
  };
}

/**
  * Brauzio internal note.
  * Brauzio internal note.
 */
export function createChromeArtifactService(): ArtifactService {
  // In-memory storage for screenshots (could be replaced with IndexedDB)
  const screenshotStore = new Map<string, string>();

  return {
    screenshot: async (tabId, options) => {
      try {
        // Get the window ID for the tab
        const tab = await chrome.tabs.get(tabId);
        if (!tab.windowId) {
          return {
            ok: false,
            error: createRRError(RR_ERROR_CODES.INTERNAL, `Tab ${tabId} has no window`),
          };
        }

        // Capture the visible tab
        const format = options?.format ?? 'png';
        const quality = options?.quality ?? 100;

        const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, {
          format,
          quality: format === 'jpeg' ? quality : undefined,
        });

        // Extract base64 from data URL
        const base64Match = dataUrl.match(/^data:image\/\w+;base64,(.+)$/);
        if (!base64Match) {
          return {
            ok: false,
            error: createRRError(RR_ERROR_CODES.INTERNAL, 'Invalid screenshot data URL'),
          };
        }

        return { ok: true, base64: base64Match[1] };
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return {
          ok: false,
          error: createRRError(RR_ERROR_CODES.INTERNAL, `Screenshot failed: ${message}`),
        };
      }
    },

    saveScreenshot: async (runId, nodeId, base64, filename) => {
      try {
        // Generate filename if not provided
        const savedAs = filename ?? `${runId}_${nodeId}_${Date.now()}.png`;
        const key = `${runId}/${savedAs}`;

        // Store in memory (in production, this would go to IndexedDB or cloud storage)
        screenshotStore.set(key, base64);

        return { savedAs };
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return {
          error: createRRError(RR_ERROR_CODES.INTERNAL, `Save screenshot failed: ${message}`),
        };
      }
    },
  };
}

/**
  * Brauzio internal note.
  * Brauzio internal note.
 */
export interface ArtifactPolicyExecutor {
  /**
    * Brauzio internal note.
    * Brauzio internal note.
    * Brauzio internal note.
   */
  executeScreenshotPolicy(
    policy: 'never' | 'onFailure' | 'always',
    context: {
      tabId: number;
      runId: RunId;
      nodeId: NodeId;
      failed: boolean;
      saveAs?: string;
    },
  ): Promise<{ captured: boolean; savedAs?: string; error?: RRError }>;
}

/**
  * Brauzio internal note.
 */
export function createArtifactPolicyExecutor(service: ArtifactService): ArtifactPolicyExecutor {
  return {
    executeScreenshotPolicy: async (policy, context) => {
      // Brauzio internal note.
      const shouldCapture = policy === 'always' || (policy === 'onFailure' && context.failed);

      if (!shouldCapture) {
        return { captured: false };
      }

      // Brauzio internal note.
      const result = await service.screenshot(context.tabId);
      if (!result.ok) {
        return { captured: false, error: result.error };
      }

      // Brauzio internal note.
      if (context.saveAs) {
        const saveResult = await service.saveScreenshot(
          context.runId,
          context.nodeId,
          result.base64,
          context.saveAs,
        );
        if ('error' in saveResult) {
          return { captured: true, error: saveResult.error };
        }
        return { captured: true, savedAs: saveResult.savedAs };
      }

      return { captured: true };
    },
  };
}
