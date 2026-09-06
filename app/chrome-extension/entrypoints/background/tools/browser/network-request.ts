import { createErrorResponse, type ToolResult } from '@/common/tool-handler';
import { BaseBrowserToolExecutor } from '../base-browser';
import { TOOL_NAMES } from 'brauzio-shared';
import { TOOL_MESSAGE_TYPES } from '@/common/message-types';

const DEFAULT_NETWORK_REQUEST_TIMEOUT = 30000;

interface NetworkRequestToolParams {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: unknown;
  timeout?: number;
  tabId?: number;
  windowId?: number;
}

class NetworkRequestTool extends BaseBrowserToolExecutor {
  name = TOOL_NAMES.BROWSER.NETWORK_REQUEST;

  async execute(args: NetworkRequestToolParams): Promise<ToolResult> {
    const {
      url,
      method = 'GET',
      headers = {},
      body,
      timeout = DEFAULT_NETWORK_REQUEST_TIMEOUT,
    } = args || ({} as NetworkRequestToolParams);
    if (!url) return createErrorResponse('URL parameter is required.');

    try {
      const explicit = await this.tryGetTab(args?.tabId);
      const tab = explicit || (await this.getActiveTabOrThrowInWindow(args?.windowId));
      if (!tab.id) return createErrorResponse('No active tab found or tab has no ID.');

      await this.injectContentScript(tab.id, ['inject-scripts/network-helper.js']);
      const result = await this.sendMessageToTab(tab.id, {
        action: TOOL_MESSAGE_TYPES.NETWORK_SEND_REQUEST,
        url,
        method: String(method).toUpperCase(),
        headers,
        body,
        timeout: Math.max(1, Math.min(Number(timeout) || DEFAULT_NETWORK_REQUEST_TIMEOUT, 120000)),
      });

      return {
        content: [{ type: 'text', text: JSON.stringify(result) }],
        isError: !result?.success,
      };
    } catch (error) {
      return createErrorResponse(
        `Error sending network request: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}

export const networkRequestTool = new NetworkRequestTool();
