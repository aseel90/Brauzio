import { handleCallTool } from './tools';
import {
  configureWatchPersistenceSink,
  restorePersistentBrowserWatches,
  stopAllBrowserWatches,
  stopPersistentBrowserWatch,
  type PersistentWatchDescriptor,
  type WatchEvent,
} from './tools/browser/watch';
import { stopAllLiveViews } from './tools/browser/live-view';
import { releaseAllMouseHolds } from '@/utils/mouse-hold-safety';
import { relayMetrics } from './relay-metrics';
import {
  beginAgentToolExecution,
  configureControlStateSink,
  enforceRemotePause,
  getControlState,
  pauseAgentControl,
  resumeAgentControl,
  type BrauzioControlState,
  type AgentExecutionGuard,
} from '@/utils/control-safety';

const LOG_PREFIX = '[BrauzioRelay]';
const HEARTBEAT_MS = 20_000;
const HEARTBEAT_TIMEOUT_MS = 35_000;
const RECONNECT_MAX_MS = 30_000;
const RECONNECT_JITTER_RATIO = 0.2;

function relayLog(event: string, details: Record<string, unknown> = {}) {
  console.log(LOG_PREFIX, new Date().toISOString(), event, details);
}

const STORAGE_KEYS = {
  RELAY_URL: 'brauzioRelayUrl',
  DEVICE_ID: 'brauzioDeviceId',
  DEVICE_TOKEN: 'brauzioDeviceToken',
  AUTO_CONNECT: 'brauzioRelayAutoConnect',
} as const;

export interface BrauzioRelayConfig {
  relayUrl: string;
  deviceId: string;
  deviceToken: string;
  autoConnect: boolean;
}

export interface BrauzioRelayStatus {
  state: 'disabled' | 'connecting' | 'connected' | 'disconnected' | 'error';
  authenticated: boolean;
  lastUpdated: number;
  lastError?: string;
}

export type BrauzioDiagnosticState = 'ok' | 'warn' | 'error';

export interface BrauzioDiagnosticCheck {
  key: string;
  label: string;
  state: BrauzioDiagnosticState;
  detail: string;
  latencyMs?: number;
}

export interface BrauzioDiagnosticReport {
  generatedAt: number;
  overall: BrauzioDiagnosticState;
  extensionVersion: string;
  serverVersion?: string;
  schemaVersion?: string;
  toolCount?: number;
  checks: BrauzioDiagnosticCheck[];
}

type RelayInboundMessage =
  | { type: 'hello_ack'; authenticated?: boolean; controlState?: Partial<BrauzioControlState> }
  | { type: 'pairing_code'; code: string; expiresAt: number; deviceId?: string }
  | { type: 'tool_call'; requestId: string; name: string; args?: Record<string, unknown> }
  | { type: 'watch_restore'; watches?: PersistentWatchDescriptor[] }
  | { type: 'watch_stop'; watchId: string; reason?: string }
  | { type: 'pong' }
  | { type: 'error'; message?: string };

let socket: WebSocket | null = null;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectAttempt = 0;
let lastPongAt = 0;
let manualDisconnect = false;
let currentPairing: { code: string; expiresAt: number; deviceId: string } | null = null;
let diagnosticPingWaiter: {
  startedAt: number;
  resolve: (latencyMs: number) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
} | null = null;

let currentStatus: BrauzioRelayStatus = {
  state: 'disconnected',
  authenticated: false,
  lastUpdated: Date.now(),
};

function updateStatus(patch: Partial<BrauzioRelayStatus>) {
  currentStatus = {
    ...currentStatus,
    ...patch,
    lastUpdated: Date.now(),
  };
  chrome.runtime
    .sendMessage({ type: 'brauzio_relay_status_changed', status: currentStatus })
    .catch(() => {});
}

