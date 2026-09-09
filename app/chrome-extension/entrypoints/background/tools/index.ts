import { createErrorResponse } from '@/common/tool-handler';
import { ERROR_MESSAGES } from '@/common/constants';
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

/** Execute a browser tool received from the Brauzio Cloud relay. */
export const handleCallTool = async (param: ToolCallParam) => {
  const requestId = String(param.requestId || crypto.randomUUID());
  toolTrace.begin(requestId, param.name, { argsPresent: param.args !== undefined });
  const tool = toolsMap.get(param.name) as any;
  if (!tool) {
    const error = `Tool ${param.name} not found`;
    toolTrace.mark(requestId, 'resolve', { found: false });
    toolTrace.finish(requestId, false, error);
    return createErrorResponse(error);
  }

  toolTrace.mark(requestId, 'resolve', { found: true });
  try {
    toolTrace.mark(requestId, 'action');
    const result = await tool.execute(param.args);
    const success = result?.isError !== true;
    toolTrace.mark(requestId, 'verify', { toolResultError: !success });
    toolTrace.finish(requestId, success, success ? undefined : 'tool_result_error');
    return result;
  } catch (error) {
    console.error(`[Brauzio] Tool execution failed for ${param.name}:`, error);
    const message = error instanceof Error ? error.message : ERROR_MESSAGES.TOOL_EXECUTION_FAILED;
    toolTrace.finish(requestId, false, message);
    return createErrorResponse(message);
  }
};
