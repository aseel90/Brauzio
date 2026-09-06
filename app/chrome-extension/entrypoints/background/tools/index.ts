import { createErrorResponse } from '@/common/tool-handler';
import { ERROR_MESSAGES } from '@/common/constants';
import * as browserTools from './browser';

const toolsMap = new Map(
  Object.values(browserTools).map((tool: any) => [tool.name, tool]),
);

export interface ToolCallParam {
  name: string;
  args: any;
}

/** Execute a browser tool received from the Brauzio Cloud relay. */
export const handleCallTool = async (param: ToolCallParam) => {
  const tool = toolsMap.get(param.name) as any;
  if (!tool) return createErrorResponse(`Tool ${param.name} not found`);

  try {
    return await tool.execute(param.args);
  } catch (error) {
    console.error(`[Brauzio] Tool execution failed for ${param.name}:`, error);
    return createErrorResponse(
      error instanceof Error ? error.message : ERROR_MESSAGES.TOOL_EXECUTION_FAILED,
    );
  }
};
