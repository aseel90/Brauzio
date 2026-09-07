import { createErrorResponse, type ToolResult } from '@/common/tool-handler';
import { TOOL_NAMES } from 'brauzio-shared';
import { BaseBrowserToolExecutor } from '../base-browser';
import { actionEngine, type V3ActionRequest } from '../../runtime-v3/action-engine';
import { elementRegistry } from '../../runtime-v3/element-registry';
import { observationService } from '../../runtime-v3/observation-service';
import type { V3ResolveTarget, V3SnapshotMode } from '../../runtime-v3/types';

interface ObserveParams {
  tabId?: number;
  windowId?: number;
  mode?: V3SnapshotMode;
  sinceSnapshotId?: string;
  maxElements?: number;
  includeScreenshot?: boolean;
  screenshotQuality?: number;
}

interface ResolveParams {
  tabId?: number;
  windowId?: number;
  snapshotId?: string;
  target: V3ResolveTarget;
  limit?: number;
  minScore?: number;
  refresh?: boolean;
}

interface ActParams extends V3ActionRequest {
  tabId?: number;
  windowId?: number;
}

abstract class V3BrowserTool extends BaseBrowserToolExecutor {
  protected async resolveTab(tabId?: number, windowId?: number): Promise<chrome.tabs.Tab & { id: number }> {
    const tab = (await this.tryGetTab(tabId)) || (await this.getActiveTabOrThrowInWindow(windowId));
    if (typeof tab.id !== 'number') throw new Error('Active tab has no ID');
    return tab as chrome.tabs.Tab & { id: number };
  }
}

class ObserveTool extends V3BrowserTool {
  name = TOOL_NAMES.BROWSER.OBSERVE;

  async execute(args: ObserveParams = {}): Promise<ToolResult> {
    try {
      const tab = await this.resolveTab(args.tabId, args.windowId);
      const result = await observationService.observe(tab, {
        mode: args.mode,
        sinceSnapshotId: args.sinceSnapshotId,
        maxElements: args.maxElements,
        includeScreenshot: args.includeScreenshot,
        screenshotQuality: args.screenshotQuality,
      });
      const content: ToolResult['content'] = [{ type: 'text', text: JSON.stringify({ success: true, ...result.snapshot }) }];
      if (result.screenshot) content.push({ type: 'image', data: result.screenshot.data, mimeType: result.screenshot.mimeType });
      return { content, isError: false };
    } catch (error) {
      return createErrorResponse(`chrome_observe failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

class ResolveTool extends V3BrowserTool {
  name = TOOL_NAMES.BROWSER.RESOLVE;

  async execute(args: ResolveParams): Promise<ToolResult> {
    if (!args?.target || typeof args.target !== 'object') return createErrorResponse('chrome_resolve requires target');
    try {
      const tab = await this.resolveTab(args.tabId, args.windowId);
      let snapshot = elementRegistry.get(args.snapshotId) || elementRegistry.latest(tab.id);
      if (!snapshot || args.refresh === true) {
        snapshot = (await observationService.observe(tab, { mode: 'compact' })).snapshot;
      }
      const result = elementRegistry.resolve(tab.id, args.target, {
        snapshotId: snapshot.snapshotId,
        limit: args.limit,
        minScore: args.minScore,
      });
      return { content: [{ type: 'text', text: JSON.stringify({ success: result.status !== 'not_found', ...result }) }], isError: result.status === 'not_found' };
    } catch (error) {
      return createErrorResponse(`chrome_resolve failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

class ActTool extends V3BrowserTool {
  name = TOOL_NAMES.BROWSER.ACT;

  async execute(args: ActParams): Promise<ToolResult> {
    if (!args?.action) return createErrorResponse('chrome_act requires action');
    try {
      const tab = await this.resolveTab(args.tabId, args.windowId);
      const result = await actionEngine.execute(tab, args);
      const content: ToolResult['content'] = [{
        type: 'text',
        text: JSON.stringify({
          success: result.evidence.success,
          evidence: result.evidence,
          resolution: result.resolution,
          observation: result.observation,
        }),
      }];
      if (result.screenshot) content.push({ type: 'image', data: result.screenshot.data, mimeType: result.screenshot.mimeType });
      return { content, isError: !result.evidence.success };
    } catch (error) {
      return createErrorResponse(`chrome_act failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

export const observeTool = new ObserveTool();
export const resolveTool = new ResolveTool();
export const actTool = new ActTool();
