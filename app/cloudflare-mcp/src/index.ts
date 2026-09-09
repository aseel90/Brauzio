import { Server, type CallToolResult } from '@modelcontextprotocol/server';
import { createMcpHandler, getMcpAuthContext } from 'agents/mcp/server';
import { OAuthProvider, type AuthRequest, type OAuthHelpers } from '@cloudflare/workers-oauth-provider';
import { TOOL_SCHEMAS } from 'brauzio-shared';
import { BrowserSession } from './browser-session';

export { BrowserSession };

const BRAUZIO_RUNTIME_VERSION = '3.0.6';
const BRAUZIO_SCHEMA_VERSION = '3.0.6';
const BRAUZIO_ORIGIN = 'https://brauzio-mcp.aseelsalah266.workers.dev';
const BRAUZIO_RESOURCE = `${BRAUZIO_ORIGIN}/mcp`;
const BRAUZIO_SCOPE = 'brauzio:control';
const BRAUZIO_COMPUTER_ACTIONS = [
  'mouse_move',
  'mouse_down',
  'mouse_up',
  'drag_hold',
] as const;

interface BrauzioAuthProps {
  deviceId: string;
  authorizedAt: number;
}

interface Env {
  BROWSER_SESSIONS: DurableObjectNamespace<BrowserSession>;
  DEFAULT_DEVICE_ID?: string;
  BROWSER_SHARED_SECRET: string;
  OAUTH_KV: KVNamespace;
  OAUTH_PROVIDER: OAuthHelpers;
}

function workerLog(event: string, details: Record<string, unknown> = {}) {
  console.log('[BrauzioWorker]', new Date().toISOString(), event, details);
}

function jsonError(message: string): CallToolResult {
  return {
    content: [{ type: 'text', text: message }],
    isError: true,
  };
}

function normalizeDeviceId(value: unknown): string {
  const normalized = String(value || 'default').trim().slice(0, 128);
  return normalized || 'default';
}

async function oauthUserIdForDevice(deviceId: string): Promise<string> {
  const bytes = new TextEncoder().encode(normalizeDeviceId(deviceId));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `device-${hex}`;
}

function deviceIdFromRequest(request: Request, env: Env): string {
  const url = new URL(request.url);
  return normalizeDeviceId(url.searchParams.get('device') || env.DEFAULT_DEVICE_ID || 'default');
}

function deviceIdFromAuth(env: Env): string {
  const auth = getMcpAuthContext();
  const props = (auth?.props || {}) as Partial<BrauzioAuthProps>;
  return normalizeDeviceId(props.deviceId || env.DEFAULT_DEVICE_ID || 'default');
}

function browserStub(env: Env, deviceId: string) {
  const id = env.BROWSER_SESSIONS.idFromName(normalizeDeviceId(deviceId));
  return env.BROWSER_SESSIONS.get(id);
}

async function callBrowserTool(
  env: Env,
  deviceId: string,
  name: string,
  args: Record<string, unknown>,
  callerId: string,
): Promise<CallToolResult> {
  const requestUrl = new URL('https://brauzio-browser.internal/call');
  const response = await browserStub(env, deviceId).fetch(
    new Request(requestUrl.toString(), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, args, callerId }),
    }),
  );
  const raw = await response.text();
  if (!response.ok) {
    return jsonError(raw || `Browser tool failed with HTTP ${response.status}`);
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    // Durable Object relay responses are transport envelopes: { result: CallToolResult }.
    // MCP requires CallToolResult itself at the top level. Returning the envelope causes
    // clients to see an empty outer content array and hides image content under result.result.content.
    if (parsed && typeof parsed === 'object' && 'result' in parsed) {
      const inner = (parsed as { result?: unknown }).result;
      if (inner && typeof inner === 'object' && Array.isArray((inner as CallToolResult).content)) {
        return inner as CallToolResult;
      }
    }
    if (parsed && typeof parsed === 'object' && Array.isArray((parsed as CallToolResult).content)) {
      return parsed as CallToolResult;
    }
    return jsonError('Browser tool returned a malformed MCP tool result');
  } catch {
    return jsonError(raw || 'Browser tool returned an invalid response');
  }
}

function shouldRelayScreenshotThroughObserve(name: string, args: Record<string, unknown>): boolean {
  return name === 'chrome_screenshot'
    && args.returnImage !== false
    && args.storeBase64 !== true
    && args.savePng !== true
    && args.fullPage !== true
    && !args.selector;
}

