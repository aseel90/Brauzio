import { cdpRouter, type CdpEventEnvelope } from '@/utils/cdp-router';

export type SmartWaitCondition =
  | 'selector_exists'
  | 'selector_hidden'
  | 'text_appears'
  | 'text_disappears'
  | 'url_matches'
  | 'network_idle'
  | 'request_finished'
  | 'page_loaded';

export interface SmartWaitOptions {
  condition: SmartWaitCondition;
  selector?: string;
  text?: string;
  urlIncludes?: string;
  requestUrlIncludes?: string;
  timeoutMs?: number;
  quietMs?: number;
}

export interface SmartWaitResult {
  ok: boolean;
  condition: SmartWaitCondition;
  elapsedMs: number;
  timedOut?: boolean;
  reason?: string;
  details?: Record<string, unknown>;
}

const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_TIMEOUT_MS = 120_000;
const DEFAULT_QUIET_MS = 500;
const MAX_QUIET_MS = 5_000;

function timeoutValue(value?: number): number {
  return Math.max(100, Math.min(Number(value || DEFAULT_TIMEOUT_MS), MAX_TIMEOUT_MS));
}

function quietValue(value?: number): number {
  return Math.max(100, Math.min(Number(value || DEFAULT_QUIET_MS), MAX_QUIET_MS));
}

