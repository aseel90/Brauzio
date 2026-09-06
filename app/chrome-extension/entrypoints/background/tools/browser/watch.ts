import { createErrorResponse, type ToolResult } from '@/common/tool-handler';
import { BaseBrowserToolExecutor } from '../base-browser';
import { cdpRouter, type CdpEventEnvelope } from '@/utils/cdp-router';
import { TOOL_NAMES } from 'brauzio-shared';

export type WatchCategory = 'navigation' | 'network' | 'errors' | 'dialogs' | 'lifecycle';

export type WatchEvent = {
  sequence: number;
  watchId: string;
  tabId: number;
  sessionId?: string;
  method: string;
  timestamp: number;
  data: Record<string, unknown>;
};

export type PersistentWatchDescriptor = {
  watchId: string;
  tabId: number;
  createdAt: number;
  expiresAt: number;
  maxEvents: number;
  nextSequence: number;
  categories?: WatchCategory[];
  methods?: string[];
  urlIncludes?: string;
};

type WatchPersistenceSink = {
  started?: (watch: PersistentWatchDescriptor) => void | Promise<void>;
  event?: (event: WatchEvent) => void | Promise<void>;
  stopped?: (watchId: string, reason: string) => void | Promise<void>;
};

let persistenceSink: WatchPersistenceSink = {};

export function configureWatchPersistenceSink(sink: WatchPersistenceSink): void {
  persistenceSink = sink || {};
}

function emitPersistence(task: void | Promise<void> | undefined): void {
  if (!task) return;
  void Promise.resolve(task).catch(() => {});
}

type WatchWaitResult = {
  event?: WatchEvent;
  timedOut?: boolean;
  stopped?: boolean;
  reason?: string;
};

type WatchWaiter = {
  id: number;
  afterSequence: number;
  method?: string;
  resolve: (result: WatchWaitResult) => void;
  timer: ReturnType<typeof setTimeout>;
};

type WatchState = {
  id: string;
  tabId: number;
  owner: string;
  createdAt: number;
  expiresAt: number;
  maxEvents: number;
  nextSequence: number;
  categories: WatchCategory[];
  customMethods: string[];
  methods: Set<string>;
  urlIncludes?: string;
  events: WatchEvent[];
  waiters: Map<number, WatchWaiter>;
  unsubscribe: () => void;
  expiryTimer: ReturnType<typeof setTimeout>;
};

const CATEGORY_METHODS: Record<WatchCategory, string[]> = {
  navigation: ['Page.frameNavigated', 'Page.domContentEventFired', 'Page.loadEventFired'],
  network: [
    'Network.requestWillBeSent',
    'Network.responseReceived',
    'Network.loadingFinished',
    'Network.loadingFailed',
  ],
  errors: ['Runtime.exceptionThrown', 'Log.entryAdded'],
  dialogs: ['Page.javascriptDialogOpening', 'Page.javascriptDialogClosed'],
  lifecycle: ['Page.lifecycleEvent'],
};

const DEFAULT_CATEGORIES: WatchCategory[] = ['navigation', 'network', 'errors'];
const MAX_WATCHES = 20;
const DEFAULT_MAX_EVENTS = 100;
const MAX_EVENTS = 500;
const DEFAULT_TTL_MS = 5 * 60_000;
const MAX_TTL_MS = 10 * 60_000;
const MAX_WAIT_MS = 120_000;

function ok(payload: Record<string, unknown>): ToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify({ success: true, ...payload }) }],
    isError: false,
  };
}

function asRecord(value: unknown): Record<string, any> {
  return value && typeof value === 'object' ? (value as Record<string, any>) : {};
}

function safeEventUrl(value: unknown): string {
  const raw = String(value || '');
  if (!raw) return '';
  try {
    const url = new URL(raw);
    url.username = '';
    url.password = '';
    url.search = '';
    url.hash = '';
    return url.toString();
  } catch {
    return raw.split('?')[0].split('#')[0].slice(0, 4096);
  }
}