async function callScreenshotThroughObserve(
  env: Env,
  deviceId: string,
  args: Record<string, unknown>,
  callerId: string,
): Promise<CallToolResult> {
  const observeArgs: Record<string, unknown> = {
    mode: 'compact',
    maxElements: 25,
    includeScreenshot: true,
    screenshotQuality: 60,
  };
  if (typeof args.tabId === 'number') observeArgs.tabId = args.tabId;
  if (typeof args.windowId === 'number') observeArgs.windowId = args.windowId;

  const observed = await callBrowserTool(env, deviceId, 'chrome_observe', observeArgs, callerId);
  if (observed.isError) return observed;

  const image = observed.content.find((item) => item.type === 'image') as
    | Extract<CallToolResult['content'][number], { type: 'image' }>
    | undefined;
  if (!image || typeof image.data !== 'string' || !image.data) {
    return jsonError('Brauzio screenshot relay did not receive image content from chrome_observe');
  }

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          success: true,
          message: `Screenshot [${String(args.name || 'screenshot')}] captured successfully`,
          tabId: typeof args.tabId === 'number' ? args.tabId : undefined,
          returnedImage: true,
          base64: null,
          fileSaved: false,
          delivery: 'observe-jpeg-relay',
        }),
      },
      image,
    ],
    isError: false,
  };
}

async function callerLeaseId(ctx: {
  sessionId?: string;
  http?: { authInfo?: { clientId?: string; token?: string } };
}): Promise<string> {
  const auth = getMcpAuthContext();
  const props = (auth?.props || {}) as Partial<BrauzioAuthProps>;
  const clientId = String(ctx.http?.authInfo?.clientId || 'unknown').slice(0, 256);
  const sessionId = String(ctx.sessionId || '').trim().slice(0, 256);
  const token = String(ctx.http?.authInfo?.token || '');
  const material = sessionId
    ? `session|${clientId}|${sessionId}`
    : token
      ? `token|${clientId}|${token}`
      : `grant|${clientId}|${String(props.authorizedAt || 0)}|${normalizeDeviceId(props.deviceId || 'default')}`;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(material));
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `caller-${hex.slice(0, 32)}`;
}

function createServer(env: Env) {
  const server = new Server(
    { name: 'Brauzio', version: BRAUZIO_RUNTIME_VERSION },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler('tools/list', async () => ({ tools: TOOL_SCHEMAS }));
  server.setRequestHandler('tools/call', async (request, ctx) => {
    const name = request.params.name;
    const args = (request.params.arguments || {}) as Record<string, unknown>;
    const callerId = await callerLeaseId(ctx);
    const deviceId = deviceIdFromAuth(env);
    if (shouldRelayScreenshotThroughObserve(name, args)) {
      return await callScreenshotThroughObserve(env, deviceId, args, callerId);
    }
    return await callBrowserTool(env, deviceId, name, args, callerId);
  });

  return server;
}

const mcpApiHandler = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const requestUrl = new URL(request.url);
    const ctxProps =
      ((ctx as ExecutionContext & { props?: Partial<BrauzioAuthProps> }).props || {});

    workerLog('MCP_REQUEST', {
      method: request.method,
      path: requestUrl.pathname,
      mcpMethod: request.headers.get('Mcp-Method') || request.headers.get('mcp-method') || '',
      mcpName: request.headers.get('Mcp-Name') || request.headers.get('mcp-name') || '',
      hasAuthorizedDevice: Boolean(ctxProps.deviceId),
    });

    return createMcpHandler(() => createServer(env), {
      route: '/mcp',
      legacy: 'stateless',
      onerror(error) {
        workerLog('MCP_HANDLER_ERROR', {
          message: error instanceof Error ? error.message : String(error),
        });
      },
    })(request, env, ctx);
  },
};