function cleanUrl(value: unknown): string {
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

async function waitForDomCondition(
  tabId: number,
  options: SmartWaitOptions,
  timeoutMs: number,
): Promise<Omit<SmartWaitResult, 'condition' | 'elapsedMs'>> {
  const condition = options.condition as
    | 'selector_exists'
    | 'selector_hidden'
    | 'text_appears'
    | 'text_disappears';
  const selector = String(options.selector || '');
  const text = String(options.text || '');
  const startedAt = Date.now();
  let attempts = 0;
  let lastError = '';

  while (Date.now() - startedAt < timeoutMs) {
    attempts += 1;
    const remaining = Math.max(50, timeoutMs - (Date.now() - startedAt));
    try {
      const result = await chrome.scripting.executeScript({
        target: { tabId },
        world: 'ISOLATED',
        func: async (
          conditionName: 'selector_exists' | 'selector_hidden' | 'text_appears' | 'text_disappears',
          selectorValue: string,
          textValue: string,
          waitMs: number,
        ) => {
          const visible = (element: Element | null) => {
            if (!element) return false;
            if (!(element instanceof HTMLElement)) return true;
            const style = getComputedStyle(element);
            const rect = element.getBoundingClientRect();
            return style.display !== 'none'
              && style.visibility !== 'hidden'
              && Number(style.opacity || 1) > 0
              && rect.width > 0
              && rect.height > 0;
          };
          const check = () => {
            try {
              if (conditionName === 'selector_exists') {
                return { matched: Boolean(selectorValue && document.querySelector(selectorValue)) };
              }
              if (conditionName === 'selector_hidden') {
                return { matched: !visible(document.querySelector(selectorValue)) };
              }
              const pageText = document.body?.innerText || document.documentElement?.innerText || '';
              const hasText = Boolean(textValue) && pageText.includes(textValue);
              return { matched: conditionName === 'text_appears' ? hasText : !hasText };
            } catch (error) {
              return { matched: false, error: error instanceof Error ? error.message : String(error) };
            }
          };

          const immediate = check();
          if (immediate.matched) return { ...immediate, immediate: true, mutationCount: 0 };

          return await new Promise<{ matched: boolean; error?: string; timedOut?: boolean; mutationCount: number }>((resolve) => {
            let settled = false;
            let mutationCount = 0;
            let fallbackTimer: ReturnType<typeof setInterval> | undefined;
            let timeoutTimer: ReturnType<typeof setTimeout> | undefined;
            const observer = new MutationObserver(() => {
              mutationCount += 1;
              const state = check();
              if (state.matched) finish({ ...state, mutationCount });
            });
            const finish = (value: { matched: boolean; error?: string; timedOut?: boolean; mutationCount: number }) => {
              if (settled) return;
              settled = true;
              observer.disconnect();
              if (fallbackTimer) clearInterval(fallbackTimer);
              if (timeoutTimer) clearTimeout(timeoutTimer);
              resolve(value);
            };

            const root = document.documentElement || document.body;
            if (root) {
              observer.observe(root, {
                subtree: true,
                childList: true,
                characterData: true,
                attributes: true,
                attributeFilter: ['style', 'class', 'hidden', 'aria-hidden', 'disabled', 'aria-disabled', 'value'],
              });
            }

            // MutationObserver is the primary signal. A low-frequency fallback catches
            // layout/stylesheet changes that do not mutate the target subtree.
            fallbackTimer = setInterval(() => {
              const state = check();
              if (state.matched) finish({ ...state, mutationCount });
            }, 500);
            timeoutTimer = setTimeout(() => {
              const state = check();
              finish({ ...state, timedOut: !state.matched, mutationCount });
            }, Math.max(50, waitMs));

            // Close the race between the initial check and observer registration.
            const raced = check();
            if (raced.matched) finish({ ...raced, mutationCount });
          });
        },
        args: [condition, selector, text, remaining],
      });
      const payload = result?.[0]?.result as {
        matched?: boolean;
        error?: string;
        timedOut?: boolean;
        immediate?: boolean;
        mutationCount?: number;
      } | undefined;
      if (payload?.matched) {
        return {
          ok: true,
          details: {
            immediate: Boolean(payload.immediate) && attempts === 1,
            attempts,
            mutationCount: Number(payload.mutationCount || 0),
            strategy: 'mutation_observer',
          },
        };
      }
      if (payload?.error) lastError = payload.error;
      if (payload?.timedOut) break;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      // Navigations destroy the isolated execution context. Re-arm the observer
      // in the new document while preserving the original deadline.
      const stillOpen = await chrome.tabs.get(tabId).then(() => true).catch(() => false);
      if (!stillOpen) return { ok: false, reason: 'tab_closed', details: { attempts, lastError } };
      const remaining = timeoutMs - (Date.now() - startedAt);
      if (remaining <= 0) break;
      await new Promise((resolve) => setTimeout(resolve, Math.min(100, remaining)));
    }
  }

  return {
    ok: false,
    timedOut: true,
    reason: 'timeout',
    details: { attempts, lastError: lastError || undefined, strategy: 'mutation_observer' },
  };
}

export async function waitForDomSettled(
  tabId: number,
  quietMs = 80,
  timeoutMs = 800,
): Promise<{ settled: boolean; elapsedMs: number; mutations: number }> {
  const startedAt = Date.now();
  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId },
      world: 'ISOLATED',
      func: async (quiet: number, timeout: number) => {
        return await new Promise<{ settled: boolean; mutations: number }>((resolve) => {
          let done = false;
          let mutations = 0;
          let quietTimer: ReturnType<typeof setTimeout> | undefined;
          let timeoutTimer: ReturnType<typeof setTimeout> | undefined;
          const finish = (settled: boolean) => {
            if (done) return;
            done = true;
            observer.disconnect();
            if (quietTimer) clearTimeout(quietTimer);
            if (timeoutTimer) clearTimeout(timeoutTimer);
            resolve({ settled, mutations });
          };
          const armQuiet = () => {
            if (quietTimer) clearTimeout(quietTimer);
            quietTimer = setTimeout(() => finish(true), Math.max(20, quiet));
          };
          const observer = new MutationObserver(() => {
            mutations += 1;
            armQuiet();
          });
          const root = document.documentElement || document.body;
          if (root) observer.observe(root, { subtree: true, childList: true, characterData: true, attributes: true });
          armQuiet();
          timeoutTimer = setTimeout(() => finish(false), Math.max(quiet, timeout));
        });
      },
      args: [Math.max(20, Math.min(quietMs, 500)), Math.max(50, Math.min(timeoutMs, 3000))],
    });
    const value = result?.result as { settled?: boolean; mutations?: number } | undefined;
    return { settled: Boolean(value?.settled), mutations: Number(value?.mutations || 0), elapsedMs: Date.now() - startedAt };
  } catch {
    return { settled: false, mutations: 0, elapsedMs: Date.now() - startedAt };
  }
}

