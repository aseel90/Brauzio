import { createErrorResponse, type ToolResult } from '@/common/tool-handler';
import { cdpRouter } from '@/utils/cdp-router';
import { relayMetrics } from '../../relay-metrics';
import { automationSessions } from '../../runtime-v3/automation-session';
import { runtimeState } from '../../runtime-v3/runtime-state';
import { toolTrace } from '../../runtime-v3/tool-trace';
import { BaseBrowserToolExecutor } from '../base-browser';

interface DiagnosticsParams {
  tabId?: number;
  windowId?: number;
  includeTraces?: boolean;
  traceLimit?: number;
}

const STORAGE_KEYS = {
  RELAY_URL: 'brauzioRelayUrl',
  DEVICE_ID: 'brauzioDeviceId',
  AUTO_CONNECT: 'brauzioRelayAutoConnect',
} as const;

function healthUrlFromRelay(relayUrl: string): string {
  const raw = /^https?:\/\//i.test(relayUrl) || /^wss?:\/\//i.test(relayUrl)
    ? relayUrl
    : `https://${relayUrl}`;
  const url = new URL(raw);
  url.protocol = url.protocol === 'http:' || url.protocol === 'ws:' ? 'http:' : 'https:';
  url.pathname = '/health';
  url.search = '';
  url.hash = '';
  return url.toString();
}

async function workerHealth(relayUrl: string): Promise<Record<string, unknown>> {
  if (!relayUrl) return { configured: false, ok: false };
  const startedAt = performance.now();
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const response = await fetch(healthUrlFromRelay(relayUrl), {
      cache: 'no-store',
      signal: controller.signal,
    });
    clearTimeout(timer);
    const body = await response.json().catch(() => ({})) as Record<string, unknown>;
    return {
      configured: true,
      ok: response.ok && body.ok === true,
      status: response.status,
      latencyMs: Math.max(0, Math.round(performance.now() - startedAt)),
      version: body.version,
      schemaVersion: body.schemaVersion,
      toolCount: body.toolCount,
    };
  } catch (error) {
    return {
      configured: true,
      ok: false,
      latencyMs: Math.max(0, Math.round(performance.now() - startedAt)),
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function runtimeMessage<T = unknown>(type: string): Promise<T | undefined> {
  try {
    return await chrome.runtime.sendMessage({ type }) as T;
  } catch {
    return undefined;
  }
}

class DiagnosticsTool extends BaseBrowserToolExecutor {
  name = 'chrome_diagnostics';

  async execute(args: DiagnosticsParams = {}): Promise<ToolResult> {
    try {
      const manifest = chrome.runtime.getManifest();
      const storage = await chrome.storage.local.get([
        STORAGE_KEYS.RELAY_URL,
        STORAGE_KEYS.DEVICE_ID,
        STORAGE_KEYS.AUTO_CONNECT,
      ]);
      const relayUrl = String(storage[STORAGE_KEYS.RELAY_URL] || '');
      const permissions = await chrome.permissions.getAll();
      const tabs = await chrome.tabs.query({});
      const explicit = await this.tryGetTab(args.tabId);
      const tab = explicit || await this.getActiveTabOrThrowInWindow(args.windowId).catch(() => undefined);
      const tabId = typeof tab?.id === 'number' ? tab.id : undefined;
      const state = tabId !== undefined ? await runtimeState.get(tabId) : undefined;
      const workflows = await automationSessions.list();
      const relay = relayMetrics.snapshot();
      const [health, relayStatusResponse, relayDiagnosticResponse] = await Promise.all([
        workerHealth(relayUrl),
        runtimeMessage<{ success?: boolean; status?: unknown }>('brauzio_relay_get_status'),
        runtimeMessage<{ success?: boolean; report?: unknown; error?: string }>('brauzio_diagnostics_run'),
      ]);
      const cdpSessions = cdpRouter.getSessionSnapshot(tabId);
      const report = {
        success: true,
        generatedAt: Date.now(),
        extension: {
          version: manifest.version,
          buildId: 'BRAUZIO_BUILD_3_1_0',
          manifestVersion: manifest.manifest_version,
          id: chrome.runtime.id,
        },
        worker: health,
        relay: {
          configured: Boolean(relayUrl),
          deviceIdConfigured: Boolean(storage[STORAGE_KEYS.DEVICE_ID]),
          autoConnect: storage[STORAGE_KEYS.AUTO_CONNECT] !== false,
          status: relayStatusResponse?.status,
          internalDiagnostics: relayDiagnosticResponse?.report,
          internalDiagnosticsError: relayDiagnosticResponse?.error,
          ...relay,
        },
        browser: {
          tabCount: tabs.length,
          activeTab: tab ? {
            tabId: tab.id,
            windowId: tab.windowId,
            title: tab.title,
            url: tab.url,
            status: tab.status,
          } : null,
          permissions: permissions.permissions || [],
          origins: permissions.origins || [],
        },
        cdp: {
          sessions: cdpSessions,
          attachedCount: cdpSessions.filter((session) => session.attachedByUs).length,
        },
        runtimeState: state || null,
        automation: {
          sessionCount: workflows.length,
          active: workflows.filter((workflow) => workflow.status === 'running'),
          recent: workflows.slice(0, 10),
        },
        traceSummary: toolTrace.summary(),
        traces: args.includeTraces === true
          ? toolTrace.list(Math.max(1, Math.min(Number(args.traceLimit || 12), 40)))
          : undefined,
      };

      return {
        content: [{ type: 'text', text: JSON.stringify(report) }],
        isError: false,
      };
    } catch (error) {
      return createErrorResponse(
        `chrome_diagnostics failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}

export const diagnosticsTool = new DiagnosticsTool();