function eventUrl(method: string, params?: object): string {
  const p = asRecord(params);
  if (method === 'Page.frameNavigated') return safeEventUrl(asRecord(p.frame).url);
  if (method === 'Network.requestWillBeSent') return safeEventUrl(asRecord(p.request).url || p.documentURL);
  if (method === 'Network.responseReceived') return safeEventUrl(asRecord(p.response).url);
  if (method === 'Runtime.exceptionThrown') return safeEventUrl(asRecord(p.exceptionDetails).url);
  if (method === 'Log.entryAdded') return safeEventUrl(asRecord(p.entry).url);
  if (method === 'Page.javascriptDialogOpening') return safeEventUrl(p.url);
  return '';
}

function summarizeEvent(method: string, params?: object): Record<string, unknown> {
  const p = asRecord(params);
  switch (method) {
    case 'Page.frameNavigated': {
      const frame = asRecord(p.frame);
      return {
        frameId: frame.id,
        parentId: frame.parentId,
        url: safeEventUrl(frame.url),
        name: frame.name,
        mimeType: frame.mimeType,
      };
    }
    case 'Page.domContentEventFired':
    case 'Page.loadEventFired':
      return { cdpTimestamp: p.timestamp };
    case 'Page.lifecycleEvent':
      return { frameId: p.frameId, loaderId: p.loaderId, name: p.name, cdpTimestamp: p.timestamp };
    case 'Network.requestWillBeSent': {
      const request = asRecord(p.request);
      return {
        requestId: p.requestId,
        loaderId: p.loaderId,
        documentURL: safeEventUrl(p.documentURL),
        type: p.type,
        method: request.method,
        url: safeEventUrl(request.url),
        hasPostData: Boolean(request.hasPostData),
      };
    }
    case 'Network.responseReceived': {
      const response = asRecord(p.response);
      return {
        requestId: p.requestId,
        loaderId: p.loaderId,
        type: p.type,
        url: safeEventUrl(response.url),
        status: response.status,
        statusText: response.statusText,
        mimeType: response.mimeType,
        fromDiskCache: response.fromDiskCache,
        fromServiceWorker: response.fromServiceWorker,
      };
    }
    case 'Network.loadingFinished':
      return { requestId: p.requestId, encodedDataLength: p.encodedDataLength, cdpTimestamp: p.timestamp };
    case 'Network.loadingFailed':
      return {
        requestId: p.requestId,
        type: p.type,
        errorText: p.errorText,
        canceled: p.canceled,
        blockedReason: p.blockedReason,
      };
    case 'Runtime.exceptionThrown': {
      const details = asRecord(p.exceptionDetails);
      const exception = asRecord(details.exception);
      return {
        text: details.text || exception.description,
        url: safeEventUrl(details.url),
        lineNumber: details.lineNumber,
        columnNumber: details.columnNumber,
        exceptionId: details.exceptionId,
      };
    }
    case 'Log.entryAdded': {
      const entry = asRecord(p.entry);
      return {
        source: entry.source,
        level: entry.level,
        text: entry.text,
        url: safeEventUrl(entry.url),
        lineNumber: entry.lineNumber,
      };
    }
    case 'Page.javascriptDialogOpening':
      return { url: safeEventUrl(p.url), message: p.message, type: p.type, hasBrowserHandler: p.hasBrowserHandler };
    case 'Page.javascriptDialogClosed':
      return { result: p.result, userInput: p.userInput };
    default:
      return {};
  }
}

class BrowserEventWatchEngine {
  private watches = new Map<string, WatchState>();
  private waiterSerial = 0;

  constructor() {
    chrome.tabs.onRemoved.addListener((tabId) => {
      void this.stopAll('tab_closed', tabId, true);
    });
    chrome.runtime.onSuspend.addListener(() => {
      void this.stopAll('service_worker_suspend', undefined, false);
    });
  }

  private methodsFor(categories?: WatchCategory[], methods?: string[]): Set<string> {
    const selected = categories?.length ? categories : DEFAULT_CATEGORIES;
    const result = new Set<string>();
    for (const category of selected) {
      for (const method of CATEGORY_METHODS[category] || []) result.add(method);
    }
    for (const method of methods || []) {
      const value = String(method || '').trim();
      if (value) result.add(value);
    }
    return result;
  }

