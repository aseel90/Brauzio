import { TOOL_NAMES } from 'brauzio-shared';
import { releaseAllMouseHolds } from '@/utils/mouse-hold-safety';

export type ControlPauseSource = 'human' | 'manual' | 'cloud' | 'safety';

export interface BrauzioControlState {
  paused: boolean;
  reason: string;
  source: ControlPauseSource | 'none';
  since: number | null;
  lastUpdated: number;
  lastHumanInputAt?: number;
  lastHumanInputType?: string;
  lastHumanTabId?: number;
}

export interface HumanInputSignal {
  eventType: string;
  at?: number;
}

export interface AgentExecutionGuard {
  actor: boolean;
  tabId?: number;
  finish(): Promise<void>;
}

export class BrauzioControlPausedError extends Error {
  constructor(public readonly state: BrauzioControlState) {
    super(`Brauzio actor control is paused (${state.reason || 'paused'}). Resume control from the Brauzio extension.`);
    this.name = 'BrauzioControlPausedError';
  }
}

type ControlStateSink = (state: BrauzioControlState) => void | Promise<void>;

const STORAGE_KEY = 'brauzioControlStateV1';

const OBSERVER_TOOLS = new Set<string>([
  TOOL_NAMES.BROWSER.GET_WINDOWS_AND_TABS,
  TOOL_NAMES.BROWSER.READ_PAGE,
  TOOL_NAMES.BROWSER.SCREENSHOT,
  TOOL_NAMES.BROWSER.CONSOLE,
  TOOL_NAMES.BROWSER.WEB_FETCHER,
  TOOL_NAMES.BROWSER.HISTORY,
  TOOL_NAMES.BROWSER.BOOKMARK_SEARCH,
  TOOL_NAMES.BROWSER.NETWORK_CAPTURE,
  TOOL_NAMES.BROWSER.NETWORK_CAPTURE_START,
  TOOL_NAMES.BROWSER.NETWORK_CAPTURE_STOP,
  TOOL_NAMES.BROWSER.NETWORK_DEBUGGER_START,
  TOOL_NAMES.BROWSER.NETWORK_DEBUGGER_STOP,
  TOOL_NAMES.BROWSER.PERFORMANCE_START_TRACE,
  TOOL_NAMES.BROWSER.PERFORMANCE_STOP_TRACE,
  TOOL_NAMES.BROWSER.PERFORMANCE_ANALYZE_INSIGHT,
  TOOL_NAMES.BROWSER.GIF_RECORDER,
  'chrome_watch_start',
  'chrome_watch_wait',
  'chrome_watch_read',
  'chrome_watch_stop',
]);

const COMPUTER_OBSERVER_ACTIONS = new Set(['wait', 'wait_for', 'screenshot']);
const CDP_OBSERVER_ACTIONS = new Set(['list_allowed', 'sessions']);

const DEFAULT_STATE: BrauzioControlState = {
  paused: false,
  reason: '',
  source: 'none',
  since: null,
  lastUpdated: Date.now(),
};

let state: BrauzioControlState = { ...DEFAULT_STATE };
let stateLoaded = false;
let stateLoadPromise: Promise<void> | null = null;
let sink: ControlStateSink | null = null;

function cleanState(value: unknown): BrauzioControlState {
  const raw = (value || {}) as Partial<BrauzioControlState>;
  const rawReason = String(raw.reason || '').slice(0, 128);
  const rawSource = String(raw.source || 'none');

  // v2.9.3 removes automatic human takeover entirely. Clear legacy automatic
  // pauses so an old human_input_detected state cannot survive an upgrade.
  const legacyAutomaticPause =
    raw.paused === true &&
    (rawSource === 'human' || rawReason === 'human_input_detected' || rawReason === 'recent_human_input');

  return {
    paused: legacyAutomaticPause ? false : raw.paused === true,
    reason: legacyAutomaticPause ? 'automatic_takeover_disabled' : rawReason,
    source: legacyAutomaticPause
      ? 'none'
      : ['human', 'manual', 'cloud', 'safety'].includes(rawSource)
        ? (rawSource as ControlPauseSource)
        : 'none',
    since: legacyAutomaticPause ? null : raw.since ? Number(raw.since) : null,
    lastUpdated: Number(raw.lastUpdated || Date.now()),
    lastHumanInputAt: raw.lastHumanInputAt ? Number(raw.lastHumanInputAt) : undefined,
    lastHumanInputType: raw.lastHumanInputType
      ? String(raw.lastHumanInputType).slice(0, 64)
      : undefined,
    lastHumanTabId:
      typeof raw.lastHumanTabId === 'number' && Number.isFinite(raw.lastHumanTabId)
        ? raw.lastHumanTabId
        : undefined,
  };
}

