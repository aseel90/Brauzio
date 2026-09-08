import { MessageTarget } from '@/common/message-types';
import { createErrorResponse, type ToolResult } from '@/common/tool-handler';
import { offscreenManager } from '@/utils/offscreen-manager';
import { BaseBrowserToolExecutor } from '../base-browser';

interface ClipboardParams {
  action: 'read' | 'write';
  text?: string;
}

class ClipboardTool extends BaseBrowserToolExecutor {
  name = 'chrome_clipboard';

  async execute(args: ClipboardParams): Promise<ToolResult> {
    if (!args?.action || !['read', 'write'].includes(args.action)) {
      return createErrorResponse('chrome_clipboard action must be read or write');
    }
    try {
      await offscreenManager.ensureOffscreenDocument();
      const response = await chrome.runtime.sendMessage({
        target: MessageTarget.Offscreen,
        type: args.action === 'read' ? 'BRAUZIO_CLIPBOARD_READ' : 'BRAUZIO_CLIPBOARD_WRITE',
        text: args.action === 'write' ? String(args.text ?? '') : undefined,
      }) as { success?: boolean; text?: string; error?: string } | undefined;
      if (!response?.success) {
        return createErrorResponse(`Clipboard ${args.action} failed: ${response?.error || 'no response'}`);
      }
      return {
        content: [{ type: 'text', text: JSON.stringify({
          success: true,
          action: args.action,
          ...(args.action === 'read' ? { text: String(response.text ?? '') } : {}),
        }) }],
        isError: false,
      };
    } catch (error) {
      return createErrorResponse(`chrome_clipboard failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

export const clipboardTool = new ClipboardTool();