  private async enableDomains(tabId: number, methods: Set<string>): Promise<string[]> {
    const domains = new Set([...methods].map((method) => method.split('.')[0]));
    const enabled: string[] = [];
    for (const domain of domains) {
      if (!['Page', 'Network', 'Runtime', 'Log'].includes(domain)) continue;
      await cdpRouter.sendCommand(tabId, `${domain}.enable`);
      enabled.push(domain);
    }
    if (methods.has('Page.lifecycleEvent')) {
      await cdpRouter.sendCommand(tabId, 'Page.setLifecycleEventsEnabled', { enabled: true });
    }
    return enabled;
  }

  private matches(state: WatchState, event: CdpEventEnvelope): boolean {
    if (!state.methods.has(event.method)) return false;
    if (!state.urlIncludes) return true;
    return eventUrl(event.method, event.params).includes(state.urlIncludes);
  }

  private record(state: WatchState, event: CdpEventEnvelope): void {
    if (!this.matches(state, event)) return;
    const item: WatchEvent = {
      sequence: ++state.nextSequence,
      watchId: state.id,
      tabId: state.tabId,
      sessionId: event.sessionId,
      method: event.method,
      timestamp: event.receivedAt,
      data: summarizeEvent(event.method, event.params),
    };
    state.events.push(item);
    if (state.events.length > state.maxEvents) {
      state.events.splice(0, state.events.length - state.maxEvents);
    }
    emitPersistence(persistenceSink.event?.(item));

    for (const [id, waiter] of state.waiters) {
      if (item.sequence <= waiter.afterSequence) continue;
      if (waiter.method && waiter.method !== item.method) continue;
      clearTimeout(waiter.timer);
      state.waiters.delete(id);
      waiter.resolve({ event: item });
    }
  }

  async start(options: {
    tabId: number;
    categories?: WatchCategory[];
    methods?: string[];
    urlIncludes?: string;
    maxEvents?: number;
    ttlMs?: number;
    watchId?: string;
    createdAt?: number;
    expiresAt?: number;
    nextSequence?: number;
  }) {
    const id = options.watchId ? String(options.watchId) : crypto.randomUUID();
    const existing = this.watches.get(id);
    if (existing) {
      return {
        watchId: existing.id,
        tabId: existing.tabId,
        enabledDomains: [],
        methods: [...existing.methods],
        maxEvents: existing.maxEvents,
        expiresAt: existing.expiresAt,
        nextSequence: existing.nextSequence,
        restored: true,
      };
    }
    if (this.watches.size >= MAX_WATCHES) {
      throw new Error(`Maximum active watches reached (${MAX_WATCHES})`);
    }

    const owner = `watch:${id}`;
    const maxEvents = Math.max(10, Math.min(Number(options.maxEvents || DEFAULT_MAX_EVENTS), MAX_EVENTS));
    const now = Date.now();
    const createdAt = Number(options.createdAt || now);
    const requestedExpiresAt = Number(options.expiresAt || 0);
    const ttlMs = Math.max(10_000, Math.min(Number(options.ttlMs || DEFAULT_TTL_MS), MAX_TTL_MS));
    const expiresAt = requestedExpiresAt > 0 ? requestedExpiresAt : now + ttlMs;
    if (expiresAt <= now) throw new Error(`Watch expired: ${id}`);
    const selectedCategories = options.categories?.length ? [...options.categories] : [...DEFAULT_CATEGORIES];
    const customMethods = Array.isArray(options.methods) ? options.methods.map(String) : [];
    const methods = this.methodsFor(selectedCategories, customMethods);
    if (!methods.size) throw new Error('At least one watch event method is required');

    await cdpRouter.attach(options.tabId, owner);
    const state: WatchState = {
      id,
      tabId: options.tabId,
      owner,
      createdAt,
      expiresAt,
      maxEvents,
      nextSequence: Math.max(0, Number(options.nextSequence || 0)),
      categories: selectedCategories,
      customMethods,
      methods,
      urlIncludes: options.urlIncludes ? String(options.urlIncludes) : undefined,
      events: [],
      waiters: new Map(),
      unsubscribe: () => {},
      expiryTimer: setTimeout(() => {
        void this.stop(id, 'expired', true);
      }, Math.min(expiresAt - now, MAX_TTL_MS)),
    };
    this.watches.set(id, state);
    try {
      state.unsubscribe = cdpRouter.subscribeEvents(owner, (event) => this.record(state, event), {
        tabId: options.tabId,
      });
      const enabledDomains = await this.enableDomains(options.tabId, methods);
      emitPersistence(
        persistenceSink.started?.({
          watchId: id,
          tabId: options.tabId,
          createdAt,
          expiresAt,
          maxEvents,
          nextSequence: state.nextSequence,
          categories: selectedCategories,
          methods: customMethods,
          urlIncludes: state.urlIncludes,
        }),
      );
      return {
        watchId: id,
        tabId: options.tabId,
        enabledDomains,
        methods: [...methods],
        maxEvents,
        expiresAt: state.expiresAt,
        nextSequence: state.nextSequence,
        restored: Boolean(options.watchId),
      };
    } catch (error) {
      await this.stop(id, 'start_failed', false);
      throw error;
    }
  }

