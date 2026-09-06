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

interface PendingCall {
  resolve: (response: Response) => void;
  timer: ReturnType<typeof setTimeout>;
}

interface ToolResultMessage {
  type: 'tool_result';
  requestId: string;
  result?: unknown;
  error?: string;
}

function normalizeDeviceId(value: unknown): string {
  const normalized = String(value || 'default').trim().slice(0, 128);
  return normalized || 'default';
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
      };
      if (!body.name) return Response.json({ error: 'Missing tool name' }, { status: 400 });

      const requestId = crypto.randomUUID();
      const timeoutMs = Math.min(Math.max(Number(body.timeoutMs || 120_000), 1_000), 180_000);

      return new Promise<Response>((resolve) => {
        const timer = setTimeout(() => {
          this.pending.delete(requestId);
          resolve(Response.json({ error: `Tool call timed out after ${timeoutMs}ms` }, { status: 504 }));
        }, timeoutMs);

        this.pending.set(requestId, { resolve, timer });

        try {
          browser.send(
            JSON.stringify({
              type: 'tool_call',
              requestId,
              name: body.name,
              args: body.args || {},
            }),
          );
        } catch (error) {
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

    if (payload.type === 'tool_result' && payload.requestId) {
      this.finishToolCall(payload as ToolResultMessage);
    }
  }

  webSocketClose(): void {
    if (this.authenticatedSockets().length === 0) {
      this.failPending('Brauzio extension disconnected during tool execution');
    }
  }

  webSocketError(): void {
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
