import { createErrorResponse, type ToolResult } from '@/common/tool-handler';
import { ERROR_MESSAGES } from '@/common/constants';
import { relayMetrics } from '../relay-metrics';
import { relayToolCache } from '../relay-tool-cache';
import { toolTrace } from '../runtime-v3/tool-trace';
import * as browserTools from './browser';

const toolsMap = new Map(
  Object.values(browserTools).map((tool: any) => [tool.name, tool]),
);

export interface ToolCallParam {
  name: string;
  args: any;
  requestId?: string;
}

function internalRequestId(param: ToolCallParam): string {
  return String(param.requestId || param.args?.__brauzioRequestId || crypto.randomUUID());
}

function cleanArgs(args: any): any {
  if (!args || typeof args !== 'object' || Array.isArray(args)) return args;
  if (!('__brauzioRequestId' in args)) return args;
  const next = { ...args };
  delete next.__brauzioRequestId;
  return next;
}

/** Execute a browser tool received from the Brauzio Cloud relay. */
export const handleCallTool = async (param: ToolCallParam): Promise<ToolResult> => {
  const requestId = internalRequestId(param);
  toolTrace.begin(requestId, param.name, { argsPresent: param.args !== undefined });

  const cached = await relayToolCache.get(requestId);
  if (cached && cached.result && typeof cached.result === 'object') {
    relayMetrics.duplicate();
    relayMetrics.recovered();
    toolTrace.mark(requestId, 'dedupe_cache_hit', { layer: 'executor' });
    return cached.result as ToolResult;
  }

  const inflight = relayToolCache.getInflight(requestId);
  if (inflight) {
    relayMetrics.duplicate();
    toolTrace.mark(requestId, 'dedupe_inflight_wait', { layer: 'executor' });
    const payload = await inflight;
    if (payload.result && typeof payload.result === 'object') return payload.result as ToolResult;
    return createErrorResponse(payload.error || 'Cached Brauzio tool execution failed');
  }

  const tool = toolsMap.get(param.name) as any;
  if (!tool) {
    const error = `Tool ${param.name} not found`;
    toolTrace.mark(requestId, 'resolve', { found: false });
    toolTrace.finish(requestId, false, error);
    return createErrorResponse(error);
  }

  const execution = relayToolCache.runOnce(requestId, async () => {
    toolTrace.mark(requestId, 'resolve', { found: true });
    try {
      toolTrace.mark(requestId, 'action');
      const result = await tool.execute(cleanArgs(param.args));
      const success = result?.isError !== true;
      toolTrace.mark(requestId, 'verify', { toolResultError: !success });
      toolTrace.finish(requestId, success, success ? undefined : 'tool_result_error');
      return { type: 'tool_result' as const, requestId, result };
    } catch (error) {
      console.error(`[Brauzio] Tool execution failed for ${param.name}:`, error);
      const message = error instanceof Error ? error.message : ERROR_MESSAGES.TOOL_EXECUTION_FAILED;
      toolTrace.finish(requestId, false, message);
      return {
        type: 'tool_result' as const,
        requestId,
        result: createErrorResponse(message),
      };
    }
  });

  relayMetrics.pending(relayToolCache.snapshot().inflight);
  const payload = await execution;
  const cacheState = relayToolCache.snapshot();
  relayMetrics.pending(cacheState.inflight);
  relayMetrics.completedCache(cacheState.completed);
  if (payload.result && typeof payload.result === 'object') return payload.result as ToolResult;
  return createErrorResponse(payload.error || 'Brauzio tool execution failed');
};
