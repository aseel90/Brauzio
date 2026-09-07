import { cdpRouter, type CdpEventEnvelope } from '@/utils/cdp-router';
import type { V3JournalEvent } from './types';

const MAX_EVENTS_PER_TAB = 500;

function cleanUrl(value: unknown): string {
  const raw = String(value || '');
  if (!raw) return '';
  try {
    const parsed = new URL(raw);
    parsed.username = '';
    parsed.password = '';
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString().slice(0, 4096);
  } catch {
    return raw.slice(0, 4096);
  }
}

function summarize(event: CdpEventEnvelope): V3JournalEvent['summary'] {
  const p = (event.params || {}) as Record<string, any>;
  switch (event.method) {
    case 'Page.frameNavigated': {
      const frame = (p.frame || {}) as Record<string, any>;
      return { frameId: frame.id, parentId: frame.parentId, url: cleanUrl(frame.url), loaderId: frame.loaderId };
    }
    case 'Network.requestWillBeSent': {
      const request = (p.request || {}) as Record<string, any>;
      return { requestId: p.requestId, type: p.type, method: request.method, url: cleanUrl(request.url) };
    }
    case 'Network.responseReceived': {
      const response = (p.response || {}) as Record<string, any>;
      return { requestId: p.requestId, type: p.type, status: response.status, mimeType: response.mimeType, url: cleanUrl(response.url) };
    }
    case 'Network.loadingFinished':
      return { requestId: p.requestId, encodedDataLength: p.encodedDataLength };
    case 'Network.loadingFailed':
      return { requestId: p.requestId, errorText: p.errorText, canceled: p.canceled };
    case 'Runtime.exceptionThrown': {
      const details = (p.exceptionDetails || {}) as Record<string, any>;
      return { text: String(details.text || details.exception?.description || '').slice(0, 1500) };
    }
    case 'Runtime.consoleAPICalled':
      return { type: p.type, text: (Array.isArray(p.args) ? p.args : []).map((arg: any) => String(arg?.value ?? arg?.description ?? '')).join(' ').slice(0, 1500) };
    case 'Log.entryAdded':
      return { level: p.entry?.level, text: String(p.entry?.text || '').slice(0, 1500), url: cleanUrl(p.entry?.url) };
    case 'Target.attachedToTarget':
      return { sessionId: p.sessionId, targetId: p.targetInfo?.targetId, type: p.targetInfo?.type, url: cleanUrl(p.targetInfo?.url) };
    case 'Target.detachedFromTarget':
      return { sessionId: p.sessionId, targetId: p.targetId };
    default:
      return undefined;
  }
}

function categoryFor(method: string): V3JournalEvent['category'] {
  if (method.startsWith('Page.')) return 'navigation';
  if (method.startsWith('Network.')) return 'network';
  if (method.startsWith('Runtime.')) return 'runtime';
  if (method.startsWith('Log.')) return 'log';
  if (method.startsWith('Target.')) return 'target';
  return 'other';
}

class EventJournal {
  private sequence = 0;
  private events = new Map<number, V3JournalEvent[]>();
  private unsubscribers = new Map<number, () => void>();
  private activeActions = new Map<number, string>();

