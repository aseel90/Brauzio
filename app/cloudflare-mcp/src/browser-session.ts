import { DurableObject } from 'cloudflare:workers';

interface Env {
  BROWSER_SHARED_SECRET: string;
}

interface SocketAttachment {
  authenticated: boolean;
  deviceId: string;
  extensionVersion?: string;
  connectedAt: number;
}

interface PairingRecord {
  code: string;
  expiresAt: number;
}

interface PendingCall {
  resolve: (response: Response) => void;
  timer: ReturnType<typeof setTimeout>;
  name: string;
  startedAt: number;
}

function sessionLog(event: string, details: Record<string, unknown> = {}) {
  console.log('[BrauzioSession]', new Date().toISOString(), event, details);
}

interface ToolResultMessage {
  type: 'tool_result';
  requestId: string;
  result?: unknown;
  error?: string;
}

const PAIRING_STORAGE_KEY = 'oauth-pairing-v1';
const PAIRING_TTL_MS = 5 * 60 * 1000;
const PAIRING_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function normalizeDeviceId(value: unknown): string {
  const normalized = String(value || 'default').trim().slice(0, 128);
  return normalized || 'default';
}

function normalizePairingCode(value: unknown): string {
  return String(value || '').toUpperCase().replace(/[^A-Z2-9]/g, '').slice(0, 8);
}

function createPairingCode(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  const raw = Array.from(bytes, (value) => PAIRING_ALPHABET[value % PAIRING_ALPHABET.length]).join('');
  return `${raw.slice(0, 4)}-${raw.slice(4)}`;
}

function validTraceId(value: unknown): string | null {
  const candidate = typeof value === 'string' ? value.trim() : '';
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(candidate)
    ? candidate
    : null;
}

