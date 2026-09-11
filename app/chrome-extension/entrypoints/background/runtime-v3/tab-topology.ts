import { cdpRouter, type CdpEventEnvelope } from '@/utils/cdp-router';

export type TabTopologyKind = 'normal' | 'child_tab' | 'popup' | 'child_popup' | 'devtools';
export type TabTopologyConfidence = 'high' | 'medium' | 'low';

export interface TabTopologyRecord {
  tabId: number;
  windowId: number;
  windowType: string;
  kind: TabTopologyKind;
  confidence: TabTopologyConfidence;
  sources: string[];
  openerTabId?: number;
  parentTabId?: number;
  rootTabId: number;
  createdAt: number;
  updatedAt: number;
}

interface WindowOpenHint {
  parentTabId: number;
  url: string;
  windowName?: string;
  userGesture?: boolean;
  capturedAt: number;
}

const STORAGE_KEY = 'brauzio-tab-topology-v1';
const WINDOW_OPEN_HINT_TTL_MS = 3_000;

function now(): number {
  return Date.now();
}

function tabUrl(tab: chrome.tabs.Tab): string {
  return String(tab.pendingUrl || tab.url || '');
}

function classify(windowType: string, hasParent: boolean): TabTopologyKind {
  if (windowType === 'devtools') return 'devtools';
  if (windowType === 'popup') return hasParent ? 'child_popup' : 'popup';
  return hasParent ? 'child_tab' : 'normal';
}

class TabTopologyService {
  private records = new Map<number, TabTopologyRecord>();
  private windowTypes = new Map<number, string>();
  private windowOpenHints: WindowOpenHint[] = [];
  private initPromise: Promise<void> | null = null;
  private listenersRegistered = false;

  ensureInitialized(): Promise<void> {
    if (!this.initPromise) this.initPromise = this.initialize();
    return this.initPromise;
  }

  private async initialize(): Promise<void> {
    await this.restore().catch(() => undefined);
    this.registerListeners();
    await this.reconcile();
  }

  private registerListeners(): void {
    if (this.listenersRegistered) return;
    this.listenersRegistered = true;

    chrome.tabs.onCreated.addListener((tab) => {
      void this.captureTab(tab, 'chrome.tabs.onCreated', true).then(() => this.persist()).catch(() => undefined);
    });

    chrome.tabs.onAttached.addListener((tabId, info) => {
      void this.refreshTab(tabId, info.newWindowId, 'chrome.tabs.onAttached').then(() => this.persist()).catch(() => undefined);
    });

    chrome.tabs.onDetached.addListener((tabId) => {
      const existing = this.records.get(tabId);
      if (!existing) return;
      existing.updatedAt = now();
      if (!existing.sources.includes('chrome.tabs.onDetached')) existing.sources.push('chrome.tabs.onDetached');
      void this.persist();
    });

    chrome.tabs.onReplaced.addListener((addedTabId, removedTabId) => {
      void this.replaceTabId(addedTabId, removedTabId).then(() => this.persist()).catch(() => undefined);
    });

    chrome.tabs.onRemoved.addListener((tabId) => {
      this.records.delete(tabId);
      void this.persist();
    });

    chrome.windows.onCreated.addListener((window) => {
      if (typeof window.id === 'number') this.windowTypes.set(window.id, String(window.type || 'normal'));
    });

    chrome.windows.onRemoved.addListener((windowId) => {
      this.windowTypes.delete(windowId);
    });

    // Passive only: this subscription receives CDP events when another Brauzio
    // feature already owns a debugger session. It never attaches CDP itself.
    cdpRouter.subscribeEvents('tab-topology-passive', (event) => this.captureCdpSignal(event));
  }

  private async restore(): Promise<void> {
    const stored = await chrome.storage.session.get(STORAGE_KEY);
    const raw = stored[STORAGE_KEY];
    if (!raw || typeof raw !== 'object') return;
    for (const [key, value] of Object.entries(raw as Record<string, TabTopologyRecord>)) {
      const tabId = Number(key);
      if (!Number.isInteger(tabId) || !value || typeof value !== 'object') continue;
      this.records.set(tabId, { ...value, tabId });
    }
  }

  private async persist(): Promise<void> {
    const payload: Record<string, TabTopologyRecord> = {};
    for (const [tabId, record] of this.records) payload[String(tabId)] = record;
    await chrome.storage.session.set({ [STORAGE_KEY]: payload });
  }

  private captureCdpSignal(event: CdpEventEnvelope): void {
    if (event.method !== 'Page.windowOpen') return;
    const params = (event.params || {}) as Record<string, unknown>;
    this.windowOpenHints.push({
      parentTabId: event.tabId,
      url: String(params.url || ''),
      windowName: typeof params.windowName === 'string' ? params.windowName : undefined,
      userGesture: params.userGesture === true,
      capturedAt: event.receivedAt || now(),
    });
    this.pruneWindowOpenHints();
  }

  private pruneWindowOpenHints(): void {
    const cutoff = now() - WINDOW_OPEN_HINT_TTL_MS;
    this.windowOpenHints = this.windowOpenHints.filter((hint) => hint.capturedAt >= cutoff);
  }