async function ensureStateLoaded(): Promise<void> {
  if (stateLoaded) return;
  if (stateLoadPromise) return await stateLoadPromise;
  stateLoadPromise = (async () => {
    try {
      const stored = await chrome.storage.local.get(STORAGE_KEY);
      if (stored[STORAGE_KEY]) state = cleanState(stored[STORAGE_KEY]);
    } finally {
      stateLoaded = true;
      stateLoadPromise = null;
    }
  })();
  await stateLoadPromise;
}

async function persistAndBroadcast(): Promise<void> {
  state.lastUpdated = Date.now();
  await chrome.storage.local.set({ [STORAGE_KEY]: state });
  try {
    await chrome.action.setBadgeText({ text: state.paused ? 'STOP' : '' });
    if (state.paused) await chrome.action.setBadgeBackgroundColor({ color: '#c84a58' });
  } catch {
    // Badge is a visual hint only; never weaken the underlying safety state.
  }
  chrome.runtime
    .sendMessage({ type: 'brauzio_control_state_changed', state: { ...state } })
    .catch(() => {});
  try {
    await sink?.({ ...state });
  } catch {
    // Cloud sync is best effort. Local safety state remains authoritative.
  }
}

async function resolveLikelyTargetTabId(args: Record<string, unknown>): Promise<number | undefined> {
  const explicit = Number(args.tabId);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  try {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    return typeof tab?.id === 'number' ? tab.id : undefined;
  } catch {
    return undefined;
  }
}

export function configureControlStateSink(nextSink: ControlStateSink | null): void {
  sink = nextSink;
}

export function isActorTool(name: string, args: Record<string, unknown> = {}): boolean {
  if (OBSERVER_TOOLS.has(name)) return false;
  if (name === TOOL_NAMES.BROWSER.COMPUTER) {
    return !COMPUTER_OBSERVER_ACTIONS.has(String(args.action || ''));
  }
  if (name === TOOL_NAMES.BROWSER.CDP) {
    return !CDP_OBSERVER_ACTIONS.has(String(args.action || 'command'));
  }
  return true;
}

export async function getControlState(): Promise<BrauzioControlState> {
  await ensureStateLoaded();
  return { ...state };
}

export async function pauseAgentControl(
  reason: string,
  source: ControlPauseSource = 'manual',
  human?: { eventType?: string; tabId?: number; at?: number },
): Promise<BrauzioControlState> {
  await ensureStateLoaded();
  const now = Date.now();
  state = {
    ...state,
    paused: true,
    reason: String(reason || 'paused').slice(0, 128),
    source,
    since: state.paused && state.since ? state.since : now,
    lastUpdated: now,
    lastHumanInputAt: human?.at || state.lastHumanInputAt,
    lastHumanInputType: human?.eventType
      ? String(human.eventType).slice(0, 64)
      : state.lastHumanInputType,
    lastHumanTabId:
      typeof human?.tabId === 'number' ? human.tabId : state.lastHumanTabId,
  };
  await releaseAllMouseHolds(`control_pause:${source}`).catch(() => {});
  await persistAndBroadcast();
  return { ...state };
}

export async function resumeAgentControl(source: ControlPauseSource = 'manual'): Promise<BrauzioControlState> {
  await ensureStateLoaded();
  state = {
    ...state,
    paused: false,
    reason: source === 'cloud' ? 'cloud_resume' : 'user_resume',
    source,
    since: null,
    lastUpdated: Date.now(),
  };
  await persistAndBroadcast();
  return { ...state };
}

export async function enforceRemotePause(remote: Partial<BrauzioControlState> | undefined): Promise<void> {
  if (!remote?.paused) return;
  // Only an explicit pause created from the extension UI is authoritative.
  // Legacy automatic/human/cloud-only pauses are ignored.
  if (String(remote.source || '') !== 'manual') return;
  await pauseAgentControl(String(remote.reason || 'manual_pause'), 'manual');
}

export async function handleHumanInput(
  _tabId: number | undefined,
  _signal: HumanInputSignal,
): Promise<{ takeover: boolean; ignoredAsAgent: boolean; state: BrauzioControlState }> {
  await ensureStateLoaded();
  // Human input never pauses Brauzio in v2.9.3+. Pause/Resume is manual-only.
  return { takeover: false, ignoredAsAgent: true, state: { ...state } };
}

export async function beginAgentToolExecution(
  name: string,
  args: Record<string, unknown> = {},
): Promise<AgentExecutionGuard> {
  if (!isActorTool(name, args)) {
    return { actor: false, async finish() {} };
  }

  await ensureStateLoaded();
  const tabId = await resolveLikelyTargetTabId(args);

  if (state.paused) throw new BrauzioControlPausedError({ ...state });

  return {
    actor: true,
    tabId,
    async finish() {},
  };
}