function normalizeRelayUrl(value: string): string {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '';
  const withScheme = /^https?:\/\//i.test(trimmed) || /^wss?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  const url = new URL(withScheme);
  url.protocol = url.protocol === 'http:' || url.protocol === 'ws:' ? 'ws:' : 'wss:';
  if (!url.pathname || url.pathname === '/') {
    url.pathname = '/ws';
  } else if (url.pathname.endsWith('/mcp')) {
    url.pathname = url.pathname.slice(0, -4) + '/ws';
  }
  return url.toString();
}

async function loadConfig(): Promise<BrauzioRelayConfig> {
  const stored = await chrome.storage.local.get(Object.values(STORAGE_KEYS));
  return {
    relayUrl: String(stored[STORAGE_KEYS.RELAY_URL] || ''),
    deviceId: String(stored[STORAGE_KEYS.DEVICE_ID] || 'default'),
    deviceToken: String(stored[STORAGE_KEYS.DEVICE_TOKEN] || ''),
    autoConnect: stored[STORAGE_KEYS.AUTO_CONNECT] !== false,
  };
}

async function saveConfig(config: Partial<BrauzioRelayConfig>): Promise<BrauzioRelayConfig> {
  const current = await loadConfig();
  const next = { ...current, ...config };
  await chrome.storage.local.set({
    [STORAGE_KEYS.RELAY_URL]: next.relayUrl,
    [STORAGE_KEYS.DEVICE_ID]: next.deviceId,
    [STORAGE_KEYS.DEVICE_TOKEN]: next.deviceToken,
    [STORAGE_KEYS.AUTO_CONNECT]: next.autoConnect,
  });
  return next;
}

function clearHeartbeat() {
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  heartbeatTimer = null;
  lastPongAt = 0;
}

function clearReconnect() {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = null;
}

function releaseMouseSafety(reason: string) {
  void releaseAllMouseHolds(reason)
    .then((count) => {
      if (count > 0) relayLog('MOUSE_HOLDS_RELEASED', { reason, count });
    })
    .catch((error) => {
      relayLog('MOUSE_HOLD_RELEASE_FAILED', { reason, error: error instanceof Error ? error.message : String(error) });
    });
}

function stopLiveViewSafety(reason: string) {
  void stopAllLiveViews(reason)
    .then((count) => {
      if (count > 0) relayLog('LIVE_VIEW_STOPPED', { reason, count });
    })
    .catch((error) => {
      relayLog('LIVE_VIEW_STOP_FAILED', { reason, error: error instanceof Error ? error.message : String(error) });
    });
}

function stopWatchSafety(reason: string, notifyPersistence = false) {
  void stopAllBrowserWatches(reason, undefined, notifyPersistence)
    .then((count) => {
      if (count > 0) relayLog('WATCHES_STOPPED', { reason, count });
    })
    .catch((error) => {
      relayLog('WATCH_STOP_FAILED', {
        reason,
        error: error instanceof Error ? error.message : String(error),
      });
    });
}

function closeSocket() {
  if (diagnosticPingWaiter) {
    const waiter = diagnosticPingWaiter;
    diagnosticPingWaiter = null;
    clearTimeout(waiter.timer);
    waiter.reject(new Error('Relay socket closed during latency check'));
  }
  releaseMouseSafety('relay_socket_close_requested');
  stopWatchSafety('relay_socket_close_requested');
  stopLiveViewSafety('relay_socket_close_requested');
  clearHeartbeat();
  if (socket) {
    try {
      socket.close(1000, 'Brauzio relay reconnect');
    } catch {}
  }
  socket = null;
}

function scheduleReconnect() {
  if (manualDisconnect || reconnectTimer) return;
  const attempt = reconnectAttempt++;
  const baseDelay = Math.min(1_000 * Math.pow(2, attempt), RECONNECT_MAX_MS);
  const jitter = baseDelay * RECONNECT_JITTER_RATIO * (Math.random() * 2 - 1);
  const delay = Math.max(250, Math.round(baseDelay + jitter));
  relayMetrics.reconnectScheduled(attempt + 1);
  relayLog('RECONNECT_SCHEDULED', { attempt: attempt + 1, baseDelayMs: baseDelay, delayMs: delay });
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    void connectRelay().catch((error) => relayMetrics.error(error));
  }, delay);
}

