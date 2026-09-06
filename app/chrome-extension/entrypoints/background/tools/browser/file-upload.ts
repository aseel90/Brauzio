import { createErrorResponse, type ToolResult } from '@/common/tool-handler';
import { BaseBrowserToolExecutor } from '../base-browser';
import { TOOL_NAMES } from 'brauzio-shared';
import { cdpSessionManager } from '@/utils/cdp-session-manager';

interface FileUploadToolParams {
  selector: string;
  filePath: string;
  tabId?: number;
  windowId?: number;
}

class FileUploadTool extends BaseBrowserToolExecutor {
  name = TOOL_NAMES.BROWSER.FILE_UPLOAD;

  async execute(args: FileUploadToolParams): Promise<ToolResult> {
    const selector = String(args?.selector || '').trim();
    const filePath = String(args?.filePath || '').trim();
    if (!selector) return createErrorResponse('Selector is required for file upload');
    if (!filePath) return createErrorResponse('filePath is required for file upload');

    try {
      const explicit = await this.tryGetTab(args?.tabId);
      const tab = explicit || (await this.getActiveTabOrThrowInWindow(args?.windowId));
      if (!tab.id) return createErrorResponse('No active tab found');
      const tabId = tab.id;

      await cdpSessionManager.withSession(tabId, 'file-upload', async () => {
        await cdpSessionManager.sendCommand(tabId, 'DOM.enable', {});
        await cdpSessionManager.sendCommand(tabId, 'Runtime.enable', {});
        const { root } = (await cdpSessionManager.sendCommand(tabId, 'DOM.getDocument', {
          depth: -1,
          pierce: true,
        })) as { root: { nodeId: number } };
        const { nodeId } = (await cdpSessionManager.sendCommand(tabId, 'DOM.querySelector', {
          nodeId: root.nodeId,
          selector,
        })) as { nodeId: number };
        if (!nodeId) throw new Error(`Element with selector "${selector}" not found`);

        const { node } = (await cdpSessionManager.sendCommand(tabId, 'DOM.describeNode', {
          nodeId,
        })) as { node: { nodeName: string; attributes?: string[] } };
        const attrs = node.attributes || [];
        let isFileInput = node.nodeName === 'INPUT';
        if (isFileInput) {
          isFileInput = false;
          for (let i = 0; i < attrs.length; i += 2) {
            if (attrs[i] === 'type' && attrs[i + 1] === 'file') {
              isFileInput = true;
              break;
            }
          }
        }
        if (!isFileInput) throw new Error(`Element with selector "${selector}" is not input[type=file]`);

        await cdpSessionManager.sendCommand(tabId, 'DOM.setFileInputFiles', {
          nodeId,
          files: [filePath],
        });
        await cdpSessionManager.sendCommand(tabId, 'Runtime.evaluate', {
          expression: `(() => { const e = document.querySelector(${JSON.stringify(selector)}); if (!e) return false; e.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`,
        });
      });

      return {
        content: [{ type: 'text', text: JSON.stringify({ success: true, selector, fileCount: 1 }) }],
        isError: false,
      };
    } catch (error) {
      return createErrorResponse(
        `Error uploading file: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}

export const fileUploadTool = new FileUploadTool();
