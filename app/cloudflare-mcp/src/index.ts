import { createMcpHandler, getMcpAuthContext } from 'agents/mcp/server';
import { OAuthProvider, type AuthRequest, type OAuthHelpers } from '@cloudflare/workers-oauth-provider';
import { TOOL_SCHEMAS } from 'brauzio-shared';
import { BrowserSession } from './browser-session-v31';

export { BrowserSession };

const BRAUZIO_RUNTIME_VERSION = '3.1.3';
const BRAUZIO_SCHEMA_VERSION = '3.1.3';
const BRAUZIO_ORIGIN = 'https://brauzio-mcp.aseelsalah266.workers.dev';
const BRAUZIO_RESOURCE = `${BRAUZIO_ORIGIN}/mcp`;
const BRAUZIO_SCOPE = 'brauzio:control';
const BRAUZIO_DIAGNOSTICS_SCHEMA = {
  name: 'chrome_diagnostics',
  description: 'Inspect Brauzio extension, Worker, relay, CDP, permissions, runtime state, reconnect metrics, recent tool errors and optional execution traces in one call.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      includeTraces: { type: 'boolean', description: 'Include recent request-stage traces.' },
      traceLimit: { type: 'number', description: 'Maximum recent traces to return, 1-40.' },
      tabId: { type: 'number', description: 'Target tab ID. Defaults to the active tab.' },
      windowId: { type: 'number', description: 'Target window ID when tabId is omitted.' },
    },
    required: [],
  },
};
const BRAUZIO_TOOL_SCHEMAS = [...TOOL_SCHEMAS, BRAUZIO_DIAGNOSTICS_SCHEMA];
const BRAUZIO_COMPUTER_ACTIONS = [
  'mouse_move',
  'mouse_down',
  'mouse_up',
  'mouse_click',
  'mouse_drag',
  'mouse_wheel',
  'key_down',
  'key_up',
  'key_press',
  'type',
] as const;
const BRAUZIO_SENSITIVE_TOOL_NAMES = new Set([
  'chrome_screenshot',
  'chrome_observe',
  'chrome_live_view',
  'chrome_clipboard',
  'chrome_javascript',
  'chrome_userscript',
  'chrome_cdp',
]);
const BRAUZIO_MUTATING_ACTIONS = new Set([
  'click',
  'double_click',
  'hover',
  'focus',
  'fill',
  'clear',
  'type',
  'press',
  'select',
  'scroll',
  'drag',
  'upload',
  'navigate',
  'back',
  'forward',
  'reload',
]);

type BrauzioAuthProps = {
  deviceId: string;
  authorizedAt: number;
};

interface Env {
  BROWSER_SESSIONS: DurableObjectNamespace<BrowserSession>;
  BROWSER_SHARED_SECRET: string;
  DEFAULT_DEVICE_ID?: string;
  MCP_SHARED_SECRET: string;
  OAUTH_KV: KVNamespace;
  OAUTH_PROVIDER: OAuthHelpers;
}

function normalizeDeviceId(value: unknown) {
  return String(value || 'default').trim().slice(0, 128) || 'default';
}

async function oauthUserIdForDevice(deviceId: string): Promise<string> {
  const raw = new TextEncoder().encode(`brauzio:${normalizeDeviceId(deviceId)}`);
  const digest = await crypto.subtle.digest('SHA-256', raw);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function deviceIdFromRequest(request: Request, env: Env) {
  const url = new URL(request.url);
  return normalizeDeviceId(url.searchParams.get('device') || env.DEFAULT_DEVICE_ID || 'default');
}

function browserStub(env: Env, deviceId: string) {
  const id = env.BROWSER_SESSIONS.idFromName(normalizeDeviceId(deviceId));
  return env.BROWSER_SESSIONS.get(id);
}

function workerLog(event: string, details: Record<string, unknown> = {}) {
  console.log(`[BrauzioWorker] ${new Date().toISOString()} ${event} ${JSON.stringify(details)}`);
}

function textResult(text: string) {
  return { content: [{ type: 'text' as const, text }] };
}

async function callBrowserTool(
  env: Env,
  deviceId: string,
  name: string,
  args: Record<string, unknown>,
  callerId: string,
) {
  const requestUrl = new URL('https://brauzio-browser.internal/call');
  const traceId = crypto.randomUUID();
  const relayArgs = { ...args, __brauzioRequestId: traceId };
  const response = await browserStub(env, deviceId).fetch(
    new Request(requestUrl.toString(), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, args: relayArgs, callerId, traceId }),
    }),
  );
  const raw = await response.text();
  if (!response.ok) {
    throw new Error(`Brauzio browser tool failed (${response.status}): ${raw.slice(0, 800)}`);
  }
  const parsed = JSON.parse(raw) as { result?: unknown; error?: string };
  if (parsed.error) throw new Error(parsed.error);
  return parsed.result;
}

function requiresBrowserTool(name: string) {
  return name.startsWith('chrome_') || name === 'get_windows_and_tabs' || name === 'chrome_computer';
}

function isSensitiveToolCall(name: string, args: Record<string, unknown>) {
  if (BRAUZIO_SENSITIVE_TOOL_NAMES.has(name)) return true;
  if (name === 'chrome_act') {
    return BRAUZIO_MUTATING_ACTIONS.has(String(args.action || ''));
  }
  if (name === 'chrome_computer') {
    return BRAUZIO_COMPUTER_ACTIONS.includes(String(args.action || '') as (typeof BRAUZIO_COMPUTER_ACTIONS)[number]);
  }
  if (name === 'chrome_navigate' || name === 'chrome_tabs') return true;
  return false;
}

