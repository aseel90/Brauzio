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
  codeHash: string;
  expiresAt: number;
  attempts: number;
}

interface PendingCall {
  resolve: (response: Response) => void;
  timer: ReturnType<typeof setTimeout>;
  name: string;
  startedAt: number;
  actor: boolean;
  callerId: string;
}

interface ActorLeaseRecord {
  ownerId: string;
  acquiredAt: number;
  lastSeenAt: number;
  expiresAt: number;
}

interface ObserverSessionRecord {
  lastSeenAt: number;
  expiresAt: number;
}

interface ControlStateRecord {
  paused: boolean;
  reason: string;
  source: string;
  since: number | null;
  lastUpdated: number;
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

interface PersistentWatchDescriptor {
  watchId: string;
  tabId: number;
  createdAt: number;
  expiresAt: number;
  maxEvents: number;
  nextSequence: number;
  categories?: string[];
  methods?: string[];
  urlIncludes?: string;
}

interface PersistentWatchEvent {
  sequence: number;
  watchId: string;
  tabId: number;
  sessionId?: string;
  method: string;
  timestamp: number;
  data: Record<string, unknown>;
}

interface PersistentWatchRecord extends PersistentWatchDescriptor {
  events: PersistentWatchEvent[];
  stopped?: boolean;
  stopReason?: string;
}

interface PersistentWatchWaiter {
  id: number;
  afterSequence: number;
  method?: string;
  resolve: (response: Response) => void;
  timer: ReturnType<typeof setTimeout>;
}

const PAIRING_STORAGE_KEY = 'oauth-pairing-v1';
const CONTROL_STORAGE_KEY = 'control-state-v1';
const ACTOR_LEASE_STORAGE_KEY = 'actor-lease-v1';
const OBSERVER_STORAGE_PREFIX = 'observer-session-v1:';
const ACTOR_LEASE_TTL_MS = 60_000;
const OBSERVER_SESSION_TTL_MS = 5 * 60_000;
const WATCH_STORAGE_PREFIX = 'watch-v1:';
const WATCH_WAIT_MAX_MS = 115_000;
const PAIRING_TTL_MS = 5 * 60 * 1000;
const PAIRING_MAX_ATTEMPTS = 10;
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

async function pairingCodeHash(value: unknown): Promise<string> {
  const normalized = normalizePairingCode(value);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(normalized));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) {
    diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return diff === 0;
}

function validTraceId(value: unknown): string | null {
  const candidate = typeof value === 'string' ? value.trim() : '';
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(candidate)
    ? candidate
    : null;
}

function normalizeCallerId(value: unknown): string {
  const candidate = String(value || '').trim().toLowerCase();
  return /^caller-[0-9a-f]{32}$/.test(candidate) ? candidate : 'caller-legacy';
}

function normalizeControlState(value: unknown): ControlStateRecord {
  const raw = (value || {}) as Partial<ControlStateRecord>;
  return {
    paused: raw.paused === true,
    reason: String(raw.reason || '').slice(0, 128),
    source: String(raw.source || 'extension').slice(0, 64),
    since: raw.since ? Number(raw.since) : null,
    lastUpdated: Number(raw.lastUpdated || Date.now()),
  };
}

function isActorTool(name: string, args: Record<string, unknown> = {}): boolean {
  const observers = new Set([
    'get_windows_and_tabs',
    'chrome_read_page',
    'chrome_screenshot',
    'chrome_console',
    'chrome_get_web_content',
    'chrome_history',
    'chrome_bookmark_search',
    'chrome_network_capture',
    'chrome_network_capture_start',
    'chrome_network_capture_stop',
    'chrome_network_debugger_start',
    'chrome_network_debugger_stop',
    'performance_start_trace',
    'performance_stop_trace',
    'performance_analyze_insight',
    'chrome_gif_recorder',
    'chrome_watch_start',
    'chrome_watch_wait',
    'chrome_watch_read',
    'chrome_watch_stop',
  ]);
  if (observers.has(name)) return false;
  if (name === 'chrome_computer') {
    return !new Set(['wait', 'wait_for', 'screenshot']).has(String(args.action || ''));
  }
  if (name === 'chrome_cdp') {
    return !new Set(['list_allowed', 'sessions']).has(String(args.action || 'command'));
  }
  return true;
}

