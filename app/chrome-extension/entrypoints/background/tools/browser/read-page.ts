import { createErrorResponse, type ToolResult } from '@/common/tool-handler';
import { BaseBrowserToolExecutor } from '../base-browser';
import { TOOL_NAMES } from 'brauzio-shared';
import { TOOL_MESSAGE_TYPES } from '@/common/message-types';
import { ERROR_MESSAGES } from '@/common/constants';

interface ReadPageParams {
  filter?: 'interactive';
  depth?: number;
  refId?: string;
  tabId?: number;
  windowId?: number;
}

interface ReadPageStats {
  processed: number;
  included: number;
  durationMs: number;
}

class ReadPageTool extends BaseBrowserToolExecutor {
  name = TOOL_NAMES.BROWSER.READ_PAGE;

  async execute(args: ReadPageParams): Promise<ToolResult> {
    const { filter, depth, refId } = args || {};
    const focusRefId = typeof refId === 'string' ? refId.trim() : '';
    if (refId !== undefined && !focusRefId) {
      return createErrorResponse(`${ERROR_MESSAGES.INVALID_PARAMETERS}: refId must be a non-empty string`);
    }

    const requestedDepth = depth === undefined ? undefined : Number(depth);
    if (requestedDepth !== undefined && (!Number.isInteger(requestedDepth) || requestedDepth < 0)) {
      return createErrorResponse(`${ERROR_MESSAGES.INVALID_PARAMETERS}: depth must be a non-negative integer`);
    }

    const userControlled = requestedDepth !== undefined || !!focusRefId;

    try {
      const tab = (await this.tryGetTab(args?.tabId)) || (await this.getActiveTabOrThrowInWindow(args?.windowId));
      if (!tab.id) return createErrorResponse(`${ERROR_MESSAGES.TAB_NOT_FOUND}: Active tab has no ID`);

      await this.injectContentScript(tab.id, ['inject-scripts/accessibility-tree-helper.js'], false, 'ISOLATED', true);
      const resp = await this.sendMessageToTab(tab.id, {
        action: TOOL_MESSAGE_TYPES.GENERATE_ACCESSIBILITY_TREE,
        filter: filter || null,
        depth: requestedDepth,
        refId: focusRefId || undefined,
      });

      const treeOk = resp?.success === true;
      const pageContent = typeof resp?.pageContent === 'string' ? resp.pageContent : '';
      const stats: ReadPageStats = treeOk && resp?.stats
        ? {
            processed: Number(resp.stats.processed ?? 0),
            included: Number(resp.stats.included ?? 0),
            durationMs: Number(resp.stats.durationMs ?? 0),
          }
        : { processed: 0, included: 0, durationMs: 0 };
      const lines = pageContent ? pageContent.split('\n').filter((line: string) => line.trim()).length : 0;
      const refCount = Array.isArray(resp?.refMap) ? resp.refMap.length : 0;
      const isSparse = !userControlled && lines < 10 && refCount < 3;

      const payload: Record<string, unknown> = {
        success: true,
        filter: filter || 'all',
        pageContent,
        tips: "If a target is missing, use screenshot to inspect its on-screen coordinates, then interact by ref or coordinates.",
        viewport: treeOk ? resp.viewport : { width: null, height: null, dpr: null },
        stats,
        refMapCount: refCount,
        sparse: treeOk ? isSparse : false,
        depth: requestedDepth ?? null,
        focus: focusRefId ? { refId: focusRefId, found: treeOk } : null,
        elements: [],
        count: 0,
        fallbackUsed: false,
        fallbackSource: null,
        reason: null,
      };

      if (treeOk && !isSparse) {
        return { content: [{ type: 'text', text: JSON.stringify(payload) }], isError: false };
      }
      if (focusRefId) return createErrorResponse(resp?.error || `refId "${focusRefId}" not found or expired`);
      if (requestedDepth !== undefined) return createErrorResponse(resp?.error || 'Failed to generate accessibility tree');

      try {
        await this.injectContentScript(tab.id, ['inject-scripts/interactive-elements-helper.js']);
        const fallback = await this.sendMessageToTab(tab.id, {
          action: TOOL_MESSAGE_TYPES.GET_INTERACTIVE_ELEMENTS,
          includeCoordinates: true,
        });
        if (fallback?.success && Array.isArray(fallback.elements)) {
          const elements = fallback.elements.slice(0, 150);
          payload.fallbackUsed = true;
          payload.fallbackSource = 'get_interactive_elements';
          payload.reason = treeOk ? 'sparse_tree' : resp?.error || 'tree_failed';
          payload.elements = elements;
          payload.count = fallback.elements.length;
          if (!pageContent) {
            payload.pageContent = elements.map((element: any) => {
              const type = typeof element?.type === 'string' ? element.type : 'element';
              const text = typeof element?.text === 'string' && element.text.trim()
                ? ` "${element.text.trim().replace(/\s+/g, ' ').slice(0, 100).replace(/"/g, '\\"')}"`
                : '';
              const selector = typeof element?.selector === 'string' && element.selector ? ` selector="${element.selector}"` : '';
              const coords = element?.coordinates && Number.isFinite(element.coordinates.x) && Number.isFinite(element.coordinates.y)
                ? ` (x=${Math.round(element.coordinates.x)},y=${Math.round(element.coordinates.y)})`
                : '';
              return `- ${type}${text}${selector}${coords}`;
            }).join('\n');
          }
          return { content: [{ type: 'text', text: JSON.stringify(payload) }], isError: false };
        }
      } catch (error) {
        console.warn('[Brauzio] read_page fallback failed', error);
      }

      return createErrorResponse(treeOk ? 'Accessibility tree is too sparse and fallback failed' : resp?.error || 'Failed to generate accessibility tree');
    } catch (error) {
      return createErrorResponse(`Error generating accessibility tree: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

export const readPageTool = new ReadPageTool();
