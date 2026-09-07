from pathlib import Path

path = Path('app/chrome-extension/entrypoints/background/remote-relay.ts')
s = path.read_text(encoding='utf-8')

replacements = [
    (
        "const HEARTBEAT_MS = 20_000;\nconst RECONNECT_MAX_MS = 30_000;",
        "const HEARTBEAT_MS = 20_000;\nconst HEARTBEAT_TIMEOUT_MS = 35_000;\nconst RECONNECT_MAX_MS = 30_000;",
        'heartbeat constants',
    ),
    (
        "let reconnectAttempt = 0;\nlet manualDisconnect = false;",
        "let reconnectAttempt = 0;\nlet lastPongAt = 0;\nlet manualDisconnect = false;",
        'last pong state',
    ),
    (
        "function clearHeartbeat() {\n  if (heartbeatTimer) clearInterval(heartbeatTimer);\n  heartbeatTimer = null;\n}",
        "function clearHeartbeat() {\n  if (heartbeatTimer) clearInterval(heartbeatTimer);\n  heartbeatTimer = null;\n  lastPongAt = 0;\n}",
        'heartbeat cleanup',
    ),
    (
        "  if (event.data === 'pong') {\n    if (diagnosticPingWaiter) {",
        "  if (event.data === 'pong') {\n    lastPongAt = Date.now();\n    if (diagnosticPingWaiter) {",
        'pong tracking',
    ),
]

for old, new, label in replacements:
    if old not in s:
        if new in s:
            continue
        raise SystemExit(f'{label} marker not found')
    s = s.replace(old, new, 1)

old_block = '''  try {
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
  } catch (error) {'''

new_block = '''  try {
    const ws = new WebSocket(wsUrl);
    socket = ws;

    const recycleSocket = (reason: string, errorMessage?: string) => {
      if (socket !== ws) return;
      relayLog('WS_RECYCLE', { reason, readyState: ws.readyState });
      releaseMouseSafety(reason);
      stopWatchSafety(reason);
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
      relayLog('WS_ERROR', { relayHost: new URL(wsUrl).host });
      recycleSocket('relay_socket_error', 'WebSocket connection error');
    });

    ws.addEventListener('close', (event) => {
      if (socket !== ws) return;
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
  } catch (error) {'''

if old_block in s:
    s = s.replace(old_block, new_block, 1)
elif "const recycleSocket = (reason: string" not in s:
    raise SystemExit('connectRelay WebSocket block marker not found')

path.write_text(s, encoding='utf-8')
print('Reconnect watchdog source applied')
