import { handleCallTool } from './tools';
import {
  configureWatchPersistenceSink,
  restorePersistentBrowserWatches,
  stopAllBrowserWatches,
  stopPersistentBrowserWatch,
  type PersistentWatchDescriptor,
  type WatchEvent,
} from './tools/browser/watch';
import { releaseAllMouseHolds } from '@/utils/mouse-hold-safety';
import {
  beginAgentToolExecution,
  configureControlStateSink,
  enforceRemotePause,
  getControlState,
  handleHumanInput,
  pauseAgentControl,
  resumeAgentControl,
  type BrauzioControlState,
  type AgentExecutionGuard,
} from '@/utils/control-safety';

const LOG_PREFIX = '[BrauzioRelay]';
const HEARTBEAT_MS = 20_000;
const RECONNECT_MAX_MS = 30_000;

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
let manualDisconnect = false;
let currentPairing: { code: string; expiresAt: number; deviceId: string } | null = null;

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
}

function clearReconnect() {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = null;
}

function releaseMouseSafety(reason: string) {
  void releaseAllMouseHolds(reason)
    .then((count) => {
      if (count > 0) relayLog('MOUSE_HOLD_EMERGENCY_RELEASE', { reason, count });
    })
    .catch((error) => {
      relayLog('MOUSE_HOLD_RELEASE_FAILED', {
        reason,
        error: error instanceof Error ? error.message : String(error),
      });
    });
}

function sendControlStateMessage(state: BrauzioControlState): void {
  if (!socket || socket.readyState !== WebSocket.OPEN || !currentStatus.authenticated) return;
  try {
    socket.send(
      JSON.stringify({
        type: 'control_state',
        state: {
          paused: state.paused,
          reason: state.reason,
          source: state.source,
          since: state.since,
          lastUpdated: state.lastUpdated,
        },
      }),
    );
  } catch (error) {
    relayLog('CONTROL_STATE_SEND_FAILED', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

function sendWatchPersistenceMessage(payload: Record<string, unknown>): void {
  if (!socket || socket.readyState !== WebSocket.OPEN || !currentStatus.authenticated) return;
  try {
    socket.send(JSON.stringify(payload));
  } catch (error) {
    relayLog('WATCH_PERSIST_SEND_FAILED', {
      type: payload.type,
      error: error instanceof Error ? error.message : String(error),
    });
  }
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
  releaseMouseSafety('relay_socket_close_requested');
  stopWatchSafety('relay_socket_close_requested');
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
  const delay = Math.min(1_000 * Math.pow(2, reconnectAttempt++), RECONNECT_MAX_MS);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    void connectRelay().catch(() => {});
  }, delay);
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
  if (event.data === 'pong') return;

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
    updateStatus({ state: 'disabled', authenticated: false });
    return currentStatus;
  }
  if (!config.relayUrl) {
    updateStatus({ state: 'disconnected', authenticated: false, lastError: 'Relay URL is not configured' });
    return currentStatus;
  }
  if (!config.deviceToken) {
    updateStatus({ state: 'disconnected', authenticated: false, lastError: 'Device token is not configured' });
    return currentStatus;
  }

  let wsUrl: string;
  try {
    const normalized = normalizeRelayUrl(config.relayUrl);
    const url = new URL(normalized);
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
    socket = new WebSocket(wsUrl);
    socket.addEventListener('open', async () => {
      relayLog('WS_OPEN', { relayHost: new URL(wsUrl).host, deviceId: config.deviceId || 'default' });
      const freshConfig = await loadConfig();
      socket?.send(
        JSON.stringify({
          type: 'hello',
          deviceId: freshConfig.deviceId || 'default',
          token: freshConfig.deviceToken,
          extensionVersion: chrome.runtime.getManifest().version,
        }),
      );

      clearHeartbeat();
      heartbeatTimer = setInterval(() => {
        if (socket?.readyState === WebSocket.OPEN) socket.send('ping');
      }, HEARTBEAT_MS);
    });

    socket.addEventListener('message', (event) => {
      void onRelayMessage(event);
    });

    socket.addEventListener('error', () => {
      relayLog('WS_ERROR', { relayHost: new URL(wsUrl).host });
      releaseMouseSafety('relay_socket_error');
      stopWatchSafety('relay_socket_error');
      updateStatus({ state: 'error', authenticated: false, lastError: 'WebSocket connection error' });
    });

    socket.addEventListener('close', (event) => {
      relayLog('WS_CLOSED', { code: event.code, reason: event.reason || '', wasClean: event.wasClean });
      releaseMouseSafety('relay_socket_closed');
      stopWatchSafety('relay_socket_closed');
      clearHeartbeat();
      socket = null;
      if (!manualDisconnect) {
        updateStatus({ state: 'disconnected', authenticated: false });
        scheduleReconnect();
      }
    });
  } catch (error) {
    socket = null;
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
          sendResponse({ success: true, config, status: currentStatus });
        })
        .catch((error) => sendResponse({ success: false, error: String(error) }));
      return true;
    }

    if (message.type === 'brauzio_pairing_get') {
      if (currentPairing && currentPairing.expiresAt <= Date.now()) currentPairing = null;
      sendResponse({ success: true, pairing: currentPairing });
      return false;
    }

    if (message.type === 'brauzio_pairing_create') {
      if (!socket || socket.readyState !== WebSocket.OPEN || !currentStatus.authenticated) {
        sendResponse({ success: false, error: 'Brauzio Cloud is not connected' });
        return false;
      }
      currentPairing = null;
      socket.send(JSON.stringify({ type: 'pairing_create' }));
      sendResponse({ success: true });
      return false;
    }

    if (message.type === 'brauzio_human_input') {
      const tabId = typeof _sender.tab?.id === 'number' ? _sender.tab.id : undefined;
      void handleHumanInput(tabId, {
        eventType: String(message.eventType || 'input'),
        at: Number(message.at || Date.now()),
      })
        .then((result) => sendResponse({ success: true, ...result }))
        .catch((error) => sendResponse({ success: false, error: String(error) }));
      return true;
    }

    if (message.type === 'brauzio_control_get_state') {
      void getControlState()
        .then((state) => sendResponse({ success: true, state }))
        .catch((error) => sendResponse({ success: false, error: String(error) }));
      return true;
    }

    if (message.type === 'brauzio_control_pause') {
      void pauseAgentControl(String(message.reason || 'emergency_stop'), 'manual')
        .then((state) => sendResponse({ success: true, state }))
        .catch((error) => sendResponse({ success: false, error: String(error) }));
      return true;
    }

    if (message.type === 'brauzio_control_resume') {
      void resumeAgentControl('manual')
        .then((state) => sendResponse({ success: true, state }))
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

    return false;
  });

  void loadConfig()
    .then((config) => {
      if (config.autoConnect && config.relayUrl && config.deviceToken) {
        return connectRelay();
      }
      return undefined;
    })
    .catch((error) => {
      console.warn(`${LOG_PREFIX} Auto-connect failed`, error);
    });

  chrome.runtime.onStartup.addListener(() => {
    void connectRelay().catch(() => {});
  });
}