export class BrowserSession extends DurableObject<Env> {
  private pending = new Map<string, PendingCall>();
  private watchWaiters = new Map<string, Map<number, PersistentWatchWaiter>>();
  private watchWaiterSerial = 0;

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
      const activeWatches = (await this.listActiveWatches()).length;
      const controlState = await this.getControlState();
      const actorLease = await this.getActorLease();
      const observerSessions = await this.listObserverSessions();
      return Response.json({
        connected: sockets.length > 0,
        connections: sockets.length,
        activeWatches,
        controlPaused: controlState.paused,
        controlReason: controlState.reason,
        controlSince: controlState.since,
        actorLeaseActive: Boolean(actorLease),
        actorLeaseExpiresAt: actorLease?.expiresAt || null,
        observerSessions: observerSessions.length,
      });
    }

    if (url.pathname === '/pairing/consume' && request.method === 'POST') {
      const body = (await request.json().catch(() => ({}))) as { code?: string };
      const suppliedHash = await pairingCodeHash(body.code);
      const record = await this.ctx.storage.get<PairingRecord>(PAIRING_STORAGE_KEY);
      const connectedSockets = this.authenticatedSockets().length;

      if (!record) {
        sessionLog('PAIRING_REJECTED', { reason: 'not_found', connectedSockets });
        return Response.json({ error: 'No active pairing code', code: 'PAIRING_NOT_FOUND' }, { status: 404 });
      }

      if (record.expiresAt <= Date.now()) {
        await this.ctx.storage.delete(PAIRING_STORAGE_KEY);
        sessionLog('PAIRING_REJECTED', { reason: 'expired', expiresAt: record.expiresAt, connectedSockets });
        return Response.json({ error: 'Pairing code expired', code: 'PAIRING_EXPIRED' }, { status: 410 });
      }

      if (!constantTimeEqual(suppliedHash, record.codeHash)) {
        const attempts = record.attempts + 1;
        if (attempts >= PAIRING_MAX_ATTEMPTS) {
          await this.ctx.storage.delete(PAIRING_STORAGE_KEY);
          sessionLog('PAIRING_REJECTED', { reason: 'attempts_exceeded', attempts, connectedSockets });
          return Response.json({ error: 'Pairing attempts exceeded', code: 'PAIRING_ATTEMPTS_EXCEEDED' }, { status: 429 });
        }
        await this.ctx.storage.put(PAIRING_STORAGE_KEY, { ...record, attempts });
        sessionLog('PAIRING_REJECTED', { reason: 'mismatch', attempts, connectedSockets });
        return Response.json({ error: 'Pairing code mismatch', code: 'PAIRING_MISMATCH' }, { status: 401 });
      }

      await this.ctx.storage.delete(PAIRING_STORAGE_KEY);
      sessionLog('PAIRING_CONSUMED', { expiresAt: record.expiresAt, connectedSockets });
      return Response.json({ ok: true });
    }

    if ((url.pathname === '/call' || url.pathname === '/tool-call') && request.method === 'POST') {
      const body = (await request.json()) as {
        name?: string;
        args?: Record<string, unknown>;
        arguments?: Record<string, unknown>;
        callerId?: string;
        timeoutMs?: number;
        traceId?: string;
      };
      if (!body.name) return Response.json({ error: 'Missing tool name' }, { status: 400 });
      const args = body.args || body.arguments || {};
      const normalizedBody = { ...body, args, callerId: normalizeCallerId(body.callerId) };

      if (body.name === 'chrome_watch_read') {
        const watchId = String(args.watchId || '');
        if (watchId && (await this.getWatch(watchId))) return await this.handleWatchRead(args);
      }
      if (body.name === 'chrome_watch_wait') {
        const watchId = String(args.watchId || '');
        if (watchId && (await this.getWatch(watchId))) return await this.handleWatchWait(args);
      }
      if (body.name === 'chrome_watch_stop') {
        const watchId = String(args.watchId || '');
        if (watchId && (await this.getWatch(watchId))) return await this.handleWatchStop(watchId);
      }

      return await this.forwardToolCall(normalizedBody);
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
      const authenticated = expectedSecret.length >= 16 && receivedSecret === expectedSecret && deviceMatches;
      const next: SocketAttachment = {
        authenticated,
        deviceId: attachment.deviceId,
        extensionVersion: String(payload.extensionVersion || ''),
        connectedAt: attachment.connectedAt || Date.now(),
      };
      ws.serializeAttachment(next);
      sessionLog('HELLO', { deviceId: attachment.deviceId, authenticated, extensionVersion: next.extensionVersion || '' });
      const controlState = await this.getControlState();
      ws.send(JSON.stringify({ type: 'hello_ack', authenticated, deviceId: attachment.deviceId, controlState }));
      if (authenticated) await this.sendWatchRestore(ws);
      if (!authenticated) ws.close(1008, deviceMatches ? 'Authentication failed' : 'Device mismatch');
      return;
    }

    if (!attachment.authenticated) {
      ws.send(JSON.stringify({ type: 'error', message: 'Authenticate first' }));
      ws.close(1008, 'Authentication required');
      return;
    }

    if (payload.type === 'control_state' && payload.state) {
      await this.persistControlState(payload.state);
      return;
    }
    if (payload.type === 'watch_started' && payload.watch) {
      await this.persistWatchStarted(payload.watch as PersistentWatchDescriptor);
      return;
    }
    if (payload.type === 'watch_event' && payload.event) {
      await this.persistWatchEvent(payload.event as PersistentWatchEvent);
      return;
    }
    if (payload.type === 'watch_stopped' && payload.watchId) {
      await this.persistWatchStopped(String(payload.watchId), String(payload.reason || 'browser_stopped'));
      return;
    }
    if (payload.type === 'pairing_create') {
      const code = createPairingCode();
      const expiresAt = Date.now() + PAIRING_TTL_MS;
      const codeHash = await pairingCodeHash(code);
      await this.ctx.storage.put(PAIRING_STORAGE_KEY, { codeHash, expiresAt, attempts: 0 } satisfies PairingRecord);
      sessionLog('PAIRING_CREATED', { deviceId: attachment.deviceId, expiresAt });
      ws.send(JSON.stringify({ type: 'pairing_code', code, expiresAt, deviceId: attachment.deviceId }));
      return;
    }
    if (payload.type === 'tool_result' && payload.requestId) await this.finishToolCall(payload as ToolResultMessage);
  }

  webSocketClose(): void {
    sessionLog('WS_CLOSE', { authenticatedSockets: this.authenticatedSockets().length });
    if (this.authenticatedSockets().length === 0) {
      this.failPending('Brauzio extension disconnected during tool execution');
      void this.revokeActorLease('browser_disconnected');
    }
  }

  webSocketError(): void {
    sessionLog('WS_ERROR', { authenticatedSockets: this.authenticatedSockets().length });
    if (this.authenticatedSockets().length === 0) {
      this.failPending('Brauzio WebSocket connection failed');
      void this.revokeActorLease('browser_websocket_error');
    }
  }

  private watchKey(watchId: string): string { return `${WATCH_STORAGE_PREFIX}${watchId}`; }

  private toolResult(payload: Record<string, unknown>) {
    return { content: [{ type: 'text', text: JSON.stringify({ success: true, ...payload }) }], isError: false };
  }

  private async forwardToolCall(body: { name?: string; args?: Record<string, unknown>; callerId?: string; timeoutMs?: number; traceId?: string }): Promise<Response> {
    const actor = isActorTool(String(body.name || ''), body.args || {});
    const callerId = normalizeCallerId(body.callerId);
    if (actor) {
      const controlState = await this.getControlState();
      if (controlState.paused) {
        sessionLog('CALL_BLOCKED_CONTROL_PAUSED', { name: body.name, reason: controlState.reason, source: controlState.source });
        return Response.json({ error: `Brauzio actor control is paused (${controlState.reason || 'paused'}). Resume control from the Brauzio extension.`, controlPaused: true, controlState }, { status: 423 });
      }
    }

    const browser = this.authenticatedSockets()[0];
    if (!browser) return Response.json({ error: 'Brauzio extension is not connected to Cloudflare' }, { status: 503 });

    const timeoutMs = Math.min(Math.max(Number(body.timeoutMs || 120_000), 1_000), 180_000);
    if (actor) {
      const leaseResult = await this.acquireActorLease(callerId, timeoutMs);
      if (!leaseResult.ok) {
        const retryAfterMs = Math.max(0, leaseResult.lease.expiresAt - Date.now());
        sessionLog('ACTOR_LEASE_CONFLICT', { name: body.name, retryAfterMs });
        return Response.json({
          error: 'Another Brauzio actor session currently holds control.',
          code: 'ACTOR_LEASE_CONFLICT',
          retryAfterMs,
          actorLeaseExpiresAt: leaseResult.lease.expiresAt,
        }, { status: 409 });
      }
    } else {
      await this.touchObserverSession(callerId);
    }

    const requestId = validTraceId(body.traceId) || crypto.randomUUID();
    const startedAt = Date.now();
    sessionLog('CALL_RECEIVED', { requestId, name: body.name, actor, authenticatedSockets: this.authenticatedSockets().length });

    return new Promise<Response>((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        if (actor) void this.settleActorLease(callerId);
        sessionLog('CALL_TIMEOUT', { requestId, name: body.name, timeoutMs, durationMs: Date.now() - startedAt });
        resolve(Response.json({ error: `Tool call timed out after ${timeoutMs}ms (traceId: ${requestId})` }, { status: 504 }));
      }, timeoutMs);
      this.pending.set(requestId, { resolve, timer, name: body.name!, startedAt, actor, callerId });
      try {
        browser.send(JSON.stringify({ type: 'tool_call', requestId, name: body.name, args: body.args || {} }));
        sessionLog('CALL_SENT_TO_BROWSER', { requestId, name: body.name, actor });
      } catch (error) {
        clearTimeout(timer);
        this.pending.delete(requestId);
        if (actor) void this.settleActorLease(callerId);
        resolve(Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 502 }));
      }
    });
  }

  private observerKey(callerId: string): string { return `${OBSERVER_STORAGE_PREFIX}${callerId}`; }

  private async getActorLease(): Promise<ActorLeaseRecord | null> {
    const lease = await this.ctx.storage.get<ActorLeaseRecord>(ACTOR_LEASE_STORAGE_KEY);
    if (!lease) return null;
    if (lease.expiresAt <= Date.now()) {
      await this.ctx.storage.delete(ACTOR_LEASE_STORAGE_KEY);
      return null;
    }
    return lease;
  }

  private async acquireActorLease(ownerId: string, executionTimeoutMs: number): Promise<{ ok: true; lease: ActorLeaseRecord } | { ok: false; lease: ActorLeaseRecord }> {
    return await this.ctx.storage.transaction(async (txn) => {
      const now = Date.now();
      const current = await txn.get<ActorLeaseRecord>(ACTOR_LEASE_STORAGE_KEY);
      if (current && current.expiresAt > now && current.ownerId !== ownerId) {
        return { ok: false as const, lease: current };
      }
      const executionHoldMs = Math.min(Math.max(executionTimeoutMs + 5_000, ACTOR_LEASE_TTL_MS), 185_000);
      const next: ActorLeaseRecord = {
        ownerId,
        acquiredAt: current?.ownerId === ownerId ? current.acquiredAt : now,
        lastSeenAt: now,
        expiresAt: now + executionHoldMs,
      };
      await txn.put(ACTOR_LEASE_STORAGE_KEY, next);
      return { ok: true as const, lease: next };
    });
  }

  private async settleActorLease(ownerId: string): Promise<void> {
    await this.ctx.storage.transaction(async (txn) => {
      const current = await txn.get<ActorLeaseRecord>(ACTOR_LEASE_STORAGE_KEY);
      if (!current || current.ownerId !== ownerId) return;
      const now = Date.now();
      await txn.put(ACTOR_LEASE_STORAGE_KEY, { ...current, lastSeenAt: now, expiresAt: now + ACTOR_LEASE_TTL_MS });
    });
  }

  private async revokeActorLease(reason: string): Promise<void> {
    const current = await this.ctx.storage.get<ActorLeaseRecord>(ACTOR_LEASE_STORAGE_KEY);
    if (!current) return;
    await this.ctx.storage.delete(ACTOR_LEASE_STORAGE_KEY);
    sessionLog('ACTOR_LEASE_REVOKED', { reason });
  }

  private async touchObserverSession(callerId: string): Promise<void> {
    const now = Date.now();
    await this.ctx.storage.put(this.observerKey(callerId), { lastSeenAt: now, expiresAt: now + OBSERVER_SESSION_TTL_MS } satisfies ObserverSessionRecord);
  }

  private async listObserverSessions(): Promise<ObserverSessionRecord[]> {
    const stored = await this.ctx.storage.list<ObserverSessionRecord>({ prefix: OBSERVER_STORAGE_PREFIX });
    const now = Date.now();
    const active: ObserverSessionRecord[] = [];
    const expired: string[] = [];
    for (const [key, record] of stored) {
      if (!record || record.expiresAt <= now) expired.push(key);
      else active.push(record);
    }
    if (expired.length) await this.ctx.storage.delete(expired);
    return active;
  }

  private async getControlState(): Promise<ControlStateRecord> {
    const stored = await this.ctx.storage.get<ControlStateRecord>(CONTROL_STORAGE_KEY);
    return stored ? normalizeControlState(stored) : { paused: false, reason: '', source: 'none', since: null, lastUpdated: 0 };
  }

  private async persistControlState(value: unknown): Promise<void> {
    const next = normalizeControlState(value);
    await this.ctx.storage.put(CONTROL_STORAGE_KEY, next);
    sessionLog('CONTROL_STATE_UPDATED', { paused: next.paused, reason: next.reason, source: next.source, since: next.since });
    if (next.paused) {
      await this.revokeActorLease(next.reason || 'control_paused');
      this.failPendingActors(next);
    }
  }

  private failPendingActors(controlState: ControlStateRecord): void {
    for (const [requestId, pending] of this.pending) {
      if (!pending.actor) continue;
      clearTimeout(pending.timer);
      this.pending.delete(requestId);
      pending.resolve(Response.json({ error: `Brauzio actor control paused during tool execution (${controlState.reason || 'paused'}).`, controlPaused: true, controlState }, { status: 423 }));
      sessionLog('CALL_INTERRUPTED_CONTROL_PAUSED', { requestId, name: pending.name });
    }
  }

  private async getWatch(watchId: string): Promise<PersistentWatchRecord | null> {
    const record = await this.ctx.storage.get<PersistentWatchRecord>(this.watchKey(watchId));
    if (!record) return null;
    if (record.expiresAt <= Date.now()) {
      await this.ctx.storage.delete(this.watchKey(watchId));
      this.resolveWatchWaiters(watchId, { stopped: true, reason: 'expired' });
      return null;
    }
    return record;
  }

  private async listActiveWatches(): Promise<PersistentWatchRecord[]> {
    const stored = await this.ctx.storage.list<PersistentWatchRecord>({ prefix: WATCH_STORAGE_PREFIX });
    const active: PersistentWatchRecord[] = [];
    const expired: string[] = [];
    const now = Date.now();
    for (const [key, record] of stored) {
      if (!record || record.expiresAt <= now) { expired.push(key); continue; }
      if (!record.stopped) active.push(record);
    }
    if (expired.length) await this.ctx.storage.delete(expired);
    return active;
  }

  private async sendWatchRestore(ws: WebSocket): Promise<void> {
    const watches = await this.listActiveWatches();
    if (!watches.length) return;
    ws.send(JSON.stringify({ type: 'watch_restore', watches: watches.map(({ events: _events, stopped: _stopped, stopReason: _stopReason, ...watch }) => watch) }));
    sessionLog('WATCH_RESTORE_SENT', { count: watches.length });
  }

  private normalizeWatchDescriptor(value: PersistentWatchDescriptor): PersistentWatchDescriptor {
    const now = Date.now();
    return {
      watchId: String(value.watchId || '').slice(0, 128), tabId: Number(value.tabId), createdAt: Number(value.createdAt || now), expiresAt: Number(value.expiresAt || now), maxEvents: Math.max(10, Math.min(Number(value.maxEvents || 100), 500)), nextSequence: Math.max(0, Number(value.nextSequence || 0)), categories: Array.isArray(value.categories) ? value.categories.map(String).slice(0, 10) : undefined, methods: Array.isArray(value.methods) ? value.methods.map(String).slice(0, 50) : undefined, urlIncludes: value.urlIncludes ? String(value.urlIncludes).slice(0, 2048) : undefined,
    };
  }

  private async persistWatchStarted(value: PersistentWatchDescriptor): Promise<void> {
    const watch = this.normalizeWatchDescriptor(value);
    if (!watch.watchId || !Number.isFinite(watch.tabId) || watch.expiresAt <= Date.now()) return;
    const existing = await this.ctx.storage.get<PersistentWatchRecord>(this.watchKey(watch.watchId));
    const record: PersistentWatchRecord = { ...watch, nextSequence: Math.max(watch.nextSequence, existing?.nextSequence || 0), events: existing?.events || [], stopped: false, stopReason: undefined };
    await this.ctx.storage.put(this.watchKey(watch.watchId), record);
    sessionLog('WATCH_PERSISTED', { watchId: watch.watchId, tabId: watch.tabId, nextSequence: record.nextSequence });
  }

  private async persistWatchEvent(event: PersistentWatchEvent): Promise<void> {
    const watchId = String(event.watchId || '');
    if (!watchId) return;
    const record = await this.getWatch(watchId);
    if (!record || record.stopped) return;
    const sequence = Math.max(1, Number(event.sequence || 0));
    if (sequence <= record.nextSequence) return;
    const normalized: PersistentWatchEvent = { sequence, watchId, tabId: Number(event.tabId || record.tabId), sessionId: event.sessionId ? String(event.sessionId).slice(0, 256) : undefined, method: String(event.method || '').slice(0, 256), timestamp: Number(event.timestamp || Date.now()), data: event.data && typeof event.data === 'object' ? event.data : {} };
    record.nextSequence = sequence;
    record.events.push(normalized);
    if (record.events.length > record.maxEvents) record.events.splice(0, record.events.length - record.maxEvents);
    await this.ctx.storage.put(this.watchKey(watchId), record);
    this.resolveWatchWaiters(watchId, { event: normalized });
  }

  private async persistWatchStopped(watchId: string, reason: string): Promise<void> {
    const record = await this.getWatch(watchId);
    if (!record) return;
    record.stopped = true;
    record.stopReason = reason.slice(0, 128);
    await this.ctx.storage.put(this.watchKey(watchId), record);
    this.resolveWatchWaiters(watchId, { stopped: true, reason: record.stopReason });
    sessionLog('WATCH_STOPPED', { watchId, reason: record.stopReason });
  }

  private resolveWatchWaiters(watchId: string, result: { event?: PersistentWatchEvent; stopped?: boolean; reason?: string }): void {
    const waiters = this.watchWaiters.get(watchId);
    if (!waiters) return;
    for (const [id, waiter] of waiters) {
      if (result.event) {
        if (result.event.sequence <= waiter.afterSequence) continue;
        if (waiter.method && waiter.method !== result.event.method) continue;
      }
      clearTimeout(waiter.timer);
      waiters.delete(id);
      waiter.resolve(Response.json({ result: this.toolResult({ watchId, ...result, source: 'durable_object' }) }));
    }
    if (!waiters.size) this.watchWaiters.delete(watchId);
  }

  private async handleWatchRead(args: Record<string, unknown>): Promise<Response> {
    const watchId = String(args.watchId || '');
    const record = await this.getWatch(watchId);
    if (!record) return Response.json({ error: `Watch not found: ${watchId}` }, { status: 404 });
    const after = Math.max(0, Number(args.afterSequence || 0));
    const limit = Math.max(1, Math.min(Number(args.limit || 50), 200));
    const method = args.method ? String(args.method) : '';
    const events = record.events.filter((event) => event.sequence > after && (!method || event.method === method)).slice(0, limit);
    return Response.json({ result: this.toolResult({ watchId, tabId: record.tabId, events, nextSequence: record.nextSequence, buffered: record.events.length, expiresAt: record.expiresAt, stopped: Boolean(record.stopped), stopReason: record.stopReason, source: 'durable_object' }) });
  }

  private async handleWatchWait(args: Record<string, unknown>): Promise<Response> {
    const watchId = String(args.watchId || '');
    const record = await this.getWatch(watchId);
    if (!record) return Response.json({ error: `Watch not found: ${watchId}` }, { status: 404 });
    const after = Math.max(0, Number(args.afterSequence || 0));
    const method = args.method ? String(args.method) : '';
    const existing = record.events.find((event) => event.sequence > after && (!method || event.method === method));
    if (existing) return Response.json({ result: this.toolResult({ watchId, event: existing, source: 'durable_object' }) });
    if (record.stopped) return Response.json({ result: this.toolResult({ watchId, stopped: true, reason: record.stopReason || 'stopped', source: 'durable_object' }) });
    const timeoutMs = Math.max(50, Math.min(Number(args.timeoutMs || 10_000), WATCH_WAIT_MAX_MS));
    return await new Promise<Response>((resolve) => {
      const id = ++this.watchWaiterSerial;
      const timer = setTimeout(() => {
        const waiters = this.watchWaiters.get(watchId);
        waiters?.delete(id);
        if (waiters && !waiters.size) this.watchWaiters.delete(watchId);
        resolve(Response.json({ result: this.toolResult({ watchId, timedOut: true, reason: 'timeout', source: 'durable_object' }) }));
      }, timeoutMs);
      const waiters = this.watchWaiters.get(watchId) || new Map<number, PersistentWatchWaiter>();
      waiters.set(id, { id, afterSequence: after, method: method || undefined, resolve, timer });
      this.watchWaiters.set(watchId, waiters);
    });
  }

  private async handleWatchStop(watchId: string): Promise<Response> {
    const record = await this.getWatch(watchId);
    if (!record) return Response.json({ error: `Watch not found: ${watchId}` }, { status: 404 });
    await this.persistWatchStopped(watchId, 'explicit_stop');
    const browser = this.authenticatedSockets()[0];
    if (browser) { try { browser.send(JSON.stringify({ type: 'watch_stop', watchId })); } catch {} }
    return Response.json({ result: this.toolResult({ watchId, tabId: record.tabId, stopped: true, reason: 'explicit_stop', finalSequence: record.nextSequence, source: 'durable_object' }) });
  }

  private authenticatedSockets(): WebSocket[] {
    return this.ctx.getWebSockets('browser').filter((ws) => {
      try {
        const attachment = ws.deserializeAttachment() as SocketAttachment | null;
        return attachment?.authenticated === true && ws.readyState === WebSocket.OPEN;
      } catch { return false; }
    });
  }

  private async finishToolCall(message: ToolResultMessage): Promise<void> {
    const pending = this.pending.get(message.requestId);
    if (!pending) return;
    clearTimeout(pending.timer);
    sessionLog(message.error ? 'RESULT_ERROR' : 'RESULT_OK', { requestId: message.requestId, name: pending.name, durationMs: Date.now() - pending.startedAt, error: message.error || undefined });
    this.pending.delete(message.requestId);
    if (pending.actor) await this.settleActorLease(pending.callerId);
    if (message.error) { pending.resolve(Response.json({ error: message.error }, { status: 500 })); return; }
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