function healthUrlFromRelay(relayUrl: string): string {
  const raw = /^https?:\/\//i.test(relayUrl) || /^wss?:\/\//i.test(relayUrl)
    ? relayUrl
    : `https://${relayUrl}`;
  const url = new URL(raw);
  url.protocol = url.protocol === 'http:' || url.protocol === 'ws:' ? 'http:' : 'https:';
  url.pathname = '/health';
  url.search = '';
  url.hash = '';
  return url.toString();
}

async function measureRelayPing(timeoutMs = 4_000): Promise<number> {
  if (!socket || socket.readyState !== WebSocket.OPEN || !currentStatus.authenticated) {
    throw new Error('WebSocket is not authenticated');
  }
  if (diagnosticPingWaiter) throw new Error('A relay latency check is already running');

  return await new Promise<number>((resolve, reject) => {
    const startedAt = performance.now();
    const timer = setTimeout(() => {
      if (diagnosticPingWaiter?.timer === timer) diagnosticPingWaiter = null;
      reject(new Error('Relay ping timed out'));
    }, timeoutMs);
    diagnosticPingWaiter = { startedAt, resolve, reject, timer };
    try {
      socket?.send('ping');
    } catch (error) {
      clearTimeout(timer);
      diagnosticPingWaiter = null;
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  });
}

async function runDiagnostics(): Promise<BrauzioDiagnosticReport> {
  const checks: BrauzioDiagnosticCheck[] = [];
  const extensionVersion = chrome.runtime.getManifest().version;
  const config = await loadConfig();
  const controlState = await getControlState();
  let serverVersion: string | undefined;
  let schemaVersion: string | undefined;
  let toolCount: number | undefined;

  if (!config.relayUrl) {
    checks.push({ key: 'cloudflare', label: 'Cloudflare Worker', state: 'error', detail: 'رابط الخدمة غير مضبوط' });
  } else {
    const startedAt = performance.now();
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 6_000);
      const response = await fetch(healthUrlFromRelay(config.relayUrl), { cache: 'no-store', signal: controller.signal });
      clearTimeout(timer);
      const latencyMs = Math.max(0, Math.round(performance.now() - startedAt));
      const body = (await response.json()) as { ok?: boolean; version?: string; schemaVersion?: string; toolCount?: number };
      serverVersion = body.version ? String(body.version) : undefined;
      schemaVersion = body.schemaVersion ? String(body.schemaVersion) : undefined;
      toolCount = typeof body.toolCount === 'number' ? body.toolCount : undefined;
      checks.push({
        key: 'cloudflare',
        label: 'Cloudflare Worker',
        state: response.ok && body.ok !== false ? 'ok' : 'error',
        detail: response.ok ? `Worker ${serverVersion || 'unknown'} / schema ${schemaVersion || 'unknown'} / tools ${toolCount ?? 'unknown'}` : `HTTP ${response.status}`,
        latencyMs,
      });
    } catch (error) {
      checks.push({ key: 'cloudflare', label: 'Cloudflare Worker', state: 'error', detail: error instanceof Error ? error.message : String(error) });
    }
  }

  if (socket && socket.readyState === WebSocket.OPEN && currentStatus.authenticated) {
    try {
      const latencyMs = await measureRelayPing();
      checks.push({ key: 'websocket', label: 'WebSocket relay', state: 'ok', detail: 'متصل ومصادق عليه', latencyMs });
    } catch (error) {
      checks.push({ key: 'websocket', label: 'WebSocket relay', state: 'warn', detail: error instanceof Error ? error.message : String(error) });
    }
  } else {
    checks.push({ key: 'websocket', label: 'WebSocket relay', state: 'error', detail: `الحالة: ${currentStatus.state}${currentStatus.lastError ? ` — ${currentStatus.lastError}` : ''}` });
  }

  checks.push({
    key: 'oauth',
    label: 'OAuth / Pairing',
    state: currentStatus.authenticated ? 'ok' : config.deviceToken ? 'warn' : 'error',
    detail: currentStatus.authenticated ? `OAuth relay authenticated for ${config.deviceId || 'default'}` : config.deviceToken ? 'الرمز محفوظ لكن الاتصال غير مصادق' : currentPairing?.code ? `رمز الاقتران الحالي: ${currentPairing.code}` : 'لا يوجد رمز جهاز محفوظ',
  });

  checks.push({
    key: 'control',
    label: 'Agent control',
    state: controlState.paused ? 'warn' : 'ok',
    detail: controlState.paused ? `متوقف مؤقتًا${controlState.pauseReason ? ` — ${controlState.pauseReason}` : ''}` : 'التحكم مفعّل',
  });

  try {
    const permissions = await chrome.permissions.getAll();
    const required = ['tabs', 'scripting', 'debugger'];
    const missing = required.filter((permission) => !permissions.permissions?.includes(permission));
    checks.push({ key: 'permissions', label: 'Chrome permissions', state: missing.length ? 'error' : 'ok', detail: missing.length ? `صلاحيات ناقصة: ${missing.join(', ')}` : 'tabs / scripting / debugger متاحة' });
  } catch (error) {
    checks.push({ key: 'permissions', label: 'Chrome permissions', state: 'warn', detail: error instanceof Error ? error.message : String(error) });
  }

  try {
    const [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (activeTab?.id) {
      const target = { tabId: activeTab.id };
      await chrome.debugger.attach(target, '1.3');
      try {
        await chrome.debugger.sendCommand(target, 'Runtime.evaluate', { expression: '1+1', returnByValue: true });
        checks.push({ key: 'cdp', label: 'Chrome DevTools Protocol', state: 'ok', detail: `CDP يعمل على tab ${activeTab.id}` });
      } finally {
        await chrome.debugger.detach(target).catch(() => {});
      }
    } else {
      checks.push({ key: 'cdp', label: 'Chrome DevTools Protocol', state: 'warn', detail: 'لا يوجد تبويب ويب نشط للاختبار' });
    }
  } catch (error) {
    checks.push({ key: 'cdp', label: 'Chrome DevTools Protocol', state: 'warn', detail: error instanceof Error ? error.message : String(error) });
  }

  const rank: Record<BrauzioDiagnosticState, number> = { ok: 0, warn: 1, error: 2 };
  const overall = checks.reduce<BrauzioDiagnosticState>((current, check) => rank[check.state] > rank[current] ? check.state : current, 'ok');
  return { generatedAt: Date.now(), overall, extensionVersion, serverVersion, schemaVersion, toolCount, checks };
}

