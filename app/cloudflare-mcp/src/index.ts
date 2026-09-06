import { Server, type CallToolResult } from '@modelcontextprotocol/server';
import { createMcpHandler } from 'agents/mcp/server';
import { TOOL_SCHEMAS } from 'chrome-mcp-shared';
import { BrowserSession } from './browser-session';

export { BrowserSession };

interface Env {
  BROWSER_SESSIONS: DurableObjectNamespace<BrowserSession>;
  DEFAULT_DEVICE_ID?: string;
  MCP_SHARED_SECRET?: string;
  BROWSER_SHARED_SECRET: string;
}

function jsonError(message: string): CallToolResult {
  return {
    content: [{ type: 'text', text: message }],
    isError: true,
  };
}

function effectiveMcpSecret(env: Env): string {
  return String(env.MCP_SHARED_SECRET || env.BROWSER_SHARED_SECRET || '');
}

function requestAuthorized(request: Request, env: Env): boolean {
  const expected = effectiveMcpSecret(env);
  if (expected.length < 16) return false;

  const authorization = request.headers.get('Authorization') || '';
  if (authorization.startsWith('Bearer ') && authorization.slice(7) === expected) return true;

  // Private/single-user bootstrap mode for ChatGPT Custom MCP URLs.
  // For public or multi-user distribution, replace this with OAuth.
  const key = new URL(request.url).searchParams.get('key');
  return key === expected;
}

function deviceIdFromRequest(request: Request, env: Env): string {
  const url = new URL(request.url);
  return String(url.searchParams.get('device') || env.DEFAULT_DEVICE_ID || 'default').slice(0, 128);
}

function browserStub(env: Env, deviceId: string) {
  const id = env.BROWSER_SESSIONS.idFromName(deviceId || 'default');
  return env.BROWSER_SESSIONS.get(id);
}

async function callBrowserTool(
  env: Env,
  deviceId: string,
  name: string,
  args: Record<string, unknown>,
): Promise<CallToolResult> {
  const stub = browserStub(env, deviceId);
  const response = await stub.fetch(
    new Request('https://brauzio-browser.internal/call', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, args, timeoutMs: 120_000 }),
    }),
  );

  const payload = (await response.json().catch(() => ({}))) as {
    result?: CallToolResult;
    error?: string;
  };

  if (!response.ok) {
    return jsonError(payload.error || `Brauzio relay failed with HTTP ${response.status}`);
  }
  if (!payload.result) {
    return jsonError('Brauzio extension returned an empty tool result');
  }
  return payload.result;
}

function createServer(env: Env, deviceId: string) {
  const server = new Server(
    { name: 'Brauzio', version: '0.1.0' },
    {
      capabilities: {
        tools: {},
      },
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
        deviceId,
        request.params.name,
        (request.params.arguments || {}) as Record<string, unknown>,
      );
    } catch (error) {
      return jsonError(error instanceof Error ? error.message : String(error));
    }
  });

  return server;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/health') {
      return Response.json({ service: 'Brauzio MCP', ok: true, version: '0.1.0' });
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
      if (!requestAuthorized(request, env)) return new Response('Unauthorized', { status: 401 });
      const deviceId = deviceIdFromRequest(request, env);
      return browserStub(env, deviceId).fetch('https://brauzio-browser.internal/status');
    }

    if (url.pathname === '/mcp') {
      if (!requestAuthorized(request, env)) {
        return new Response('Unauthorized', {
          status: 401,
          headers: { 'WWW-Authenticate': 'Bearer realm="Brauzio MCP"' },
        });
      }

      const deviceId = deviceIdFromRequest(request, env);
      return createMcpHandler(() => createServer(env, deviceId), {
        route: '/mcp',
        legacy: 'stateless',
      })(request, env, ctx);
    }

    return new Response('Brauzio Cloud MCP', {
      status: 200,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  },
} satisfies ExportedHandler<Env>;