async function waitForUrl(tabId: number, urlIncludes: string, timeoutMs: number) {
  if (!urlIncludes) return { ok: false, reason: 'urlIncludes is required for url_matches' };
  const initial = await chrome.tabs.get(tabId);
  if (String(initial.url || '').includes(urlIncludes)) {
    return { ok: true, details: { url: cleanUrl(initial.url), immediate: true } };
  }

  return await new Promise<Omit<SmartWaitResult, 'condition' | 'elapsedMs'>>((resolve) => {
    let done = false;
    const finish = (value: Omit<SmartWaitResult, 'condition' | 'elapsedMs'>) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(listener);
      chrome.tabs.onRemoved.removeListener(removedListener);
      resolve(value);
    };
    const listener = (updatedTabId: number, changeInfo: chrome.tabs.TabChangeInfo, tab: chrome.tabs.Tab) => {
      if (updatedTabId !== tabId) return;
      const url = String(changeInfo.url || tab.url || '');
      if (url.includes(urlIncludes)) finish({ ok: true, details: { url: cleanUrl(url) } });
    };
    const removedListener = (removedTabId: number) => {
      if (removedTabId === tabId) finish({ ok: false, reason: 'tab_closed' });
    };
    const timer = setTimeout(() => finish({ ok: false, timedOut: true, reason: 'timeout' }), timeoutMs);
    chrome.tabs.onUpdated.addListener(listener);
    chrome.tabs.onRemoved.addListener(removedListener);
    void chrome.tabs.get(tabId).then((tab) => {
      const url = String(tab.url || '');
      if (url.includes(urlIncludes)) finish({ ok: true, details: { url: cleanUrl(url), immediate: true } });
    }).catch(() => {});
  });
}

async function documentReadyState(tabId: number): Promise<string> {
  try {
    const result = await chrome.scripting.executeScript({
      target: { tabId },
      world: 'ISOLATED',
      func: () => document.readyState,
    });
    return String(result?.[0]?.result || '');
  } catch {
    return '';
  }
}

async function waitForNetworkCondition(
  tabId: number,
  options: SmartWaitOptions,
  timeoutMs: number,
): Promise<Omit<SmartWaitResult, 'condition' | 'elapsedMs'>> {
  const condition = options.condition;
  const owner = `smart-wait:${crypto.randomUUID()}`;
  const quietMs = quietValue(options.quietMs);
  const requestNeedle = String(options.requestUrlIncludes || options.urlIncludes || '');
  const inflight = new Set<string>();
  const requestUrls = new Map<string, string>();
  let unsubscribe: (() => void) | null = null;
  let timeoutTimer: ReturnType<typeof setTimeout> | null = null;
  let quietTimer: ReturnType<typeof setTimeout> | null = null;
  let settled = false;

  await cdpRouter.attach(tabId, owner);

  return await new Promise<Omit<SmartWaitResult, 'condition' | 'elapsedMs'>>(async (resolve) => {
    const cleanup = async () => {
      if (timeoutTimer) clearTimeout(timeoutTimer);
      if (quietTimer) clearTimeout(quietTimer);
      unsubscribe?.();
      await cdpRouter.detach(tabId, owner).catch(() => {});
    };
    const finish = (value: Omit<SmartWaitResult, 'condition' | 'elapsedMs'>) => {
      if (settled) return;
      settled = true;
      void cleanup().finally(() => resolve(value));
    };
    const armIdle = () => {
      if (condition !== 'network_idle' || settled || inflight.size > 0) return;
      if (quietTimer) clearTimeout(quietTimer);
      quietTimer = setTimeout(() => {
        finish({ ok: true, details: { quietMs, inflight: 0 } });
      }, quietMs);
    };
    const onEvent = (event: CdpEventEnvelope) => {
      const params = (event.params || {}) as Record<string, any>;
      if (event.method === 'Network.requestWillBeSent') {
        const request = (params.request || {}) as Record<string, any>;
        const requestId = String(params.requestId || '');
        const type = String(params.type || '');
        const url = String(request.url || '');
        if (requestId) requestUrls.set(requestId, url);
        if (condition === 'network_idle' && requestId && !['WebSocket', 'EventSource', 'Media'].includes(type)) {
          inflight.add(requestId);
          if (quietTimer) clearTimeout(quietTimer);
        }
        return;
      }

      if (event.method !== 'Network.loadingFinished' && event.method !== 'Network.loadingFailed') return;
      const requestId = String(params.requestId || '');
      const url = requestUrls.get(requestId) || '';
      inflight.delete(requestId);

      if (condition === 'request_finished' && requestNeedle && url.includes(requestNeedle)) {
        finish({
          ok: true,
          details: {
            requestId,
            url: cleanUrl(url),
            failed: event.method === 'Network.loadingFailed',
            errorText: event.method === 'Network.loadingFailed' ? params.errorText : undefined,
          },
        });
        return;
      }
      armIdle();
    };

    try {
      unsubscribe = cdpRouter.subscribeEvents(owner, onEvent, { tabId });
      await cdpRouter.sendCommand(tabId, 'Network.enable');
      timeoutTimer = setTimeout(() => finish({ ok: false, timedOut: true, reason: 'timeout' }), timeoutMs);
      if (condition === 'request_finished' && !requestNeedle) {
        finish({ ok: false, reason: 'requestUrlIncludes or urlIncludes is required for request_finished' });
        return;
      }
      armIdle();
    } catch (error) {
      finish({ ok: false, reason: error instanceof Error ? error.message : String(error) });
    }
  });
}