function sendControlStateMessage(state: BrauzioControlState) {
  if (!socket || socket.readyState !== WebSocket.OPEN || !currentStatus.authenticated) return;
  try {
    socket.send(JSON.stringify({ type: 'control_state', state }));
  } catch (error) {
    relayLog('CONTROL_STATE_SEND_FAILED', { error: error instanceof Error ? error.message : String(error) });
  }
}

function sendWatchPersistenceMessage(message: Record<string, unknown>) {
  if (!socket || socket.readyState !== WebSocket.OPEN || !currentStatus.authenticated) return;
  try {
    socket.send(JSON.stringify(message));
  } catch (error) {
    relayLog('WATCH_PERSISTENCE_SEND_FAILED', { error: error instanceof Error ? error.message : String(error) });
  }
}

async function executeToolCall(message: Extract<RelayInboundMessage, { type: 'tool_call' }>) {
  const activeSocket = socket;
  if (!activeSocket || activeSocket.readyState !== WebSocket.OPEN) {
    relayLog('TOOL_DROPPED_SOCKET_NOT_OPEN', { requestId: message.requestId, name: message.name, readyState: activeSocket?.readyState ?? null });
    return;
  }

  const startedAt = Date.now();
  const args = message.args || {};
  let guard: AgentExecutionGuard | undefined;
  relayMetrics.toolReceived(message.requestId, message.name);
  relayLog('TOOL_RECEIVED', { requestId: message.requestId, name: message.name });

  try {
    guard = await beginAgentToolExecution(message.name, args);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    relayLog('TOOL_BLOCKED_CONTROL_PAUSED', { requestId: message.requestId, name: message.name, error: errorMessage });
    try {
      activeSocket.send(JSON.stringify({ type: 'tool_result', requestId: message.requestId, error: errorMessage }));
    } catch {}
    return;
  }

  try {
    const result = await handleCallTool({ name: message.name, args });
    activeSocket.send(
      JSON.stringify({
        type: 'tool_result',
        requestId: message.requestId,
        result,
      }),
    );
    relayLog('TOOL_FINISHED', { requestId: message.requestId, name: message.name, actor: guard.actor, durationMs: Date.now() - startedAt });
  } catch (error) {
    relayLog('TOOL_FAILED', { requestId: message.requestId, name: message.name, durationMs: Date.now() - startedAt, error: error instanceof Error ? error.message : String(error) });
    try {
      activeSocket.send(
        JSON.stringify({
          type: 'tool_result',
          requestId: message.requestId,
          error: error instanceof Error ? error.message : String(error),
        }),
      );
    } catch {}
  } finally {
    await guard.finish().catch(() => {});
  }
}

