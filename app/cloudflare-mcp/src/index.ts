import { Server, type CallToolResult } from '@modelcontextprotocol/server';
import { createMcpHandler, getMcpAuthContext } from 'agents/mcp/server';
import { OAuthProvider, type AuthRequest, type OAuthHelpers } from '@cloudflare/workers-oauth-provider';
import { TOOL_SCHEMAS } from 'brauzio-shared';
import { BrowserSession } from './browser-session';

export { BrowserSession };

const BRAUZIO_RUNTIME_VERSION = '2.1.0';
const BRAUZIO_SCHEMA_VERSION = 'v2.1-2026-09-06';
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
): Promise<CallToolResult> {
  const traceId = crypto.randomUUID();
  const startedAt = Date.now();
  workerLog('TOOL_CALL_START', { traceId, deviceId, name });
  const stub = browserStub(env, deviceId);
  const response = await stub.fetch(
    new Request('https://brauzio-browser.internal/call', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, args, timeoutMs: 120_000, traceId }),
    }),
  );

  const payload = (await response.json().catch(() => ({}))) as {
    result?: CallToolResult;
    error?: string;
  };

  if (!response.ok) {
    workerLog('TOOL_CALL_FAILED', {
      traceId,
      deviceId,
      name,
      status: response.status,
      durationMs: Date.now() - startedAt,
      error: payload.error || '',
    });
    return jsonError(payload.error || `Brauzio relay failed with HTTP ${response.status} (traceId: ${traceId})`);
  }
  if (!payload.result) {
    workerLog('TOOL_CALL_EMPTY', { traceId, deviceId, name, durationMs: Date.now() - startedAt });
    return jsonError(`Brauzio extension returned an empty tool result (traceId: ${traceId})`);
  }
  workerLog('TOOL_CALL_OK', { traceId, deviceId, name, durationMs: Date.now() - startedAt });
  return payload.result;
}

function createServer(env: Env) {
  const server = new Server(
    { name: 'Brauzio', version: BRAUZIO_RUNTIME_VERSION },
    {
      capabilities: { tools: {} },
      instructions:
        'Brauzio controls the Chrome browser connected to this Cloudflare relay. Use browser tools only when needed and respect the user’s active browser session.',
    },
  );

  server.setRequestHandler('tools/list', async () => ({
    tools: TOOL_SCHEMAS as any,
  }));

  server.setRequestHandler('tools/call', async (request) => {
    try {
      return await callBrowserTool(
        env,
        deviceIdFromAuth(env),
        request.params.name,
        (request.params.arguments || {}) as Record<string, unknown>,
      );
    } catch (error) {
      return jsonError(error instanceof Error ? error.message : String(error));
    }
  });

  return server;
}

function browserStatusAuthorized(request: Request, env: Env): boolean {
  const expected = String(env.BROWSER_SHARED_SECRET || '');
  if (expected.length < 16) return false;
  const authorization = request.headers.get('Authorization') || '';
  return authorization.startsWith('Bearer ') && authorization.slice(7) === expected;
}

function htmlEscape(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function authorizationPage(options: {
  requestUrl: string;
  clientName: string;
  defaultDeviceId: string;
  error?: string;
}): Response {
  const { requestUrl, clientName, defaultDeviceId, error } = options;
  const action = new URL(requestUrl);
  const body = `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>ربط ChatGPT بـ Brauzio</title>
<style>
:root{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Tahoma,Arial,sans-serif;color:#171923;background:#f5f6fa}*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:radial-gradient(circle at 100% 0%,rgba(91,91,214,.12),transparent 34%),#f5f6fa}.card{width:min(460px,100%);background:#fff;border:1px solid #e6e8ef;border-radius:22px;box-shadow:0 22px 70px rgba(31,38,58,.12);padding:26px}.brand{display:flex;align-items:center;gap:10px;margin-bottom:20px}.mark{width:38px;height:38px;display:grid;place-items:center;border-radius:12px;background:#5b5bd6;color:#fff;font-weight:900}.brand strong{font-size:20px}.eyebrow{font-size:11px;color:#8a91a1;font-weight:800;letter-spacing:.06em}.title{margin:4px 0 8px;font-size:24px}.lead{margin:0 0 20px;color:#666e80;line-height:1.7;font-size:14px}.client{padding:12px 14px;background:#f8f9fc;border:1px solid #eceef4;border-radius:12px;margin-bottom:16px}.client span{display:block;color:#8a91a1;font-size:10px;margin-bottom:3px}.client strong{font-size:13px;direction:ltr;display:block;overflow-wrap:anywhere}.field{display:block;margin-top:13px}.field span{display:block;font-size:12px;font-weight:700;margin-bottom:6px}.field input{width:100%;height:44px;border:1px solid #dfe2ea;border-radius:11px;padding:0 12px;outline:none;font:inherit}.field input:focus{border-color:#9292e7;box-shadow:0 0 0 3px #efefff}.code{direction:ltr;text-align:center;letter-spacing:.12em;font-size:18px!important;font-weight:800}.hint{margin:12px 0;color:#737b8d;font-size:12px;line-height:1.7}.error{margin:12px 0;padding:10px 12px;border-radius:10px;background:#fdecef;color:#a93e4b;font-size:12px}.button{width:100%;height:44px;border:0;border-radius:11px;background:#5b5bd6;color:#fff;font-weight:800;font-size:13px;margin-top:16px;cursor:pointer}.security{margin:14px 0 0;color:#9299a8;font-size:10.5px;line-height:1.6;text-align:center}
</style>
</head>
<body>
<main class="card">
  <div class="brand"><div class="mark">B</div><div><div class="eyebrow">BRAUZIO CLOUD</div><strong>Brauzio</strong></div></div>
  <div class="eyebrow">تفويض MCP</div>
  <h1 class="title">ربط ChatGPT بمتصفحك</h1>
  <p class="lead">افتح إضافة Brauzio، وأنشئ رمز ربط مؤقت، ثم أدخله هنا. الرمز يستخدم مرة واحدة وينتهي تلقائيًا.</p>
  <div class="client"><span>التطبيق الذي يطلب الوصول</span><strong>${htmlEscape(clientName)}</strong></div>
  ${error ? `<div class="error">${htmlEscape(error)}</div>` : ''}
  <form method="post" action="${htmlEscape(action.pathname + action.search)}">
    <label class="field"><span>معرف الجهاز</span><input name="device" value="${htmlEscape(defaultDeviceId)}" maxlength="128" autocomplete="off" /></label>
    <label class="field"><span>رمز الربط المؤقت</span><input class="code" name="pairing_code" inputmode="text" maxlength="12" placeholder="ABCD-EFGH" autocomplete="one-time-code" required autofocus /></label>
    <p class="hint">لن تُرسل كلمة سر الجهاز إلى ChatGPT، ولن توضع أي كلمة سر داخل رابط MCP.</p>
    <button class="button" type="submit">سماح وربط ChatGPT</button>
  </form>
  <p class="security">الاتصال بعد التفويض يستخدم OAuth 2.1 وPKCE. يبقى رمز الجهاز بين الإضافة وBrauzio Cloud فقط.</p>
</main>
</body>
</html>`;

  return new Response(body, {
    status: error ? 401 : 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
      'referrer-policy': 'no-referrer',
      'x-content-type-options': 'nosniff',
    },
  });
}