export class BrowserSession extends DurableObject<Env> {
  private pending = new Map<string, PendingCall>();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/ws') {
      if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
        return new Response('Expected WebSocket upgrade', { status: 426 });
      }

      const expectedDeviceId = normalizeDeviceId(url.searchParams.get('device'));
      const pair = new WebSocketPair();
      const client = pair[0];
      const server = pair[1];

      this.ctx.acceptWebSocket(server, ['browser']);
      sessionLog('WS_ACCEPTED', { deviceId: expectedDeviceId });
      server.serializeAttachment({
        authenticated: false,
        deviceId: expectedDeviceId,
        connectedAt: Date.now(),
      } satisfies SocketAttachment);

      return new Response(null, { status: 101, webSocket: client });
    }

    if (url.pathname === '/status') {
      const sockets = this.authenticatedSockets();
      return Response.json({ connected: sockets.length > 0, connections: sockets.length });
    }

    if (url.pathname === '/pairing/consume' && request.method === 'POST') {
      if (this.authenticatedSockets().length === 0) {
        return Response.json({ error: 'Brauzio extension is not connected' }, { status: 409 });
      }

      const body = (await request.json().catch(() => ({}))) as { code?: string };
      const suppliedCode = normalizePairingCode(body.code);
      const record = await this.ctx.storage.get<PairingRecord>(PAIRING_STORAGE_KEY);

      if (!record || record.expiresAt <= Date.now() || suppliedCode !== normalizePairingCode(record.code)) {
        if (record?.expiresAt && record.expiresAt <= Date.now()) {
          await this.ctx.storage.delete(PAIRING_STORAGE_KEY);
        }
        sessionLog('PAIRING_REJECTED');
        return Response.json({ error: 'Invalid or expired pairing code' }, { status: 401 });
      }

      await this.ctx.storage.delete(PAIRING_STORAGE_KEY);
      sessionLog('PAIRING_CONSUMED', { expiresAt: record.expiresAt });
      return Response.json({ ok: true });
    }

    if (url.pathname === '/call' && request.method === 'POST') {
      const browser = this.authenticatedSockets()[0];
      if (!browser) {
        return Response.json(
          { error: 'Brauzio extension is not connected to Cloudflare' },
          { status: 503 },
        );
      }

      const body = (await request.json()) as {
        name?: string;
        args?: Record<string, unknown>;
        timeoutMs?: number;
        traceId?: string;
      };
      if (!body.name) return Response.json({ error: 'Missing tool name' }, { status: 400 });

      const requestId = validTraceId(body.traceId) || crypto.randomUUID();
      const startedAt = Date.now();
      sessionLog('CALL_RECEIVED', {
        requestId,
        name: body.name,
        authenticatedSockets: this.authenticatedSockets().length,
      });
      const timeoutMs = Math.min(Math.max(Number(body.timeoutMs || 120_000), 1_000), 180_000);

      return new Promise<Response>((resolve) => {
        const timer = setTimeout(() => {
          this.pending.delete(requestId);
          sessionLog('CALL_TIMEOUT', {
            requestId,
            name: body.name,
            timeoutMs,
            durationMs: Date.now() - startedAt,
          });
          resolve(
            Response.json(
              { error: `Tool call timed out after ${timeoutMs}ms (traceId: ${requestId})` },
              { status: 504 },
            ),
          );
        }, timeoutMs);

        this.pending.set(requestId, { resolve, timer, name: body.name!, startedAt });

        try {
          browser.send(
            JSON.stringify({
              type: 'tool_call',
              requestId,
              name: body.name,
              args: body.args || {},
            }),
          );
          sessionLog('CALL_SENT_TO_BROWSER', { requestId, name: body.name });
        } catch (error) {
          sessionLog('CALL_SEND_FAILED', {
            requestId,
            name: body.name,
            error: error instanceof Error ? error.message : String(error),
          });
          clearTimeout(timer);
          this.pending.delete(requestId);
          resolve(
            Response.json(
              { error: error instanceof Error ? error.message : String(error) },
              { status: 502 },
            ),
          );
        }
      });
    }

    return new Response('Not found', { status: 404 });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (typeof message !== 'string') return;

    let payload: any;
    try {
      payload = JSON.parse(message);
    } catch {
      ws.send(JSON.stringify({ type: 'error', message: 'Malformed JSON message' }));
      return;
    }

    const attachment = (ws.deserializeAttachment() || {
      authenticated: false,
      deviceId: 'default',
      connectedAt: Date.now(),
    }) as SocketAttachment;

    if (payload.type === 'hello') {
      const expectedSecret = String(this.env.BROWSER_SHARED_SECRET || '');
      const receivedSecret = String(payload.token || '');
      const claimedDeviceId = normalizeDeviceId(payload.deviceId);
      const deviceMatches = claimedDeviceId === attachment.deviceId;
      const authenticated =
        expectedSecret.length >= 16 && receivedSecret === expectedSecret && deviceMatches;

      const next: SocketAttachment = {
        authenticated,
        deviceId: attachment.deviceId,
        extensionVersion: String(payload.extensionVersion || ''),
        connectedAt: attachment.connectedAt || Date.now(),
      };
      ws.serializeAttachment(next);
      sessionLog('HELLO', {
        deviceId: attachment.deviceId,
        authenticated,
        extensionVersion: next.extensionVersion || '',
      });
      ws.send(
        JSON.stringify({
          type: 'hello_ack',
          authenticated,
          deviceId: attachment.deviceId,
        }),
      );

      if (!authenticated) {
        ws.close(1008, deviceMatches ? 'Authentication failed' : 'Device mismatch');
      }
      return;
    }

    if (!attachment.authenticated) {
      ws.send(JSON.stringify({ type: 'error', message: 'Authenticate first' }));
      ws.close(1008, 'Authentication required');
      return;
    }

    if (payload.type === 'pairing_create') {
      const code = createPairingCode();
      const expiresAt = Date.now() + PAIRING_TTL_MS;
      await this.ctx.storage.put(PAIRING_STORAGE_KEY, { code, expiresAt } satisfies PairingRecord);
      sessionLog('PAIRING_CREATED', { deviceId: attachment.deviceId, expiresAt });
      ws.send(JSON.stringify({ type: 'pairing_code', code, expiresAt, deviceId: attachment.deviceId }));
      return;
    }

    if (payload.type === 'tool_result' && payload.requestId) {
      this.finishToolCall(payload as ToolResultMessage);
    }
  }

  webSocketClose(): void {
    sessionLog('WS_CLOSE', { authenticatedSockets: this.authenticatedSockets().length });
    if (this.authenticatedSockets().length === 0) {
      this.failPending('Brauzio extension disconnected during tool execution');
    }
  }

  webSocketError(): void {
    sessionLog('WS_ERROR', { authenticatedSockets: this.authenticatedSockets().length });
    if (this.authenticatedSockets().length === 0) {
      this.failPending('Brauzio WebSocket connection failed');
    }
  }

  private authenticatedSockets(): WebSocket[] {
    return this.ctx.getWebSockets('browser').filter((ws) => {
      try {
        const attachment = ws.deserializeAttachment() as SocketAttachment | null;
        return attachment?.authenticated === true && ws.readyState === WebSocket.OPEN;
      } catch {
        return false;
      }
    });
  }

  private finishToolCall(message: ToolResultMessage) {
    const pending = this.pending.get(message.requestId);
    if (!pending) return;

    clearTimeout(pending.timer);
    sessionLog(message.error ? 'RESULT_ERROR' : 'RESULT_OK', {
      requestId: message.requestId,
      name: pending.name,
      durationMs: Date.now() - pending.startedAt,
      error: message.error || undefined,
    });
    this.pending.delete(message.requestId);

    if (message.error) {
      pending.resolve(Response.json({ error: message.error }, { status: 500 }));
      return;
    }

    pending.resolve(Response.json({ result: message.result }));
  }

  private failPending(message: string) {
    for (const [requestId, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.resolve(Response.json({ error: message }, { status: 503 }));
      this.pending.delete(requestId);
    }
  }
}