async function onRelayMessage(event: MessageEvent) {
  if (typeof event.data !== 'string') return;
  if (event.data === 'pong') {
    lastPongAt = Date.now();
    relayMetrics.pong();
    if (diagnosticPingWaiter) {
      const waiter = diagnosticPingWaiter;
      diagnosticPingWaiter = null;
      clearTimeout(waiter.timer);
      waiter.resolve(Math.max(0, Math.round(performance.now() - waiter.startedAt)));
    }
    return;
  }

  let message: RelayInboundMessage;
  try {
    message = JSON.parse(event.data) as RelayInboundMessage;
  } catch {
    console.warn(`${LOG_PREFIX} Ignoring malformed relay message`);
    return;
  }

  if (message.type === 'hello_ack') {
    relayLog('HELLO_ACK', { authenticated: Boolean(message.authenticated) });
    if (message.authenticated) {
      reconnectAttempt = 0;
      relayMetrics.authenticated();
      updateStatus({ state: 'connected', authenticated: true, lastError: undefined });
      await enforceRemotePause(message.controlState);
      const localControlState = await getControlState();
      sendControlStateMessage(localControlState);
    } else {
      updateStatus({ state: 'error', authenticated: false, lastError: 'Authentication failed' });
      manualDisconnect = true;
      closeSocket();
    }
    return;
  }

  if (message.type === 'tool_call') {
    await executeToolCall(message);
    return;
  }

  if (message.type === 'watch_restore') {
    const result = await restorePersistentBrowserWatches(message.watches || []);
    relayLog('WATCH_RESTORE_APPLIED', result);
    return;
  }

  if (message.type === 'watch_stop') {
    await stopPersistentBrowserWatch(String(message.watchId || ''), message.reason || 'cloud_stop');
    relayLog('WATCH_STOP_APPLIED', { watchId: message.watchId, reason: message.reason || 'cloud_stop' });
    return;
  }

  if (message.type === 'pairing_code') {
    currentPairing = {
      code: String(message.code || ''),
      expiresAt: Number(message.expiresAt || 0),
      deviceId: String(message.deviceId || (await loadConfig()).deviceId || 'default'),
    };
    relayLog('PAIRING_CODE_RECEIVED', { deviceId: currentPairing.deviceId, expiresAt: currentPairing.expiresAt });
    chrome.runtime
      .sendMessage({ type: 'brauzio_pairing_code_changed', pairing: currentPairing })
      .catch(() => {});
    return;
  }

  if (message.type === 'error') {
    updateStatus({ state: 'error', lastError: message.message || 'Relay error' });
  }
}

