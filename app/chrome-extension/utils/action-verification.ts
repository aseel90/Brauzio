import { cdpRouter, type CdpEventEnvelope } from '@/utils/cdp-router';
import {
  waitForBrowserCondition,
  type SmartWaitCondition,
  type SmartWaitResult,
} from '@/utils/smart-wait';

export type VerificationSelectorState = 'exists' | 'hidden';
export type VerificationTextState = 'appears' | 'disappears';

export interface ActionVerificationSpec {
  urlIncludes?: string;
  selector?: string;
  selectorState?: VerificationSelectorState;
  text?: string;
  textState?: VerificationTextState;
  requestUrlIncludes?: string;
  consoleIncludes?: string;
  pageLoaded?: boolean;
  networkIdle?: boolean;
  timeoutMs?: number;
  quietMs?: number;
}

export interface ActionSnapshot {
  tabId: number;
  url: string;
  title: string;
  status?: chrome.tabs.Tab['status'];
}

export interface ActionVerificationCheck {
  kind:
    | 'url'
    | 'selector'
    | 'text'
    | 'request'
    | 'console'
    | 'page_loaded'
    | 'network_idle';
  ok: boolean;
  elapsedMs: number;
  reason?: string;
  details?: Record<string, unknown>;
}

export interface ActionVerificationResult {
  verified: boolean;
  before: ActionSnapshot;
  after: ActionSnapshot;
  checks: ActionVerificationCheck[];
  elapsedMs: number;
}

export interface PreparedActionVerification {
  before: ActionSnapshot;
  verify(): Promise<ActionVerificationResult>;
  cancel(): Promise<void>;
}

const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_TIMEOUT_MS = 120_000;

function clampTimeout(value?: number): number {
  const numeric = Number(value || DEFAULT_TIMEOUT_MS);
  return Math.max(
    100,
    Math.min(Number.isFinite(numeric) ? numeric : DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS),
  );
}

function cleanUrl(value: unknown): string {
  const raw = String(value || '');
  if (!raw) return '';
  try {
    const parsed = new URL(raw);
    parsed.username = '';
    parsed.password = '';
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return raw.split('?')[0].split('#')[0].slice(0, 4096);
  }
}

async function snapshotTab(tabId: number): Promise<ActionSnapshot> {
  try {
    const tab = await chrome.tabs.get(tabId);
    return {
      tabId,
      url: cleanUrl(tab.url),
      title: String(tab.title || '').slice(0, 1000),
      status: tab.status,
    };
  } catch {
    return { tabId, url: '', title: '' };
  }
}

function consoleText(event: CdpEventEnvelope): string {
  const params = (event.params || {}) as Record<string, any>;
  if (event.method === 'Runtime.consoleAPICalled') {
    const args = Array.isArray(params.args) ? params.args : [];
    return args
      .map((arg: Record<string, any>) => {
        if (arg?.value !== undefined) return String(arg.value);
        if (arg?.description !== undefined) return String(arg.description);
        return '';
      })
      .filter(Boolean)
      .join(' ');
  }
  if (event.method === 'Runtime.exceptionThrown') {
    const details = (params.exceptionDetails || {}) as Record<string, any>;
    const exception = (details.exception || {}) as Record<string, any>;
    return String(details.text || exception.description || exception.value || '');
  }
  if (event.method === 'Log.entryAdded') {
    return String(((params.entry || {}) as Record<string, any>).text || '');
  }
  return '';
}

function smartCheck(
  kind: ActionVerificationCheck['kind'],
  result: SmartWaitResult,
): ActionVerificationCheck {
  return {
    kind,
    ok: result.ok,
    elapsedMs: result.elapsedMs,
    reason: result.reason,
    details: result.details,
  };
}

export function hasActionVerification(spec?: ActionVerificationSpec): boolean {
  if (!spec) return false;
  return Boolean(
    spec.urlIncludes ||
      spec.selector ||
      spec.text ||
      spec.requestUrlIncludes ||
      spec.consoleIncludes ||
      spec.pageLoaded ||
      spec.networkIdle,
  );
}