  read(watchId: string, options: { afterSequence?: number; limit?: number; method?: string } = {}) {
    const state = this.watches.get(watchId);
    if (!state) throw new Error(`Watch not found: ${watchId}`);
    const after = Math.max(0, Number(options.afterSequence || 0));
    const limit = Math.max(1, Math.min(Number(options.limit || 50), 200));
    const events = state.events
      .filter((event) => event.sequence > after && (!options.method || event.method === options.method))
      .slice(0, limit);
    return {
      watchId,
      tabId: state.tabId,
      events,
      nextSequence: state.nextSequence,
      buffered: state.events.length,
      expiresAt: state.expiresAt,
    };
  }

  async wait(
    watchId: string,
    options: { afterSequence?: number; timeoutMs?: number; method?: string } = {},
  ): Promise<WatchWaitResult> {
    const state = this.watches.get(watchId);
    if (!state) throw new Error(`Watch not found: ${watchId}`);
    const after = Math.max(0, Number(options.afterSequence || 0));
    const existing = state.events.find(
      (event) => event.sequence > after && (!options.method || event.method === options.method),
    );
    if (existing) return { event: existing };

    const timeoutMs = Math.max(50, Math.min(Number(options.timeoutMs || 10_000), MAX_WAIT_MS));
    return await new Promise<WatchWaitResult>((resolve) => {
      const id = ++this.waiterSerial;
      const timer = setTimeout(() => {
        state.waiters.delete(id);
        resolve({ timedOut: true, reason: 'timeout' });
      }, timeoutMs);
      state.waiters.set(id, {
        id,
        afterSequence: after,
        method: options.method,
        resolve,
        timer,
      });
    });
  }

  async stop(watchId: string, reason = 'explicit_stop', notifyPersistence = true) {
    const state = this.watches.get(watchId);
    if (!state) return { watchId, stopped: false, reason: 'not_found' };
    this.watches.delete(watchId);
    clearTimeout(state.expiryTimer);
    state.unsubscribe();
    for (const waiter of state.waiters.values()) {
      clearTimeout(waiter.timer);
      waiter.resolve({ stopped: true, reason });
    }
    state.waiters.clear();
    await cdpRouter.detach(state.tabId, state.owner);
    if (notifyPersistence) emitPersistence(persistenceSink.stopped?.(watchId, reason));
    return { watchId, tabId: state.tabId, stopped: true, reason, finalSequence: state.nextSequence };
  }

  async stopAll(reason = 'stop_all', tabId?: number, notifyPersistence = false): Promise<number> {
    const ids = [...this.watches.values()]
      .filter((state) => typeof tabId !== 'number' || state.tabId === tabId)
      .map((state) => state.id);
    await Promise.allSettled(ids.map((id) => this.stop(id, reason, notifyPersistence)));
    return ids.length;
  }

}