  constructor() {
    chrome.tabs.onCreated.addListener((tab) => {
      if (typeof tab.id !== 'number') return;
      const summary = {
        tabId: tab.id,
        windowId: tab.windowId,
        openerTabId: tab.openerTabId,
        url: cleanUrl(tab.pendingUrl || tab.url),
      };
      this.push(tab.id, { method: 'Tab.created', category: 'tab', summary });
      if (typeof tab.openerTabId === 'number' && this.activeActions.has(tab.openerTabId)) {
        this.push(tab.openerTabId, { method: 'Tab.childCreated', category: 'tab', summary });
      }
    });
    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      if (!changeInfo.url && !changeInfo.status && !changeInfo.title) return;
      this.push(tabId, {
        method: 'Tab.updated',
        category: 'tab',
        summary: {
          status: changeInfo.status,
          title: changeInfo.title,
          url: cleanUrl(changeInfo.url || tab.url),
        },
      });
    });
    chrome.tabs.onRemoved.addListener((tabId) => {
      this.unsubscribers.get(tabId)?.();
      this.unsubscribers.delete(tabId);
      this.events.delete(tabId);
      this.activeActions.delete(tabId);
    });
    chrome.downloads.onCreated.addListener((item) => {
      this.pushForLikelyActiveTab({
        method: 'Download.created',
        category: 'download',
        summary: { downloadId: item.id, filename: item.filename, url: cleanUrl(item.url), state: item.state },
      });
    });
    chrome.downloads.onChanged.addListener((delta) => {
      this.pushForLikelyActiveTab({
        method: 'Download.changed',
        category: 'download',
        summary: { downloadId: delta.id, state: delta.state?.current, filename: delta.filename?.current },
      });
    });
  }

  beginAction(tabId: number, actionId: string): () => void {
    const previous = this.activeActions.get(tabId);
    this.activeActions.set(tabId, actionId);
    return () => {
      if (this.activeActions.get(tabId) !== actionId) return;
      if (previous) this.activeActions.set(tabId, previous);
      else this.activeActions.delete(tabId);
    };
  }

  ensure(tabId: number): void {
    if (this.unsubscribers.has(tabId)) return;
    const owner = `v3-journal:${tabId}`;
    const unsubscribe = cdpRouter.subscribeEvents(owner, (event) => {
      this.push(tabId, {
        sessionId: event.sessionId,
        method: event.method,
        category: categoryFor(event.method),
        receivedAt: event.receivedAt,
        summary: summarize(event),
      });
    }, { tabId });
    this.unsubscribers.set(tabId, unsubscribe);
  }

  private pushForLikelyActiveTab(input: Omit<V3JournalEvent, 'sequence' | 'tabId' | 'receivedAt'> & { receivedAt?: number }): void {
    const scopedTabs = [...this.activeActions.keys()];
    if (scopedTabs.length === 1) {
      this.push(scopedTabs[0], input);
      return;
    }
    void chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
      if (typeof tab?.id === 'number') this.push(tab.id, input);
    }).catch(() => undefined);
  }

  private push(
    tabId: number,
    input: Omit<V3JournalEvent, 'sequence' | 'tabId' | 'receivedAt'> & { receivedAt?: number },
  ): void {
    const list = this.events.get(tabId) || [];
    list.push({
      sequence: ++this.sequence,
      tabId,
      actionId: input.actionId || this.activeActions.get(tabId),
      sessionId: input.sessionId,
      method: input.method,
      category: input.category,
      receivedAt: input.receivedAt ?? Date.now(),
      summary: input.summary,
    });
    if (list.length > MAX_EVENTS_PER_TAB) list.splice(0, list.length - MAX_EVENTS_PER_TAB);
    this.events.set(tabId, list);
  }

  cursor(tabId: number): number {
    const list = this.events.get(tabId) || [];
    return list[list.length - 1]?.sequence || 0;
  }

  read(tabId: number, options: { afterSequence?: number; since?: number; until?: number; actionId?: string; limit?: number } = {}): V3JournalEvent[] {
    const list = this.events.get(tabId) || [];
    const filtered = list.filter((event) => {
      if (typeof options.afterSequence === 'number' && event.sequence <= options.afterSequence) return false;
      if (typeof options.since === 'number' && event.receivedAt < options.since) return false;
      if (typeof options.until === 'number' && event.receivedAt > options.until) return false;
      if (options.actionId && event.actionId !== options.actionId) return false;
      return true;
    });
    return filtered.slice(-Math.max(1, Math.min(options.limit ?? 120, 300)));
  }
}

export const eventJournal = new EventJournal();
