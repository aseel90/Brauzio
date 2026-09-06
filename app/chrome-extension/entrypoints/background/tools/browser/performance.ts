import { createErrorResponse, type ToolResult } from '@/common/tool-handler';
import { BaseBrowserToolExecutor } from '../base-browser';
import { TOOL_NAMES } from 'brauzio-shared';
import { cdpSessionManager } from '@/utils/cdp-session-manager';

interface StartTraceParams { reload?: boolean; autoStop?: boolean; durationMs?: number }
interface StopTraceParams { saveToDownloads?: boolean; filenamePrefix?: string }
interface AnalyzeInsightParams { insightName?: string }
type DebuggeeEvent = (source: chrome.debugger.Debuggee, method: string, params?: any) => void;

interface TraceSessionState {
  recording: boolean;
  events: any[];
  startedAt: number;
  pageUrl?: string;
  listener: DebuggeeEvent;
  stopResolver?: (value: { completed: boolean }) => void;
  stopPromise?: Promise<{ completed: boolean }>;
}

const sessions = new Map<number, TraceSessionState>();
const lastResults = new Map<number, {
  events: any[];
  startedAt: number;
  endedAt: number;
  tabUrl: string;
  saved?: { downloadId?: number; filename?: string; fullPath?: string };
  metrics?: Record<string, number>;
}>();

function tracingCategories(): string[] {
  return [
    '-*', 'blink.console', 'blink.user_timing', 'devtools.timeline',
    'disabled-by-default-devtools.screenshot',
    'disabled-by-default-devtools.timeline',
    'disabled-by-default-devtools.timeline.invalidationTracking',
    'disabled-by-default-devtools.timeline.frame',
    'disabled-by-default-devtools.timeline.stack',
    'disabled-by-default-v8.cpu_profiler',
    'disabled-by-default-v8.cpu_profiler.hires',
    'latencyInfo', 'loading', 'disabled-by-default-lighthouse', 'v8.execute', 'v8',
  ];
}

async function readPerformanceMetrics(tabId: number): Promise<Record<string, number>> {
  try {
    await cdpSessionManager.sendCommand(tabId, 'Performance.enable');
    const result = (await cdpSessionManager.sendCommand(tabId, 'Performance.getMetrics')) as {
      metrics: Array<{ name: string; value: number }>;
    };
    await cdpSessionManager.sendCommand(tabId, 'Performance.disable');
    return Object.fromEntries((result.metrics || []).map((metric) => [metric.name, metric.value]));
  } catch {
    return {};
  }
}