const watchEngine = new BrowserEventWatchEngine();

export async function stopAllBrowserWatches(
  reason = 'relay_disconnected',
  tabId?: number,
  notifyPersistence = false,
): Promise<number> {
  return await watchEngine.stopAll(reason, tabId, notifyPersistence);
}

export async function restorePersistentBrowserWatches(
  watches: PersistentWatchDescriptor[],
): Promise<{ restored: number; failed: number }> {
  let restored = 0;
  let failed = 0;
  for (const watch of watches || []) {
    try {
      if (!watch?.watchId || watch.expiresAt <= Date.now()) continue;
      await watchEngine.start({
        tabId: Number(watch.tabId),
        categories: watch.categories,
        methods: watch.methods,
        urlIncludes: watch.urlIncludes,
        maxEvents: watch.maxEvents,
        watchId: watch.watchId,
        createdAt: watch.createdAt,
        expiresAt: watch.expiresAt,
        nextSequence: watch.nextSequence,
      });
      restored += 1;
    } catch {
      failed += 1;
    }
  }
  return { restored, failed };
}

export async function stopPersistentBrowserWatch(
  watchId: string,
  reason = 'cloud_stop',
): Promise<void> {
  await watchEngine.stop(watchId, reason, false);
}

class WatchStartTool extends BaseBrowserToolExecutor {
  name = TOOL_NAMES.BROWSER.WATCH_START;

  async execute(args: any): Promise<ToolResult> {
    try {
      const tab = (await this.tryGetTab(args?.tabId)) || (await this.getActiveTabOrThrowInWindow(args?.windowId));
      if (!tab.id) return createErrorResponse('Target tab not found');
      const categories = Array.isArray(args?.categories) ? args.categories : undefined;
      const methods = Array.isArray(args?.methods) ? args.methods : undefined;
      const result = await watchEngine.start({
        tabId: tab.id,
        categories,
        methods,
        urlIncludes: args?.urlIncludes,
        maxEvents: args?.maxEvents,
        ttlMs: args?.ttlMs,
      });
      return ok(result);
    } catch (error) {
      return createErrorResponse(error instanceof Error ? error.message : String(error));
    }
  }
}

class WatchWaitTool {
  name = TOOL_NAMES.BROWSER.WATCH_WAIT;
  async execute(args: any): Promise<ToolResult> {
    if (!args?.watchId) return createErrorResponse('watchId is required');
    try {
      const result = await watchEngine.wait(String(args.watchId), {
        afterSequence: args.afterSequence,
        timeoutMs: args.timeoutMs,
        method: args.method,
      });
      return ok({ watchId: String(args.watchId), ...result });
    } catch (error) {
      return createErrorResponse(error instanceof Error ? error.message : String(error));
    }
  }
}

class WatchReadTool {
  name = TOOL_NAMES.BROWSER.WATCH_READ;
  async execute(args: any): Promise<ToolResult> {
    if (!args?.watchId) return createErrorResponse('watchId is required');
    try {
      return ok(
        watchEngine.read(String(args.watchId), {
          afterSequence: args.afterSequence,
          limit: args.limit,
          method: args.method,
        }),
      );
    } catch (error) {
      return createErrorResponse(error instanceof Error ? error.message : String(error));
    }
  }
}

class WatchStopTool {
  name = TOOL_NAMES.BROWSER.WATCH_STOP;
  async execute(args: any): Promise<ToolResult> {
    if (!args?.watchId) return createErrorResponse('watchId is required');
    try {
      return ok(await watchEngine.stop(String(args.watchId)));
    } catch (error) {
      return createErrorResponse(error instanceof Error ? error.message : String(error));
    }
  }
}

export const watchStartTool = new WatchStartTool();
export const watchWaitTool = new WatchWaitTool();
export const watchReadTool = new WatchReadTool();
export const watchStopTool = new WatchStopTool();
