import { createErrorResponse, type ToolResult } from '@/common/tool-handler';
import { BaseBrowserToolExecutor } from '../base-browser';
import { TOOL_NAMES } from 'brauzio-shared';
import { cdpRouter } from '@/utils/cdp-router';
import { sanitizeAndLimitOutput } from '@/utils/output-sanitizer';

const DEFAULT_TIMEOUT_MS = 20_000;
const MAX_TIMEOUT_MS = 120_000;
const DEFAULT_MAX_OUTPUT_BYTES = 64 * 1024;
const MAX_OUTPUT_BYTES = 256 * 1024;
const MAX_PARAMS_BYTES = 128 * 1024;

const ALLOWED_METHODS: Record<string, readonly string[]> = {
  Accessibility: [
    'enable', 'disable', 'getPartialAXTree', 'getFullAXTree', 'getRootAXNode',
    'getAXNodeAndAncestors', 'getChildAXNodes', 'queryAXTree',
  ],
  CSS: [
    'enable', 'disable', 'getBackgroundColors', 'getComputedStyleForNode',
    'getInlineStylesForNode', 'getLocationForSelector', 'getMatchedStylesForNode',
    'getMediaQueries', 'getPlatformFontsForNode', 'getStyleSheetText',
    'getEnvironmentVariables', 'takeComputedStyleUpdates',
  ],
  DOM: [
    'enable', 'disable', 'getDocument', 'getFlattenedDocument', 'getOuterHTML',
    'getAttributes', 'getBoxModel', 'getContentQuads', 'getNodeForLocation',
    'getNodesForSubtreeByStyle', 'getRelayoutBoundary', 'describeNode',
    'querySelector', 'querySelectorAll', 'collectClassNames', 'requestNode',
    'requestChildNodes', 'performSearch', 'getSearchResults', 'discardSearchResults',
  ],
  DOMSnapshot: ['enable', 'disable', 'getSnapshot', 'captureSnapshot'],
  Emulation: [
    'setDeviceMetricsOverride', 'clearDeviceMetricsOverride', 'setTouchEmulationEnabled',
    'setEmulatedMedia', 'setEmulatedVisionDeficiency', 'setCPUThrottlingRate',
    'setHardwareConcurrencyOverride', 'setLocaleOverride', 'setTimezoneOverride',
    'setUserAgentOverride', 'setFocusEmulationEnabled', 'setPageScaleFactor',
  ],
  Log: ['enable', 'disable', 'clear', 'startViolationsReport', 'stopViolationsReport'],
  Network: [
    'enable', 'disable', 'getResponseBody', 'getCertificate', 'getSecurityIsolationStatus',
    'setCacheDisabled', 'setBypassServiceWorker', 'emulateNetworkConditions',
    'clearBrowserCache', 'setAcceptedEncodings', 'clearAcceptedEncodings',
  ],
  Page: [
    'enable', 'disable', 'getAppManifest', 'getFrameTree', 'getLayoutMetrics',
    'getNavigationHistory', 'getResourceContent', 'getResourceTree', 'getScriptExecutionStatus',
    'captureScreenshot', 'captureSnapshot', 'printToPDF', 'bringToFront', 'reload',
    'stopLoading', 'setLifecycleEventsEnabled',
  ],
  Performance: ['enable', 'disable', 'getMetrics', 'setTimeDomain'],
  Runtime: [
    'enable', 'disable', 'evaluate', 'callFunctionOn', 'getProperties', 'queryObjects',
    'releaseObject', 'releaseObjectGroup', 'globalLexicalScopeNames', 'getIsolateId',
    'compileScript', 'runScript',
  ],
  Schema: ['getDomains'],
  Target: ['getTargets', 'getTargetInfo'],
};

const DENIED_METHODS = new Set([
  'Network.getAllCookies', 'Network.getCookies', 'Network.setCookie', 'Network.setCookies',
  'Network.deleteCookies', 'Network.clearBrowserCookies', 'Network.getRequestPostData',
  'Page.navigate', 'Page.setDownloadBehavior', 'Page.handleJavaScriptDialog',
  'Target.createTarget', 'Target.closeTarget', 'Target.createBrowserContext',
  'Target.disposeBrowserContext', 'Target.attachToTarget', 'Target.detachFromTarget',
  'Target.setAutoAttach', 'Target.exposeDevToolsProtocol',
]);