export async function connectRelay(): Promise<BrauzioRelayStatus> {
  manualDisconnect = false;
  clearReconnect();

  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
    return currentStatus;
  }

  const config = await loadConfig();
  if (!config.autoConnect) {
    updateStatus({ state: 'disabled', authenticated: false, lastError: undefined });
    return currentStatus;
  }

  if (!config.relayUrl) {
    updateStatus({ state: 'disconnected', authenticated: false, lastError: 'Relay URL is not configured' });
    return currentStatus;
  }

  let wsUrl: string;
  try {
    wsUrl = normalizeRelayUrl(config.relayUrl);
    const url = new URL(wsUrl);
    url.searchParams.set('device', config.deviceId || 'default');
    wsUrl = url.toString();
  } catch (error) {
    updateStatus({
      state: 'error',
      authenticated: false,
      lastError: error instanceof Error ? error.message : 'Invalid relay URL',
    });
    return currentStatus;
  }

  updateStatus({ state: 'connecting', authenticated: false, lastError: undefined });

  try {
    const ws = new WebSocket(wsUrl);
    socket = ws;

    const recycleSocket = (reason: string, errorMessage?: string) => {
      if (socket !== ws) return;
      relayLog('WS_RECYCLE', { reason, readyState: ws.readyState });
      relayMetrics.disconnected(errorMessage || reason);
      releaseMouseSafety(reason);
      // Preserve watches and live-view state across transient relay reconnects.
      // They are explicitly stopped only on manual disconnect or user action.
      clearHeartbeat();
      socket = null;
      try {
        ws.close(4000, reason.slice(0, 120));
      } catch {}
      if (!manualDisconnect) {
        updateStatus({ state: 'disconnected', authenticated: false, lastError: errorMessage });
        scheduleReconnect();
      }
    };

    ws.addEventListener('open', async () => {
      if (socket !== ws) return;
      relayMetrics.connected();
      relayLog('WS_OPEN', { relayHost: new URL(wsUrl).host, deviceId: config.deviceId || 'default' });
      const freshConfig = await loadConfig();
      ws.send(
        JSON.stringify({
          type: 'hello',
          deviceId: freshConfig.deviceId || 'default',
          token: freshConfig.deviceToken,
          extensionVersion: chrome.runtime.getManifest().version,
        }),
      );

      clearHeartbeat();
      lastPongAt = Date.now();
      heartbeatTimer = setInterval(() => {
        if (socket !== ws) {
          clearHeartbeat();
          return;
        }
        if (ws.readyState !== WebSocket.OPEN) {
          recycleSocket('heartbeat_socket_not_open', 'Relay socket is no longer open');
          return;
        }
        const now = Date.now();
        if (lastPongAt > 0 && now - lastPongAt > HEARTBEAT_TIMEOUT_MS) {
          recycleSocket('heartbeat_timeout', 'Relay heartbeat timed out');
          return;
        }
        try {
          ws.send('ping');
        } catch {
          recycleSocket('heartbeat_send_failed', 'Relay heartbeat send failed');
        }
      }, HEARTBEAT_MS);
    });

    ws.addEventListener('message', (event) => {
      if (socket !== ws) return;
      void onRelayMessage(event);
    });

    ws.addEventListener('error', () => {
      if (socket !== ws) return;
      relayMetrics.error('WebSocket connection error');
      relayLog('WS_ERROR', { relayHost: new URL(wsUrl).host });
      recycleSocket('relay_socket_error', 'WebSocket connection error');
    });

    ws.addEventListener('close', (event) => {
      if (socket !== ws) return;
      relayLog('WS_CLOSED', { code: event.code, reason: event.reason || '', wasClean: event.wasClean });
      relayMetrics.disconnected(event.reason || `WebSocket closed (${event.code})`);
      releaseMouseSafety('relay_socket_closed');
      // Keep persistent watches/live view alive while transport reconnects.
      clearHeartbeat();
      socket = null;
      if (!manualDisconnect) {
        updateStatus({ state: 'disconnected', authenticated: false });
        scheduleReconnect();
      }
    });
  } catch (error) {
    socket = null;
    relayMetrics.error(error);
    relayMetrics.disconnected(error instanceof Error ? error.message : String(error));
    updateStatus({
      state: 'error',
      authenticated: false,
      lastError: error instanceof Error ? error.message : String(error),
    });
    scheduleReconnect();
  }

  return currentStatus;
}

