import { Server, type CallToolResult } from '@modelcontextprotocol/server';
import { createMcpHandler, getMcpAuthContext } from 'agents/mcp/server';
import { OAuthProvider, type AuthRequest, type OAuthHelpers } from '@cloudflare/workers-oauth-provider';
import { TOOL_SCHEMAS } from 'brauzio-shared';
import { BrowserSession } from './browser-session-v31';

export { BrowserSession };

const BRAUZIO_RUNTIME_VERSION = '3.1.0';
const BRAUZIO_SCHEMA_VERSION = '3.1.0';
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
    return jsonError(raw || `Browser tool failed with HTTP ${response.status}`);
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
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

async function callerLeaseId(ctx: {
  sessionId?: string;
  http?: { authInfo?: { clientId?: string; token?: string } };
}): Promise<string> {
  const auth = getMcpAuthContext();
  const props = (auth?.props || {}) as Partial<BrauzioAuthProps>;
  const clientId = String(ctx.http?.authInfo?.clientId || 'unknown').slice(0, 256);
  const sessionId = String(ctx.sessionId || '').trim().slice(0, 256);
  const deviceId = normalizeDeviceId(props.deviceId || 'default');
  const raw = `${deviceId}|${clientId}|${sessionId || 'no-session'}`;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('').slice(0, 48);
}

function createServer(env: Env) {
  const server = new Server(
    { name: 'Brauzio', version: BRAUZIO_RUNTIME_VERSION },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler({ method: 'tools/list' }, async () => ({ tools: BRAUZIO_TOOL_SCHEMAS }));
  server.setRequestHandler({ method: 'tools/call' }, async (request, ctx) => {
    const name = request.params.name;
    const args = (request.params.arguments || {}) as Record<string, unknown>;
    const callerId = await callerLeaseId(ctx);
    return await callBrowserTool(env, deviceIdFromAuth(env), name, args, callerId);
  });

  return server;
}

function oauthError(message: string, status = 400): Response {
  return new Response(message, { status, headers: { 'content-type': 'text/plain; charset=utf-8' } });
}

function html(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
    },
  });
}

function authorizePage(authRequest: AuthRequest, deviceId: string): Response {
  const requestJson = JSON.stringify(authRequest);
  const escaped = requestJson.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  const device = deviceId.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  return html(`<!doctype html>
<html lang="ar" dir="rtl">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Brauzio Authorization</title></head>
<body style="font-family:system-ui,sans-serif;max-width:680px;margin:48px auto;padding:0 20px;line-height:1.7">
<h1>Brauzio</h1><p>يطلب ChatGPT صلاحية التحكم بجهاز <b>${device}</b>.</p>
<form method="post" action="/authorize">
<input type="hidden" name="request" value='${escaped}'>
<input type="hidden" name="device" value="${device}">
<button type="submit" name="decision" value="approve" style="padding:12px 18px">السماح</button>
<button type="submit" name="decision" value="deny" style="padding:12px 18px">رفض</button>
</form></body></html>`);
}

const oauthProvider = new OAuthProvider<Env>({
  apiRoute: '/mcp',
  apiHandler: {
    async fetch(request, env) {
      const handler = createMcpHandler(createServer(env), { route: '/mcp' });
      return await handler(request, env);
    },
  },
  defaultHandler: {
    async fetch(request, env) {
      const url = new URL(request.url);
      if (url.pathname === '/health') {
        return Response.json({ ok: true, version: BRAUZIO_RUNTIME_VERSION, schemaVersion: BRAUZIO_SCHEMA_VERSION, toolCount: BRAUZIO_TOOL_SCHEMAS.length });
      }
      if (url.pathname === '/ws') {
        return await browserStub(env, deviceIdFromRequest(request, env)).fetch(request);
      }
      if (url.pathname === '/authorize' && request.method === 'GET') {
        const authRequest = await env.OAUTH_PROVIDER.parseAuthRequest(request);
        if (!authRequest) return oauthError('Invalid OAuth authorization request');
        const deviceId = deviceIdFromRequest(request, env);
        return authorizePage(authRequest, deviceId);
      }
      if (url.pathname === '/authorize' && request.method === 'POST') {
        const form = await request.formData();
        const decision = String(form.get('decision') || 'deny');
        if (decision !== 'approve') return oauthError('Authorization denied', 403);
        const encoded = String(form.get('request') || '');
        const deviceId = normalizeDeviceId(form.get('device') || env.DEFAULT_DEVICE_ID || 'default');
        let authRequest: AuthRequest;
        try { authRequest = JSON.parse(encoded) as AuthRequest; } catch { return oauthError('Invalid authorization payload'); }
        const { redirectTo } = await env.OAUTH_PROVIDER.completeAuthorization({
          request: authRequest,
          userId: await oauthUserIdForDevice(deviceId),
          metadata: { label: 'Brauzio Chrome device', deviceId },
          scope: [BRAUZIO_SCOPE],
          props: { deviceId, authorizedAt: Date.now() },
        });
        return Response.redirect(redirectTo, 302);
      }
      return new Response('Brauzio', { status: 200 });
    },
  },
  authorizeEndpoint: '/authorize',
  tokenEndpoint: '/token',
  clientRegistrationEndpoint: '/register',
});

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    workerLog('REQUEST', { method: request.method, path: new URL(request.url).pathname });
    return await oauthProvider.fetch(request, env, ctx);
  },
};