  private takeWindowOpenHint(url: string): WindowOpenHint | undefined {
    this.pruneWindowOpenHints();
    if (!this.windowOpenHints.length) return undefined;

    const exact = url
      ? this.windowOpenHints.filter((hint) => hint.url && hint.url === url)
      : [];
    let chosen: WindowOpenHint | undefined;
    if (exact.length === 1) chosen = exact[0];
    else if (this.windowOpenHints.length === 1) chosen = this.windowOpenHints[0];
    if (!chosen) return undefined;

    this.windowOpenHints = this.windowOpenHints.filter((hint) => hint !== chosen);
    return chosen;
  }

  private async windowType(windowId: number): Promise<string> {
    const cached = this.windowTypes.get(windowId);
    if (cached) return cached;
    try {
      const window = await chrome.windows.get(windowId);
      const type = String(window.type || 'normal');
      this.windowTypes.set(windowId, type);
      return type;
    } catch {
      return 'unknown';
    }
  }

  private rootFor(parentTabId: number | undefined, selfTabId: number): number {
    if (typeof parentTabId !== 'number') return selfTabId;
    const parent = this.records.get(parentTabId);
    return parent?.rootTabId || parentTabId;
  }

  private async captureTab(
    tab: chrome.tabs.Tab,
    source: string,
    allowWindowOpenHint = false,
  ): Promise<TabTopologyRecord | undefined> {
    if (typeof tab.id !== 'number') return undefined;
    const tabId = tab.id;
    const windowType = await this.windowType(tab.windowId);
    const existing = this.records.get(tabId);

    const openerTabId = typeof tab.openerTabId === 'number' ? tab.openerTabId : existing?.openerTabId;
    let parentTabId = openerTabId ?? existing?.parentTabId;
    let confidence: TabTopologyConfidence = openerTabId !== undefined ? 'high' : existing?.confidence || 'high';
    const sources = new Set(existing?.sources || []);
    sources.add(source);

    if (typeof tab.openerTabId === 'number') sources.add('chrome.openerTabId');

    if (parentTabId === undefined && allowWindowOpenHint) {
      const hint = this.takeWindowOpenHint(tabUrl(tab));
      if (hint) {
        parentTabId = hint.parentTabId;
        confidence = 'medium';
        sources.add('cdp.Page.windowOpen');
      }
    }

    const createdAt = existing?.createdAt || now();
    const record: TabTopologyRecord = {
      tabId,
      windowId: tab.windowId,
      windowType,
      kind: classify(windowType, parentTabId !== undefined),
      confidence,
      sources: [...sources],
      openerTabId,
      parentTabId,
      rootTabId: this.rootFor(parentTabId, tabId),
      createdAt,
      updatedAt: now(),
    };
    this.records.set(tabId, record);
    return record;
  }

  private async refreshTab(tabId: number, windowId?: number, source = 'refresh'): Promise<void> {
    try {
      const tab = await chrome.tabs.get(tabId);
      void windowId;
      await this.captureTab(tab, source);
    } catch {
      // The tab may have disappeared between the event and the async lookup.
    }
  }

  private async replaceTabId(addedTabId: number, removedTabId: number): Promise<void> {
    const previous = this.records.get(removedTabId);
    this.records.delete(removedTabId);

    for (const record of this.records.values()) {
      if (record.openerTabId === removedTabId) record.openerTabId = addedTabId;
      if (record.parentTabId === removedTabId) record.parentTabId = addedTabId;
      if (record.rootTabId === removedTabId) record.rootTabId = addedTabId;
    }
    for (const hint of this.windowOpenHints) {
      if (hint.parentTabId === removedTabId) hint.parentTabId = addedTabId;
    }

    try {
      const tab = await chrome.tabs.get(addedTabId);
      const record = await this.captureTab(tab, 'chrome.tabs.onReplaced');
      if (record && previous) {
        record.createdAt = previous.createdAt;
        if (record.parentTabId === undefined) record.parentTabId = previous.parentTabId;
        if (record.openerTabId === undefined) record.openerTabId = previous.openerTabId;
        record.rootTabId = previous.rootTabId === removedTabId ? addedTabId : previous.rootTabId;
        record.sources = [...new Set([...previous.sources, ...record.sources])];
        record.kind = classify(record.windowType, record.parentTabId !== undefined);
        record.updatedAt = now();
      }
    } catch {
      // If Chrome replaced and immediately removed the new tab, there is nothing to retain.
    }
  }

  async reconcile(): Promise<void> {
    const windows = await chrome.windows.getAll({ populate: true });
    const openTabIds = new Set<number>();

    for (const window of windows) {
      if (typeof window.id !== 'number') continue;
      const type = String(window.type || 'normal');
      this.windowTypes.set(window.id, type);
      for (const tab of window.tabs || []) {
        if (typeof tab.id !== 'number') continue;
        openTabIds.add(tab.id);
        await this.captureTab(tab, 'reconcile');
      }
    }

    for (const tabId of [...this.records.keys()]) {
      if (!openTabIds.has(tabId)) this.records.delete(tabId);
    }
    await this.persist();
  }

  get(tabId: number): TabTopologyRecord | undefined {
    const record = this.records.get(tabId);
    return record ? { ...record, sources: [...record.sources] } : undefined;
  }

  list(): TabTopologyRecord[] {
    return [...this.records.values()].map((record) => ({ ...record, sources: [...record.sources] }));
  }
}

export const tabTopology = new TabTopologyService();
