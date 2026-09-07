import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { HttpMcpAgent } from 'agents/mcp';
import { z } from 'zod';
import { TOOL_SCHEMAS } from 'brauzio-shared';
import { BrowserSession } from './browser-session';

export { BrowserSession };

const BRAUZIO_RUNTIME_VERSION = '3.0.2';
const BRAUZIO_SCHEMA_VERSION = 'v3.0.2-2026-09-07';
const BRAUZIO_ORIGIN = 'https://brauzio-mcp.aseelsalah266.workers.dev';
const BRAUZIO_RESOURCE = `${BRAUZIO_ORIGIN}/mcp`;
const BRAUZIO_SCOPE = 'brauzio:control';
const TOOL_TIMEOUT_MS = 120_000;

interface Env {
  BROWSER_SESSION: DurableObjectNamespace;
  BROWSER_SHARED_SECRET: string;
  OAUTH_KV: KVNamespace;
}

interface Props {
  userId: string;
  scope: string;
}

interface AccessTokenRecord {
  userId: string;
  scope: string;
  clientId: string;
  expiresAt: number;
}

interface AuthCodeRecord {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  scope: string;
  userId: string;
  expiresAt: number;
}

interface PairingRecord {
  userId: string;
  expiresAt: number;
}

interface ClientRecord {
  clientId: string;
  redirectUris: string[];
  clientName?: string;
  tokenEndpointAuthMethod?: string;
  grantTypes?: string[];
  responseTypes?: string[];
}

function b64url(bytes: ArrayBuffer | Uint8Array): string {
  const array = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let raw = '';
  for (const byte of array) raw += String.fromCharCode(byte);
  return btoa(raw).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function sha256(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return b64url(digest);
}

function randomToken(bytes = 32): string {
  const array = new Uint8Array(bytes);
  crypto.getRandomValues(array);
  return b64url(array);
}

function json(data: unknown, status = 200, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...headers },
  });
}

function html(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

function formEscape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function jsonError(message: string): any {
  return {
    content: [{ type: 'text', text: JSON.stringify({ success: false, error: message }) }],
    isError: true,
  };
}

async function callBrowserTool(
  env: Env,
  userId: string,
  toolName: string,
  args: Record<string, unknown>,
): Promise<any> {
  const id = env.BROWSER_SESSION.idFromName(userId);
  const stub = env.BROWSER_SESSION.get(id);
  const response = await stub.fetch('https://browser-session/tool', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ toolName, args, timeoutMs: TOOL_TIMEOUT_MS }),
  });
  const raw = await response.text();
  if (!response.ok) {
    return jsonError(raw || `Browser tool failed with HTTP ${response.status}`);
  }
  try {
    const parsed = JSON.parse(raw) as any;
    const candidate = parsed?.result && typeof parsed.result === 'object'
      ? parsed.result
      : parsed;
    if (candidate && Array.isArray(candidate.content)) {
      return candidate;
    }
    if (parsed?.error) return jsonError(String(parsed.error));
    return jsonError('Browser tool returned an invalid MCP result');
  } catch {
    return jsonError(raw || 'Browser tool returned an invalid response');
  }
}

function convertSchema(input: any): any {
  if (!input || typeof input !== 'object') return z.any();
  if (Array.isArray(input.enum) && input.enum.every((value: unknown) => typeof value === 'string')) {
    return z.enum(input.enum as [string, ...string[]]);
  }
  switch (input.type) {
    case 'string': return z.string();
    case 'number': return z.number();
    case 'integer': return z.number().int();
    case 'boolean': return z.boolean();
    case 'array': return z.array(convertSchema(input.items));
    case 'object': {
      const shape: Record<string, any> = {};
      const required = new Set<string>(Array.isArray(input.required) ? input.required : []);
      for (const [key, value] of Object.entries(input.properties || {})) {
        const schema = convertSchema(value);
        shape[key] = required.has(key) ? schema : schema.optional();
      }
      return z.object(shape).passthrough();
    }
    default: return z.any();
  }
}

export class BrauzioMcp extends HttpMcpAgent<Env, Props> {
  server = new McpServer(
    { name: 'Brauzio', version: BRAUZIO_RUNTIME_VERSION },
    { capabilities: { tools: {} } },
  );

  async init(): Promise<void> {
    for (const tool of TOOL_SCHEMAS) {
      const rawShape = tool.inputSchema?.properties || {};
      const required = new Set<string>(tool.inputSchema?.required || []);
      const shape: Record<string, any> = {};
      for (const [key, value] of Object.entries(rawShape)) {
        const schema = convertSchema(value);
        shape[key] = required.has(key) ? schema : schema.optional();
      }
      this.server.tool(tool.name, tool.description, shape, async (args: Record<string, unknown>) => {
        return callBrowserTool(this.env, this.props.userId, tool.name, args);
      });
    }
  }
}

async function readForm(request: Request): Promise<URLSearchParams> {
  const text = await request.text();
  return new URLSearchParams(text);
}

