import { cdpRouter, type CdpChildSessionSnapshot } from '@/utils/cdp-router';
import { eventJournal } from './event-journal';
import { runtimeState } from './runtime-state';
import type { V3Frame, V3TabSummary } from './types';

interface FrameTreeNode {
  frame: {
    id: string;
    parentId?: string;
    loaderId?: string;
    url?: string;
    name?: string;
    securityOrigin?: string;
  };
  childFrames?: FrameTreeNode[];
}

function flattenFrames(node?: FrameTreeNode, result: V3Frame[] = []): V3Frame[] {
  if (!node?.frame?.id) return result;
  result.push({
    frameId: node.frame.id,
    parentFrameId: node.frame.parentId,
    loaderId: node.frame.loaderId,
    url: node.frame.url,
    name: node.frame.name,
    securityOrigin: node.frame.securityOrigin,
  });
  for (const child of node.childFrames || []) flattenFrames(child, result);
  return result;
}

class SessionGraphService {
  private enabled = new Set<number>();

  constructor() {
    chrome.tabs.onRemoved.addListener((tabId) => this.enabled.delete(tabId));
  }

  async ensure(tabId: number): Promise<void> {
    const owner = `v3-session-graph:${tabId}`;
    const snapshot = cdpRouter.getSessionSnapshot(tabId)[0];
    if (!snapshot?.owners?.[owner]) await cdpRouter.attach(tabId, owner);
    eventJournal.ensure(tabId);

    if (!this.enabled.has(tabId)) {
      await cdpRouter.sendCommand(tabId, 'Target.setDiscoverTargets', { discover: true }).catch(() => undefined);
      await cdpRouter.sendCommand(tabId, 'Target.setAutoAttach', {
        autoAttach: true,
        waitForDebuggerOnStart: false,
        flatten: true,
      }).catch(() => undefined);
      await this.enableDomains(tabId);
      this.enabled.add(tabId);
      await runtimeState.patch(tabId, { sessionGraphEnabled: true });
    } else {
      await this.enableChildDomains(tabId);
    }
  }

  private async enableDomains(tabId: number): Promise<void> {
    await cdpRouter.sendCommand(tabId, 'Page.enable').catch(() => undefined);
    await cdpRouter.sendCommand(tabId, 'Runtime.enable').catch(() => undefined);
    await cdpRouter.sendCommand(tabId, 'Network.enable').catch(() => undefined);
    await cdpRouter.sendCommand(tabId, 'Log.enable').catch(() => undefined);
    await cdpRouter.sendCommand(tabId, 'DOM.enable').catch(() => undefined);
    await this.enableChildDomains(tabId);
  }

  private async enableChildDomains(tabId: number): Promise<void> {
    for (const child of cdpRouter.getChildSessionSnapshot(tabId)) {
      await cdpRouter.sendToChild(tabId, child.sessionId, 'Page.enable').catch(() => undefined);
      await cdpRouter.sendToChild(tabId, child.sessionId, 'Runtime.enable').catch(() => undefined);
      await cdpRouter.sendToChild(tabId, child.sessionId, 'Network.enable').catch(() => undefined);
      await cdpRouter.sendToChild(tabId, child.sessionId, 'Log.enable').catch(() => undefined);
      await cdpRouter.sendToChild(tabId, child.sessionId, 'DOM.enable').catch(() => undefined);
    }
  }

  async frames(tabId: number): Promise<V3Frame[]> {
    await this.ensure(tabId);
    const response: { frameTree?: FrameTreeNode } = await cdpRouter
      .sendCommand<{ frameTree?: FrameTreeNode }>(tabId, 'Page.getFrameTree')
      .catch(() => ({} as { frameTree?: FrameTreeNode }));
    const frames = flattenFrames(response.frameTree);
    const childByTarget = new Map<string, CdpChildSessionSnapshot>();
    for (const child of cdpRouter.getChildSessionSnapshot(tabId)) childByTarget.set(child.targetId, child);
    for (const frame of frames) {
      const child = childByTarget.get(frame.frameId);
      if (child) {
        frame.sessionId = child.sessionId;
        frame.targetId = child.targetId;
      }
    }
    return frames;
  }

  async tabs(): Promise<V3TabSummary[]> {
    const tabs = await chrome.tabs.query({});
    return tabs
      .filter((tab): tab is chrome.tabs.Tab & { id: number } => typeof tab.id === 'number')
      .map((tab) => ({
        tabId: tab.id,
        windowId: tab.windowId,
        active: tab.active,
        title: String(tab.title || ''),
        url: String(tab.url || tab.pendingUrl || ''),
        openerTabId: tab.openerTabId,
        status: tab.status,
      }));
  }

  childSessions(tabId: number): CdpChildSessionSnapshot[] {
    return cdpRouter.getChildSessionSnapshot(tabId);
  }
}

export const sessionGraph = new SessionGraphService();