async function saveTraceToDownloads(json: string, filenamePrefix = 'performance_trace') {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${filenamePrefix}_${timestamp}.json`;
    const dataUrl = `data:application/json;base64,${btoa(unescape(encodeURIComponent(json)))}`;
    const downloadId = await chrome.downloads.download({ url: dataUrl, filename, saveAs: false });
    try {
      await new Promise((resolve) => setTimeout(resolve, 120));
      const [item] = await chrome.downloads.search({ id: downloadId });
      return { downloadId, filename, fullPath: item?.filename };
    } catch {
      return { downloadId, filename };
    }
  } catch {
    return undefined;
  }
}

function getStopPromise(session: TraceSessionState) {
  if (!session.stopPromise) {
    session.stopPromise = new Promise((resolve) => { session.stopResolver = resolve; });
  }
  return session.stopPromise;
}

class PerformanceStartTraceTool extends BaseBrowserToolExecutor {
  name = TOOL_NAMES.BROWSER.PERFORMANCE_START_TRACE;
  async execute(args: StartTraceParams): Promise<ToolResult> {
    const { reload = false, autoStop = false, durationMs = 5000 } = args || {};
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) return createErrorResponse('No active tab found');
      const tabId = tab.id;
      if (sessions.get(tabId)?.recording) {
        return createErrorResponse('A performance trace is already running.');
      }
      await cdpSessionManager.attach(tabId, 'performance');
      const state: TraceSessionState = {
        recording: true,
        events: [],
        startedAt: Date.now(),
        pageUrl: tab.url || '',
        listener: (source, method, params) => {
          if (source.tabId !== tabId) return;
          if (method === 'Tracing.dataCollected' && params?.value) {
            state.events.push(...(params.value as any[]));
          } else if (method === 'Tracing.tracingComplete') {
            state.recording = false;
            state.stopResolver?.({ completed: true });
          }
        },
      };
      chrome.debugger.onEvent.addListener(state.listener);
      sessions.set(tabId, state);
      await cdpSessionManager.sendCommand(tabId, 'Tracing.start', {
        categories: tracingCategories().join(','),
        options: 'record-as-much-as-possible',
        transferMode: 'ReportEvents',
      });
      if (reload) await cdpSessionManager.sendCommand(tabId, 'Page.reload', { ignoreCache: true });
      if (autoStop) {
        setTimeout(() => {
          cdpSessionManager.sendCommand(tabId, 'Tracing.end').catch(() => undefined);
        }, Math.max(1000, Math.min(Number(durationMs) || 5000, 60000)));
      }
      return {
        content: [{ type: 'text', text: JSON.stringify({ success: true, message: 'Performance trace started.', reload, autoStop }) }],
        isError: false,
      };
    } catch (error) {
      return createErrorResponse(`Failed to start performance trace: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

class PerformanceStopTraceTool extends BaseBrowserToolExecutor {
  name = TOOL_NAMES.BROWSER.PERFORMANCE_STOP_TRACE;
  async execute(args: StopTraceParams): Promise<ToolResult> {
    const { saveToDownloads = true, filenamePrefix = 'performance_trace' } = args || {};
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) return createErrorResponse('No active tab found');
      const tabId = tab.id;
      const session = sessions.get(tabId);
      if (!session) return createErrorResponse('No performance trace session found for the current tab.');

      if (session.recording) {
        const done = getStopPromise(session);
        await cdpSessionManager.sendCommand(tabId, 'Tracing.end');
        await done;
      }
      const metrics = await readPerformanceMetrics(tabId);
      chrome.debugger.onEvent.removeListener(session.listener);
      await cdpSessionManager.detach(tabId, 'performance').catch(() => undefined);

      const endedAt = Date.now();
      const json = JSON.stringify({ traceEvents: session.events });
      const saved = saveToDownloads ? await saveTraceToDownloads(json, filenamePrefix) : undefined;
      lastResults.set(tabId, {
        events: session.events,
        startedAt: session.startedAt,
        endedAt,
        tabUrl: session.pageUrl || '',
        saved,
        metrics,
      });
      sessions.delete(tabId);

      return {
        content: [{ type: 'text', text: JSON.stringify({
          success: true,
          message: 'Performance trace stopped.',
          eventCount: session.events.length,
          saved,
          metrics,
          startedAt: session.startedAt,
          endedAt,
          durationMs: endedAt - session.startedAt,
          url: session.pageUrl || '',
        }) }],
        isError: false,
      };
    } catch (error) {
      return createErrorResponse(`Failed to stop performance trace: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

class PerformanceAnalyzeInsightTool extends BaseBrowserToolExecutor {
  name = TOOL_NAMES.BROWSER.PERFORMANCE_ANALYZE_INSIGHT;
  async execute(args: AnalyzeInsightParams): Promise<ToolResult> {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) return createErrorResponse('No active tab found');
      const result = lastResults.get(tab.id);
      if (!result) return createErrorResponse('No completed performance trace found for the current tab.');

      const counts = new Map<string, number>();
      for (const event of result.events.slice(0, 100000)) {
        const name = typeof event?.name === 'string' ? event.name : 'unknown';
        counts.set(name, (counts.get(name) || 0) + 1);
      }
      const topEventNames = [...counts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20)
        .map(([name, count]) => ({ name, count }));

      return {
        content: [{ type: 'text', text: JSON.stringify({
          success: true,
          requestedInsight: args?.insightName || null,
          url: result.tabUrl,
          startedAt: result.startedAt,
          endedAt: result.endedAt,
          durationMs: result.endedAt - result.startedAt,
          metrics: result.metrics || {},
          topEventNames,
          saved: result.saved,
        }) }],
        isError: false,
      };
    } catch (error) {
      return createErrorResponse(`Failed to analyze trace: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

export const performanceStartTraceTool = new PerformanceStartTraceTool();
export const performanceStopTraceTool = new PerformanceStopTraceTool();
export const performanceAnalyzeInsightTool = new PerformanceAnalyzeInsightTool();