async function handleAuthorize(request: Request, env: Env) {
  const oauthRequest = await env.OAUTH_PROVIDER.parseAuthRequest(request);
  const clientName = oauthRequest.clientId || 'ChatGPT';
  const deviceId = deviceIdFromRequest(request, env);

  if (request.method === 'GET') {
    const pairing = await browserStub(env, deviceId).fetch(
      new Request('https://brauzio-browser.internal/pairing/status'),
    );
    const pairingStatus = (await pairing.json().catch(() => ({}))) as {
      active?: boolean;
      expiresAt?: number | null;
    };
    const expiresText = pairingStatus.expiresAt
      ? new Date(pairingStatus.expiresAt).toLocaleTimeString('ar-LY')
      : 'غير متاح';
    const body = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ربط Brauzio</title><style>body{font-family:system-ui;background:#f7f7f8;color:#111;margin:0;padding:32px}.card{max-width:520px;margin:auto;background:#fff;border:1px solid #ddd;border-radius:18px;padding:24px;box-shadow:0 12px 40px #0001}h1{margin-top:0}input,button{box-sizing:border-box;width:100%;padding:13px;border-radius:10px;border:1px solid #bbb;font-size:16px}button{margin-top:12px;background:#111;color:#fff;border:0;cursor:pointer}.muted{color:#666;font-size:14px}.error{color:#b42318}</style></head><body><div class="card"><h1>ربط ChatGPT مع Brauzio</h1><p>أدخل رمز الاقتران الظاهر داخل إضافة Brauzio. الرمز مؤقت ويُستخدم مرة واحدة فقط.</p><p class="muted">الجهاز: ${deviceId} — انتهاء الرمز الحالي: ${expiresText}</p><form method="post"><input name="pairing_code" autocomplete="one-time-code" inputmode="numeric" required placeholder="رمز الاقتران"><button type="submit">تفويض ChatGPT</button></form><p class="muted">العميل: ${clientName}</p></div></body></html>`;
    return new Response(body, {
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
        'content-security-policy': `default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'`,
      },
    });
  }

  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const form = await request.formData();
  const pairingCode = String(form.get('pairing_code') || '').trim();
  const pairing = await browserStub(env, deviceId).fetch(
    new Request('https://brauzio-browser.internal/pairing/consume', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: pairingCode }),
    }),
  );
  const pairingBody = (await pairing.json().catch(() => ({}))) as {
    ok?: boolean;
    reason?: string;
  };
  if (!pairing.ok || pairingBody.ok !== true) {
    workerLog('PAIRING_REJECTED', { deviceId, reason: pairingBody.reason || `http_${pairing.status}` });
    const message = pairingBody.reason || 'رمز الاقتران غير صالح أو منتهي.';
    const body = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>تعذر الربط</title><style>body{font-family:system-ui;background:#f7f7f8;color:#111;margin:0;padding:32px}.card{max-width:520px;margin:auto;background:#fff;border:1px solid #ddd;border-radius:18px;padding:24px}.error{color:#b42318}a{color:#111}</style></head><body><div class="card"><h1 class="error">تعذر تفويض Brauzio</h1><p>${message}</p><p><a href="${new URL(request.url).pathname}${new URL(request.url).search}">العودة والمحاولة مجددًا</a></p></div></body></html>`;
    return new Response(body, {
      status: 200,
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
        'content-security-policy': `default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'`,
      },
    });
  }

  const grantedScopes = oauthRequest.scope.filter((scope) => scope === BRAUZIO_SCOPE);
  const oauthUserId = await oauthUserIdForDevice(deviceId);
  const { redirectTo } = await env.OAUTH_PROVIDER.completeAuthorization({
    request: oauthRequest,
    userId: oauthUserId,
    metadata: { clientName, deviceId },
    scope: grantedScopes,
    props: { deviceId, authorizedAt: Date.now() } satisfies BrauzioAuthProps,
    revokeExistingGrants: false,
  });
  return Response.redirect(redirectTo, 302);
}

const defaultHandler = {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/health') {
      return Response.json({
        ok: true,
        service: 'brauzio-mcp',
        version: BRAUZIO_RUNTIME_VERSION,
        schemaVersion: BRAUZIO_SCHEMA_VERSION,
        toolCount: TOOL_SCHEMAS.length,
      });
    }
    if (url.pathname === '/ws') {
      const deviceId = deviceIdFromRequest(request, env);
      const stub = browserStub(env, deviceId);
      const target = new URL(request.url);
      target.protocol = 'https:';
      target.hostname = 'brauzio-browser.internal';
      target.pathname = '/ws';
      return stub.fetch(new Request(target.toString(), request));
    }

    if (url.pathname === '/authorize') return await handleAuthorize(request, env);
    if (url.pathname === '/browser-pairing') {
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        return Response.json({ error: 'Create pairing codes from the Brauzio extension', code: 'PAIRING_CREATE_EXTENSION_ONLY' }, { status: 405, headers: { allow: 'GET, HEAD' } });
      }
      return await browserStub(env, deviceIdFromRequest(request, env)).fetch(new Request('https://brauzio-browser.internal/pairing/status'));
    }
    if (url.pathname === '/browser-status') {
      return await browserStub(env, deviceIdFromRequest(request, env)).fetch(new Request('https://brauzio-browser.internal/status'));
    }
    return new Response('Not found', { status: 404 });
  },
};

export default new OAuthProvider<Env>({
  apiRoute: '/mcp',
  apiHandler: mcpApiHandler,
  defaultHandler,
  authorizeEndpoint: '/authorize',
  tokenEndpoint: '/oauth/token',
  clientRegistrationEndpoint: '/oauth/register',
  scopesSupported: [BRAUZIO_SCOPE],
  allowPlainPKCE: false,
  clientIdMetadataDocumentEnabled: true,
  resourceMetadata: {
    resource: BRAUZIO_RESOURCE,
    authorization_servers: [BRAUZIO_ORIGIN],
    scopes_supported: [BRAUZIO_SCOPE],
    resource_name: 'Brauzio Chrome Control',
  },
  tokenExchangeCallback: async (options) => {
    workerLog('OAUTH_TOKEN_EXCHANGE', { grantType: options.grantType, clientId: options.clientId, userId: options.userId });
  },
  onError({ code, description, status, internal, request }) {
    workerLog('OAUTH_ERROR', {
      code,
      status,
      description,
      category: internal?.category || '',
      reason: internal?.reason || '',
      path: request ? new URL(request.url).pathname : '',
    });
  },
});