export async function disconnectRelay() {
  manualDisconnect = true;
  currentPairing = null;
  clearReconnect();
  stopLiveViewSafety('manual_relay_disconnect');
  await Promise.allSettled([
    releaseAllMouseHolds('manual_relay_disconnect'),
    stopAllBrowserWatches('manual_relay_disconnect', undefined, true),
  ]);
  closeSocket();
  updateStatus({ state: 'disconnected', authenticated: false, lastError: undefined });
}

export function initRemoteRelayListener() {
  configureControlStateSink((state) => {
    sendControlStateMessage(state);
  });

  configureWatchPersistenceSink({
    started(watch) {
      sendWatchPersistenceMessage({ type: 'watch_started', watch });
    },
    event(event: WatchEvent) {
      sendWatchPersistenceMessage({ type: 'watch_event', event });
    },
    stopped(watchId, reason) {
      sendWatchPersistenceMessage({ type: 'watch_stopped', watchId, reason });
    },
  });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || typeof message.type !== 'string') return false;

    if (message.type === 'brauzio_relay_get_status') {
      sendResponse({ success: true, status: currentStatus });
      return false;
    }

    if (message.type === 'brauzio_relay_get_config') {
      void loadConfig()
        .then((config) => sendResponse({ success: true, config }))
        .catch((error) => sendResponse({ success: false, error: String(error) }));
      return true;
    }

    if (message.type === 'brauzio_relay_save_config') {
      void saveConfig(message.config || {})
        .then(async (config) => {
          await disconnectRelay();
          manualDisconnect = false;
          if (config.autoConnect) await connectRelay();
          sendResponse({
            success: true,
            config,
            status: currentStatus,
          });
        })
        .catch((error) => sendResponse({ success: false, error: String(error) }));
      return true;
    }

    if (message.type === 'brauzio_relay_connect') {
      void connectRelay()
        .then((status) => sendResponse({ success: true, status }))
        .catch((error) => sendResponse({ success: false, error: String(error) }));
      return true;
    }

    if (message.type === 'brauzio_relay_disconnect') {
      void disconnectRelay()
        .then(() => sendResponse({ success: true, status: currentStatus }))
        .catch((error) => sendResponse({ success: false, error: String(error) }));
      return true;
    }

    if (message.type === 'brauzio_diagnostics_run') {
      void runDiagnostics()
        .then((report) => sendResponse({ success: true, report }))
        .catch((error) => sendResponse({ success: false, error: String(error) }));
      return true;
    }

    if (message.type === 'brauzio_pairing_get') {
      sendResponse({ success: true, pairing: currentPairing });
      return false;
    }

    if (message.type === 'brauzio_control_get_state') {
      void getControlState()
        .then((state) => sendResponse({ success: true, state }))
        .catch((error) => sendResponse({ success: false, error: String(error) }));
      return true;
    }

    if (message.type === 'brauzio_control_pause') {
      void pauseAgentControl(String(message.reason || 'user_pause'))
        .then((state) => {
          sendControlStateMessage(state);
          sendResponse({ success: true, state });
        })
        .catch((error) => sendResponse({ success: false, error: String(error) }));
      return true;
    }

    if (message.type === 'brauzio_control_resume') {
      void resumeAgentControl(String(message.reason || 'user_resume'))
        .then((state) => {
          sendControlStateMessage(state);
          sendResponse({ success: true, state });
        })
        .catch((error) => sendResponse({ success: false, error: String(error) }));
      return true;
    }

    return false;
  });

  void loadConfig().then((config) => {
    if (config.autoConnect && config.relayUrl) void connectRelay();
  });
}