export async function prepareActionVerification(
  tabId: number,
  spec: ActionVerificationSpec,
): Promise<PreparedActionVerification> {
  const before = await snapshotTab(tabId);
  const owner = `action-verify:${crypto.randomUUID()}`;
  const timeoutMs = clampTimeout(spec.timeoutMs);
  const needsNetworkEvents = Boolean(spec.requestUrlIncludes || spec.networkIdle);
  const needsConsoleEvents = Boolean(spec.consoleIncludes);
  const needsCdp = needsNetworkEvents || needsConsoleEvents;

  let attached = false;
  let unsubscribe: (() => void) | null = null;
  let cleanedUp = false;
  let requestEvidence: Record<string, unknown> | null = null;
  let consoleEvidence: Record<string, unknown> | null = null;
  const requestWaiters: Array<(value: Record<string, unknown>) => void> = [];
  const consoleWaiters: Array<(value: Record<string, unknown>) => void> = [];
  const networkInflight = new Set<string>();
  let lastNetworkActivityAt = Date.now();
  const networkStateWaiters = new Set<() => void>();

  const notifyNetworkState = () => {
    lastNetworkActivityAt = Date.now();
    for (const waiter of [...networkStateWaiters]) waiter();
  };

  const notifyRequest = (evidence: Record<string, unknown>) => {
    if (requestEvidence) return;
    requestEvidence = evidence;
    while (requestWaiters.length) requestWaiters.shift()?.(evidence);
  };

  const notifyConsole = (evidence: Record<string, unknown>) => {
    if (consoleEvidence) return;
    consoleEvidence = evidence;
    while (consoleWaiters.length) consoleWaiters.shift()?.(evidence);
  };

  const onEvent = (event: CdpEventEnvelope) => {
    const params = (event.params || {}) as Record<string, any>;
    if (needsNetworkEvents && event.method === 'Network.requestWillBeSent') {
      const request = (params.request || {}) as Record<string, any>;
      const url = String(request.url || '');
      const requestId = String(params.requestId || '');
      const resourceType = String(params.type || '');
      if (requestId) {
        if (!['WebSocket', 'EventSource', 'Media'].includes(resourceType)) networkInflight.add(requestId);
      }
      notifyNetworkState();
      if (spec.requestUrlIncludes && url.includes(String(spec.requestUrlIncludes))) {
        notifyRequest({
          method: String(request.method || ''),
          url: cleanUrl(url),
          resourceType,
        });
      }
    }

    if (needsNetworkEvents && ['Network.loadingFinished', 'Network.loadingFailed'].includes(event.method)) {
      const requestId = String(params.requestId || '');
      if (requestId) {
        networkInflight.delete(requestId);
      }
      notifyNetworkState();
    }

    if (
      needsConsoleEvents &&
      ['Runtime.consoleAPICalled', 'Runtime.exceptionThrown', 'Log.entryAdded'].includes(event.method)
    ) {
      const text = consoleText(event);
      if (text.includes(String(spec.consoleIncludes || ''))) {
        notifyConsole({
          method: event.method,
          matchedText: String(spec.consoleIncludes || ''),
        });
      }
    }
  };

  const cleanup = async () => {
    if (cleanedUp) return;
    cleanedUp = true;
    unsubscribe?.();
    unsubscribe = null;
    if (attached) {
      attached = false;
      await cdpRouter.detach(tabId, owner).catch(() => {});
    }
  };

  if (needsCdp) {
    try {
      await cdpRouter.attach(tabId, owner);
      attached = true;
      unsubscribe = cdpRouter.subscribeEvents(owner, onEvent, { tabId });
      if (needsNetworkEvents) await cdpRouter.sendCommand(tabId, 'Network.enable');
      if (needsConsoleEvents) {
        await cdpRouter.sendCommand(tabId, 'Runtime.enable');
        await cdpRouter.sendCommand(tabId, 'Log.enable').catch(() => undefined);
      }
    } catch (error) {
      await cleanup();
      throw new Error(
        `Unable to arm action verification: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  const waitForNetworkIdle = async (): Promise<ActionVerificationCheck> => {
    const kind: ActionVerificationCheck['kind'] = 'network_idle';
    const startedAt = Date.now();
    const quietMs = Math.max(100, Math.min(Number(spec.quietMs || 500), 5000));

    return await new Promise<ActionVerificationCheck>((resolve) => {
      let done = false;
      let quietTimer: ReturnType<typeof setTimeout> | null = null;
      let timeoutTimer: ReturnType<typeof setTimeout> | null = null;
      const finish = (check: ActionVerificationCheck) => {
        if (done) return;
        done = true;
        if (quietTimer) clearTimeout(quietTimer);
        if (timeoutTimer) clearTimeout(timeoutTimer);
        networkStateWaiters.delete(onStateChanged);
        resolve(check);
      };
      const evaluate = () => {
        if (done || networkInflight.size > 0) {
          if (quietTimer) {
            clearTimeout(quietTimer);
            quietTimer = null;
          }
          return;
        }
        const quietFor = Date.now() - lastNetworkActivityAt;
        const remaining = Math.max(0, quietMs - quietFor);
        if (remaining === 0) {
          finish({
            kind,
            ok: true,
            elapsedMs: Date.now() - startedAt,
            details: { quietMs, inflight: 0, prearmed: true },
          });
          return;
        }
        if (quietTimer) clearTimeout(quietTimer);
        quietTimer = setTimeout(evaluate, remaining);
      };
      const onStateChanged = () => evaluate();
      networkStateWaiters.add(onStateChanged);
      timeoutTimer = setTimeout(() => {
        finish({
          kind,
          ok: false,
          elapsedMs: Date.now() - startedAt,
          reason: 'timeout',
          details: { quietMs, inflight: networkInflight.size, prearmed: true },
        });
      }, timeoutMs);
      evaluate();
    });
  };

  const waitForEvidence = async (
    kind: 'request' | 'console',
    existing: () => Record<string, unknown> | null,
    waiters: Array<(value: Record<string, unknown>) => void>,
  ): Promise<ActionVerificationCheck> => {
    const startedAt = Date.now();
    const immediate = existing();
    if (immediate) {
      return { kind, ok: true, elapsedMs: 0, details: { ...immediate, immediate: true } };
    }

    return await new Promise<ActionVerificationCheck>((resolve) => {
      let done = false;
      let waiter: ((value: Record<string, unknown>) => void) | null = null;
      let timer: ReturnType<typeof setTimeout> | null = null;
      const finish = (check: ActionVerificationCheck) => {
        if (done) return;
        done = true;
        if (timer) clearTimeout(timer);
        if (waiter) {
          const index = waiters.indexOf(waiter);
          if (index >= 0) waiters.splice(index, 1);
        }
        resolve(check);
      };
      waiter = (evidence) =>
        finish({ kind, ok: true, elapsedMs: Date.now() - startedAt, details: evidence });
      waiters.push(waiter);
      timer = setTimeout(
        () => finish({ kind, ok: false, elapsedMs: Date.now() - startedAt, reason: 'timeout' }),
        timeoutMs,
      );
      const raced = existing();
      if (raced) finish({ kind, ok: true, elapsedMs: Date.now() - startedAt, details: raced });
    });
  };

  return {
    before,
    async verify() {
      const startedAt = Date.now();
      const checks: Array<Promise<ActionVerificationCheck>> = [];

      if (spec.urlIncludes) {
        checks.push(
          waitForBrowserCondition(tabId, {
            condition: 'url_matches',
            urlIncludes: spec.urlIncludes,
            timeoutMs,
          }).then((result) => smartCheck('url', result)),
        );
      }

      if (spec.selector) {
        const condition: SmartWaitCondition =
          spec.selectorState === 'hidden' ? 'selector_hidden' : 'selector_exists';
        checks.push(
          waitForBrowserCondition(tabId, {
            condition,
            selector: spec.selector,
            timeoutMs,
          }).then((result) => smartCheck('selector', result)),
        );
      }

      if (spec.text) {
        const condition: SmartWaitCondition =
          spec.textState === 'disappears' ? 'text_disappears' : 'text_appears';
        checks.push(
          waitForBrowserCondition(tabId, {
            condition,
            text: spec.text,
            timeoutMs,
          }).then((result) => smartCheck('text', result)),
        );
      }

      if (spec.pageLoaded) {
        checks.push(
          waitForBrowserCondition(tabId, {
            condition: 'page_loaded',
            timeoutMs,
          }).then((result) => smartCheck('page_loaded', result)),
        );
      }

      if (spec.networkIdle) {
        checks.push(waitForNetworkIdle());
      }

      if (spec.requestUrlIncludes) {
        checks.push(waitForEvidence('request', () => requestEvidence, requestWaiters));
      }
      if (spec.consoleIncludes) {
        checks.push(waitForEvidence('console', () => consoleEvidence, consoleWaiters));
      }

      try {
        const resolved = await Promise.all(checks);
        const after = await snapshotTab(tabId);
        return {
          verified: resolved.length > 0 && resolved.every((check) => check.ok),
          before,
          after,
          checks: resolved,
          elapsedMs: Date.now() - startedAt,
        };
      } finally {
        await cleanup();
      }
    },
    cancel: cleanup,
  };
}