async function oauthMetadata(): Promise<Response> {
  return json({
    issuer: BRAUZIO_ORIGIN,
    authorization_endpoint: `${BRAUZIO_ORIGIN}/authorize`,
    token_endpoint: `${BRAUZIO_ORIGIN}/token`,
    registration_endpoint: `${BRAUZIO_ORIGIN}/register`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'],
    scopes_supported: [BRAUZIO_SCOPE],
  });
}

async function protectedResourceMetadata(): Promise<Response> {
  return json({
    resource: BRAUZIO_RESOURCE,
    authorization_servers: [BRAUZIO_ORIGIN],
    bearer_methods_supported: ['header'],
    scopes_supported: [BRAUZIO_SCOPE],
  });
}

async function registerClient(request: Request, env: Env): Promise<Response> {
  const body = await request.json<any>().catch(() => ({}));
  const redirectUris = Array.isArray(body.redirect_uris)
    ? body.redirect_uris.filter((url: unknown): url is string => typeof url === 'string')
    : [];
  if (redirectUris.length === 0) return json({ error: 'invalid_redirect_uris' }, 400);
  const clientId = randomToken(24);
  const client: ClientRecord = {
    clientId,
    redirectUris,
    clientName: typeof body.client_name === 'string' ? body.client_name : undefined,
    tokenEndpointAuthMethod: typeof body.token_endpoint_auth_method === 'string'
      ? body.token_endpoint_auth_method
      : 'none',
    grantTypes: Array.isArray(body.grant_types) ? body.grant_types : ['authorization_code'],
    responseTypes: Array.isArray(body.response_types) ? body.response_types : ['code'],
  };
  await env.OAUTH_KV.put(`client:${clientId}`, JSON.stringify(client));
  return json({
    client_id: clientId,
    redirect_uris: redirectUris,
    client_name: client.clientName,
    token_endpoint_auth_method: client.tokenEndpointAuthMethod,
    grant_types: client.grantTypes,
    response_types: client.responseTypes,
  }, 201);
}

async function authorize(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const source = request.method === 'POST' ? await readForm(request) : url.searchParams;
  const responseType = source.get('response_type') || '';
  const clientId = source.get('client_id') || '';
  const redirectUri = source.get('redirect_uri') || '';
  const state = source.get('state') || '';
  const codeChallenge = source.get('code_challenge') || '';
  const codeChallengeMethod = source.get('code_challenge_method') || '';
  const scope = source.get('scope') || BRAUZIO_SCOPE;
  const pairingCode = source.get('pairing_code') || '';

  if (responseType !== 'code' || !clientId || !redirectUri || !codeChallenge) {
    return json({ error: 'invalid_request' }, 400);
  }
  if (codeChallengeMethod !== 'S256') return json({ error: 'invalid_request', error_description: 'S256 required' }, 400);

  const clientRaw = await env.OAUTH_KV.get(`client:${clientId}`);
  if (!clientRaw) return json({ error: 'invalid_client' }, 400);
  const client = JSON.parse(clientRaw) as ClientRecord;
  if (!client.redirectUris.includes(redirectUri)) return json({ error: 'invalid_redirect_uri' }, 400);

  if (request.method === 'GET') {
    const hidden = [
      ['response_type', responseType], ['client_id', clientId], ['redirect_uri', redirectUri],
      ['state', state], ['code_challenge', codeChallenge], ['code_challenge_method', codeChallengeMethod],
      ['scope', scope],
    ].map(([name, value]) => `<input type="hidden" name="${name}" value="${formEscape(value)}">`).join('');
    return html(`<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Brauzio</title><style>body{font-family:system-ui;background:#f6f7fb;margin:0;display:grid;place-items:center;min-height:100vh;color:#171923}.card{width:min(420px,calc(100% - 32px));background:white;border:1px solid #e6e8ef;border-radius:18px;padding:24px;box-shadow:0 16px 50px #19203812}h1{margin:0 0 8px}p{color:#656d7d;line-height:1.8}input{width:100%;box-sizing:border-box;padding:13px;border:1px solid #d9dde6;border-radius:10px;font-size:18px;letter-spacing:.08em;text-align:center}button{width:100%;margin-top:12px;padding:12px;border:0;border-radius:10px;background:#5b5bd6;color:#fff;font-weight:800}</style><div class="card"><h1>Brauzio</h1><p>أدخل رمز الربط المؤقت الظاهر في إضافة Brauzio على جهازك. لا تشارك كلمة سر الجهاز.</p><form method="post">${hidden}<input name="pairing_code" autocomplete="one-time-code" required autofocus placeholder="XXXX-XXXX"><button>تفويض ChatGPT</button></form></div></html>`);
  }

  if (!pairingCode) return json({ error: 'access_denied', error_description: 'Pairing code required' }, 401);
  const normalized = pairingCode.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  const pairRaw = await env.OAUTH_KV.get(`pair:${normalized}`);
  if (!pairRaw) return json({ error: 'access_denied', error_description: 'Invalid or expired pairing code' }, 401);
  const pair = JSON.parse(pairRaw) as PairingRecord;
  if (pair.expiresAt < Date.now()) return json({ error: 'access_denied', error_description: 'Pairing code expired' }, 401);
  await env.OAUTH_KV.delete(`pair:${normalized}`);

  const code = randomToken(32);
  const record: AuthCodeRecord = {
    clientId,
    redirectUri,
    codeChallenge,
    codeChallengeMethod,
    scope,
    userId: pair.userId,
    expiresAt: Date.now() + 5 * 60_000,
  };
  await env.OAUTH_KV.put(`authcode:${code}`, JSON.stringify(record), { expirationTtl: 300 });
  const out = new URL(redirectUri);
  out.searchParams.set('code', code);
  if (state) out.searchParams.set('state', state);
  return Response.redirect(out.toString(), 302);
}