function callerIdFromContext(ctx: unknown) {
  const value = (ctx as { sessionId?: unknown } | undefined)?.sessionId;
  return typeof value === 'string' && value ? value : 'mcp';
}

function deviceIdFromAuth(env: Env) {
  const auth = getMcpAuthContext();
  const props = auth?.props as BrauzioAuthProps | undefined;
  return normalizeDeviceId(props?.deviceId || env.DEFAULT_DEVICE_ID || 'default');
}

async function requirePairedSession(env: Env, deviceId: string) {
  const response = await browserStub(env, deviceId).fetch(
    new Request('https://brauzio-browser.internal/pairing/status'),
  );
  const status = (await response.json().catch(() => ({}))) as {
    paired?: boolean;
    active?: boolean;
    expiresAt?: number | null;
  };
  if (!response.ok || status.paired !== true) {
    const message = status.active
      ? 'Brauzio pairing is pending. Complete pairing from the authorization page first.'
      : 'Brauzio is not paired with this ChatGPT session. Create a new pairing code from the extension and reconnect.';
    throw new Error(message);
  }
}

const mcpApiHandler = createMcpHandler(
  (server) => {
    server.setRequestHandler('tools/list', async () => ({ tools: BRAUZIO_TOOL_SCHEMAS }));
    server.setRequestHandler('tools/call', async (request, ctx) => {
      const name = request.params.name;
      const args = (request.params.arguments || {}) as Record<string, unknown>;
      const deviceId = deviceIdFromAuth(server.env as Env);
      const callerId = callerIdFromContext(ctx);

      if (!requiresBrowserTool(name)) {
        return textResult(`Unsupported Brauzio tool: ${name}`);
      }

      if (isSensitiveToolCall(name, args)) {
        await requirePairedSession(server.env as Env, deviceId);
      }

      return await callBrowserTool(server.env as Env, deviceId, name, args, callerId);
    });
  },
  { capabilities: { tools: {} } },
);

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
  const pairingResult = (await pairing.json().catch(() => ({}))) as {
    ok?: boolean;
    error?: string;
    code?: string;
  };
  if (!pairing.ok || pairingResult.ok !== true) {
    const body = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>فشل الربط</title></head><body style="font-family:system-ui;padding:32px"><h1>تعذر ربط Brauzio</h1><p>${pairingResult.error || 'رمز الاقتران غير صحيح أو انتهت صلاحيته.'}</p><p><a href="${new URL('/authorize', BRAUZIO_ORIGIN)}">حاول مرة أخرى</a></p></body></html>`;
    return new Response(body, { status: 401, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
  }

  const grantedScopes = oauthRequest.scope.filter((scope) => scope === BRAUZIO_SCOPE);
  const oauthUserId = await oauthUserIdForDevice(deviceId);
  const complete = await env.OAUTH_PROVIDER.completeAuthorization({
    request: oauthRequest,
    userId: oauthUserId,
    metadata: { clientName, deviceId },
    scope: grantedScopes,
    props: { deviceId, authorizedAt: Date.now() } satisfies BrauzioAuthProps,
    revokeExistingGrants: false,
  });

  workerLog('OAUTH_APPROVED', { deviceId, clientName });
  return Response.redirect(complete.redirectTo, 302);
}

const oauthProvider = new OAuthProvider<Env>({
  apiRoute: '/mcp',
  apiHandler: mcpApiHandler,
  defaultHandler: {
    async fetch(request: Request, env: Env): Promise<Response> {
      const url = new URL(request.url);

      if (url.pathname === '/health') {
        return Response.json({
          ok: true,
          service: 'Brauzio',
          version: BRAUZIO_RUNTIME_VERSION,
          schemaVersion: BRAUZIO_SCHEMA_VERSION,
          toolCount: BRAUZIO_TOOL_SCHEMAS.length,
          auth: 'oauth2',
          runtime: 'cloudflare-workers',
          transport: 'streamable-http+mcp+websocket-relay',
          persistence: {
            watches: true,
            events: true,
          },
          javascript: {
            pageExecution: true,
            protocol: 'brauzio-js-runtime-v3',
          },
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

      if (url.pathname === '/authorize') {
        return handleAuthorize(request, env);
      }

      if (url.pathname === '/browser-pairing') {
        if (request.method !== 'GET' && request.method !== 'HEAD') {
          return Response.json(
            { error: 'Create pairing codes from the Brauzio extension', code: 'PAIRING_CREATE_EXTENSION_ONLY' },
            { status: 405, headers: { allow: 'GET, HEAD' } },
          );
        }
        return browserStub(env, deviceIdFromRequest(request, env)).fetch(
          new Request('https://brauzio-browser.internal/pairing/status'),
        );
      }

      if (url.pathname === '/browser-status') {
        return browserStub(env, deviceIdFromRequest(request, env)).fetch(
          new Request('https://brauzio-browser.internal/status'),
        );
      }

      if (url.pathname === '/robots.txt') {
        return new Response('User-agent: *\nDisallow: /\n', {
          headers: { 'content-type': 'text/plain; charset=utf-8' },
        });
      }

      return new Response('Brauzio MCP', {
        status: 404,
        headers: { 'content-type': 'text/plain; charset=utf-8' },
      });
    },
  },
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
  accessTokenTTL: 60 * 60,
  refreshTokenTTL: 60 * 60 * 24 * 30,
  tokenExchangeCallback: async (options) => {
    workerLog('OAUTH_TOKEN_EXCHANGE', {
      grantType: options.grantType,
      clientId: options.clientId,
      userId: options.userId,
    });
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

export default oauthProvider;
