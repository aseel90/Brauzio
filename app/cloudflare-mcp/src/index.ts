import { Server, type CallToolResult } from '@modelcontextprotocol/server';
import { createMcpHandler, getMcpAuthContext } from 'agents/mcp/server';
import { OAuthProvider, type AuthRequest, type OAuthHelpers } from '@cloudflare/workers-oauth-provider';
import { TOOL_SCHEMAS } from 'brauzio-shared';
import { BrowserSession } from './browser-session';

export { BrowserSession };

const BRAUZIO_RUNTIME_VERSION = '2.9.1';
const BRAUZIO_SCHEMA_VERSION = 'v2.9.1-2026-09-07';