async function waitForPageLoaded(tabId: number, timeoutMs: number) {
  if ((await documentReadyState(tabId)) === 'complete') {
    return { ok: true, details: { readyState: 'complete', immediate: true } };
  }
  const owner = `smart-wait:${crypto.randomUUID()}`;
  await cdpRouter.attach(tabId, owner);
  return await new Promise<Omit<SmartWaitResult, 'condition' | 'elapsedMs'>>(async (resolve) => {
    let done = false;
    let unsubscribe: (() => void) | null = null;
    const finish = (value: Omit<SmartWaitResult, 'condition' | 'elapsedMs'>) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      unsubscribe?.();
      void cdpRouter.detach(tabId, owner).finally(() => resolve(value));
    };
    const timer = setTimeout(() => finish({ ok: false, timedOut: true, reason: 'timeout' }), timeoutMs);
    try {
      unsubscribe = cdpRouter.subscribeEvents(owner, (event) => {
        if (event.method === 'Page.loadEventFired') finish({ ok: true, details: { method: event.method } });
      }, { tabId });
      await cdpRouter.sendCommand(tabId, 'Page.enable');
      if ((await documentReadyState(tabId)) === 'complete') {
        finish({ ok: true, details: { readyState: 'complete', immediate: true } });
      }
    } catch (error) {
      finish({ ok: false, reason: error instanceof Error ? error.message : String(error) });
    }
  });
}

export async function waitForBrowserCondition(
  tabId: number,
  options: SmartWaitOptions,
): Promise<SmartWaitResult> {
  const startedAt = Date.now();
  const timeoutMs = timeoutValue(options.timeoutMs);
  let result: Omit<SmartWaitResult, 'condition' | 'elapsedMs'>;

  switch (options.condition) {
    case 'selector_exists':
    case 'selector_hidden':
      if (!options.selector) result = { ok: false, reason: 'selector is required' };
      else result = await waitForDomCondition(tabId, options, timeoutMs);
      break;
    case 'text_appears':
    case 'text_disappears':
      if (!options.text) result = { ok: false, reason: 'text is required' };
      else result = await waitForDomCondition(tabId, options, timeoutMs);
      break;
    case 'url_matches':
      result = await waitForUrl(tabId, String(options.urlIncludes || ''), timeoutMs);
      break;
    case 'network_idle':
    case 'request_finished':
      result = await waitForNetworkCondition(tabId, options, timeoutMs);
      break;
    case 'page_loaded':
      result = await waitForPageLoaded(tabId, timeoutMs);
      break;
    default:
      result = { ok: false, reason: `Unsupported wait condition: ${String(options.condition)}` };
  }

  return {
    ...result,
    condition: options.condition,
    elapsedMs: Date.now() - startedAt,
  };
}