async function consumePairingCode(env: Env, deviceId: string, code: string): Promise<boolean> {
  const response = await browserStub(env, deviceId).fetch(
    new Request('https://brauzio-browser.internal/pairing/consume', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code }),
    }),
  );
  return response.ok;
}

async function handleAuthorize(request: Request, env: Env): Promise<Response> {
  let oauthRequest: AuthRequest;
  try {
    oauthRequest = await env.OAUTH_PROVIDER.parseAuthRequest(request);
  } catch (error) {
    workerLog('OAUTH_PARSE_FAILED', { error: error instanceof Error ? error.message : String(error) });
    return new Response('Invalid OAuth authorization request', { status: 400 });
  }

  const client = await env.OAUTH_PROVIDER.lookupClient(oauthRequest.clientId).catch(() => null);
  if (!client) return new Response('Unknown OAuth client', { status: 400 });

  const clientName = client.clientName || oauthRequest.clientId;
  const defaultDeviceId = normalizeDeviceId(env.DEFAULT_DEVICE_ID || 'default');

  if (request.method === 'GET') {
    return authorizationPage({ requestUrl: request.url, clientName, defaultDeviceId });
  }

  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const form = await request.formData();
  const deviceId = normalizeDeviceId(form.get('device') || defaultDeviceId);
  const pairingCode = String(form.get('pairing_code') || '').trim();

  if (!pairingCode || !(await consumePairingCode(env, deviceId, pairingCode))) {
    workerLog('OAUTH_PAIRING_REJECTED', { deviceId, clientId: oauthRequest.clientId });
    return authorizationPage({
      requestUrl: request.url,
      clientName,
      defaultDeviceId: deviceId,
      error: 'رمز الربط غير صحيح أو انتهت صلاحيته. أنشئ رمزًا جديدًا من إضافة Brauzio.',
    });
  }

  const grantedScopes = oauthRequest.scope.filter((scope) => scope === BRAUZIO_SCOPE);
  const { redirectTo } = await env.OAUTH_PROVIDER.completeAuthorization({
    request: oauthRequest,
    userId: `device:${deviceId}`,
    metadata: { clientName, deviceId },
    scope: grantedScopes,
    props: { deviceId, authorizedAt: Date.now() } satisfies BrauzioAuthProps,
    revokeExistingGrants: false,
  });

  workerLog('OAUTH_AUTHORIZED', { deviceId, clientId: oauthRequest.clientId });
  return Response.redirect(redirectTo, 302);
}

const mcpApiHandler: ExportedHandler<Env> = {
  async fetch(request, env, ctx) {
    return createMcpHandler(() => createServer(env), {
      route: '/mcp',
      legacy: 'stateless',
    })(request, env, ctx);
  },
};

const defaultHandler: ExportedHandler<Env> = {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/health') {
      return Response.json({
        service: 'Brauzio MCP',
        ok: true,
        version: BRAUZIO_RUNTIME_VERSION,
        schemaVersion: BRAUZIO_SCHEMA_VERSION,
        auth: 'oauth2.1-pairing',
        toolCount: TOOL_SCHEMAS.length,
        computerActions: BRAUZIO_COMPUTER_ACTIONS,
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

    if (url.pathname === '/browser-status') {
      if (!browserStatusAuthorized(request, env)) return new Response('Unauthorized', { status: 401 });
      const deviceId = deviceIdFromRequest(request, env);
      return browserStub(env, deviceId).fetch('https://brauzio-browser.internal/status');
    }

    if (url.pathname === '/authorize') return handleAuthorize(request, env);

    return new Response('Brauzio Cloud MCP', {
      status: 200,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
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
    scopes_supported: [BRAUZIO_SCOPE],
    resource_name: 'Brauzio Chrome Control',
  },
});