async function exchangeToken(request: Request, env: Env): Promise<Response> {
  const form = await readForm(request);
  if (form.get('grant_type') !== 'authorization_code') return json({ error: 'unsupported_grant_type' }, 400);
  const code = form.get('code') || '';
  const clientId = form.get('client_id') || '';
  const redirectUri = form.get('redirect_uri') || '';
  const verifier = form.get('code_verifier') || '';
  const raw = await env.OAUTH_KV.get(`authcode:${code}`);
  if (!raw) return json({ error: 'invalid_grant' }, 400);
  await env.OAUTH_KV.delete(`authcode:${code}`);
  const record = JSON.parse(raw) as AuthCodeRecord;
  if (record.expiresAt < Date.now() || record.clientId !== clientId || record.redirectUri !== redirectUri) {
    return json({ error: 'invalid_grant' }, 400);
  }
  const computed = await sha256(verifier);
  if (computed !== record.codeChallenge) return json({ error: 'invalid_grant' }, 400);
  const token = randomToken(32);
  const tokenRecord: AccessTokenRecord = {
    userId: record.userId,
    scope: record.scope,
    clientId,
    expiresAt: Date.now() + 24 * 60 * 60_000,
  };
  await env.OAUTH_KV.put(`token:${token}`, JSON.stringify(tokenRecord), { expirationTtl: 86400 });
  return json({ access_token: token, token_type: 'Bearer', expires_in: 86400, scope: record.scope });
}

async function authenticate(request: Request, env: Env): Promise<Props | null> {
  const header = request.headers.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) return null;
  const raw = await env.OAUTH_KV.get(`token:${token}`);
  if (!raw) return null;
  const record = JSON.parse(raw) as AccessTokenRecord;
  if (record.expiresAt < Date.now()) return null;
  return { userId: record.userId, scope: record.scope };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/health') {
      return json({
        ok: true,
        service: 'brauzio-mcp',
        version: BRAUZIO_RUNTIME_VERSION,
        schemaVersion: BRAUZIO_SCHEMA_VERSION,
        toolCount: TOOL_SCHEMAS.length,
      });
    }
    if (url.pathname === '/.well-known/oauth-authorization-server') return oauthMetadata();
    if (url.pathname === '/.well-known/oauth-protected-resource') return protectedResourceMetadata();
    if (url.pathname === '/register' && request.method === 'POST') return registerClient(request, env);
    if (url.pathname === '/authorize') return authorize(request, env);
    if (url.pathname === '/token' && request.method === 'POST') return exchangeToken(request, env);

    if (url.pathname === '/pairing' && request.method === 'POST') {
      const shared = request.headers.get('x-brauzio-browser-secret') || '';
      if (!env.BROWSER_SHARED_SECRET || shared !== env.BROWSER_SHARED_SECRET) return json({ error: 'unauthorized' }, 401);
      const body = await request.json<any>().catch(() => ({}));
      const rawCode = String(body.code || '');
      const normalized = rawCode.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
      const userId = String(body.userId || 'default');
      if (!normalized || normalized.length < 6) return json({ error: 'invalid_code' }, 400);
      const record: PairingRecord = { userId, expiresAt: Date.now() + 10 * 60_000 };
      await env.OAUTH_KV.put(`pair:${normalized}`, JSON.stringify(record), { expirationTtl: 600 });
      return json({ success: true, expiresAt: record.expiresAt });
    }

    if (url.pathname === '/mcp') {
      const props = await authenticate(request, env);
      if (!props) {
        return json({ error: 'unauthorized' }, 401, {
          'www-authenticate': `Bearer resource_metadata="${BRAUZIO_ORIGIN}/.well-known/oauth-protected-resource"`,
        });
      }
      return BrauzioMcp.serve('/mcp', { binding: 'BRAUZIO_MCP' }).fetch(request, env, { props });
    }

    return json({
      ok: true,
      service: 'brauzio-mcp',
      version: BRAUZIO_RUNTIME_VERSION,
      schemaVersion: BRAUZIO_SCHEMA_VERSION,
      toolCount: TOOL_SCHEMAS.length,
    });
  },
};