interface RawCdpParams {
  action?: 'command' | 'list_allowed' | 'sessions';
  method?: string;
  params?: Record<string, unknown>;
  tabId?: number;
  sessionId?: string;
  timeoutMs?: number;
  maxOutputBytes?: number;
}

class RawCdpTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`CDP command timed out after ${timeoutMs}ms`);
    this.name = 'RawCdpTimeoutError';
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new RawCdpTimeoutError(timeoutMs)), timeoutMs);
    promise.then(resolve, reject).finally(() => clearTimeout(timer));
  });
}

function normalizedInt(value: unknown, fallback: number, max: number): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return fallback;
  return Math.min(Math.floor(numeric), max);
}

function validateMethod(method: string): { ok: true; domain: string; command: string } | { ok: false; reason: string } {
  if (!/^[A-Za-z][A-Za-z0-9]*\.[A-Za-z][A-Za-z0-9]*$/.test(method)) {
    return { ok: false, reason: 'CDP method must use Domain.command format' };
  }
  if (DENIED_METHODS.has(method)) {
    return { ok: false, reason: `CDP method is explicitly blocked: ${method}` };
  }
  const [domain, command] = method.split('.', 2);
  const allowed = ALLOWED_METHODS[domain];
  if (!allowed) return { ok: false, reason: `CDP domain is not allowed: ${domain}` };
  if (!allowed.includes(command)) {
    return { ok: false, reason: `CDP method is not allowlisted: ${method}` };
  }
  return { ok: true, domain, command };
}

function paramsSize(params: Record<string, unknown>): number {
  try {
    return new TextEncoder().encode(JSON.stringify(params)).byteLength;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

class RawCdpTool extends BaseBrowserToolExecutor {
  name = TOOL_NAMES.BROWSER.CDP;

  async execute(args: RawCdpParams): Promise<ToolResult> {
    const action = args.action || 'command';

    if (action === 'list_allowed') {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            domains: ALLOWED_METHODS,
            deniedMethods: [...DENIED_METHODS].sort(),
            maxParamsBytes: MAX_PARAMS_BYTES,
            maxOutputBytes: MAX_OUTPUT_BYTES,
          }),
        }],
        isError: false,
      };
    }

    if (action === 'sessions') {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            rootSessions: cdpRouter.getSessionSnapshot(args.tabId),
            childSessions: cdpRouter.getChildSessionSnapshot(args.tabId),
          }),
        }],
        isError: false,
      };
    }

    if (action !== 'command') return createErrorResponse(`Unsupported chrome_cdp action: ${action}`);
    const method = String(args.method || '').trim();
    if (!method) return createErrorResponse('method is required for action=command');
    const validation = validateMethod(method);
    if (!validation.ok) return createErrorResponse(validation.reason);

    const params = args.params && typeof args.params === 'object' ? args.params : {};
    const size = paramsSize(params);
    if (!Number.isFinite(size)) return createErrorResponse('CDP params must be JSON-serializable');
    if (size > MAX_PARAMS_BYTES) {
      return createErrorResponse(`CDP params exceed ${MAX_PARAMS_BYTES} bytes`);
    }

    const tab = typeof args.tabId === 'number'
      ? await this.tryGetTab(args.tabId)
      : await this.getActiveTabOrThrow().catch(() => null);
    if (!tab?.id) return createErrorResponse(typeof args.tabId === 'number' ? `Tab not found: ${args.tabId}` : 'No active tab found');

    const tabId = tab.id;
    const timeoutMs = normalizedInt(args.timeoutMs, DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS);
    const maxOutputBytes = normalizedInt(args.maxOutputBytes, DEFAULT_MAX_OUTPUT_BYTES, MAX_OUTPUT_BYTES);
    const startedAt = performance.now();

    try {
      const response = await withTimeout(
        args.sessionId
          ? cdpRouter.sendToChild(tabId, String(args.sessionId), method, params)
          : cdpRouter.sendCommand(tabId, method, params),
        timeoutMs,
      );
      const sanitized = sanitizeAndLimitOutput(response, { maxBytes: maxOutputBytes });
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            tabId,
            sessionId: args.sessionId || undefined,
            method,
            result: sanitized.text,
            truncated: sanitized.truncated || undefined,
            redacted: sanitized.redacted || undefined,
            elapsedMs: Math.round(performance.now() - startedAt),
          }),
        }],
        isError: false,
      };
    } catch (error) {
      return createErrorResponse(
        `CDP command failed (${method}): ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}

export const rawCdpTool = new RawCdpTool();
