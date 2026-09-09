import { z } from 'zod';
import { BrowserTool } from '../browser-tool';
import { ToolResult } from '../types';

const WindowSchema = z.object({
  action: z.enum(['list', 'activate', 'close']).default('list'),
  windowId: z.number().optional(),
});

type WindowParams = z.infer<typeof WindowSchema>;

export class WindowTool extends BrowserTool<WindowParams> {
  name = 'get_windows_and_tabs' as const;
  description = 'List all Chrome windows and tabs, activate a window, or close a window.';
  schema = WindowSchema;

  async execute(args: WindowParams): Promise<ToolResult> {
    const params = WindowSchema.parse(args);

    if (params.action === 'activate') {
      if (typeof params.windowId !== 'number') {
        return { success: false, message: 'windowId is required for activate' };
      }
      await chrome.windows.update(params.windowId, { focused: true });
      return { success: true, message: `Activated window ${params.windowId}` };
    }

    if (params.action === 'close') {
      if (typeof params.windowId !== 'number') {
        return { success: false, message: 'windowId is required for close' };
      }
      await chrome.windows.remove(params.windowId);
      return { success: true, message: `Closed window ${params.windowId}` };
    }

    const windows = await chrome.windows.getAll({ populate: true });
    return {
      success: true,
      extensionVersion: chrome.runtime.getManifest().version,
      buildId: 'BRAUZIO_BUILD_3_1_1',
      windowCount: windows.length,
      tabCount: windows.reduce((count, win) => count + (win.tabs?.length || 0), 0),
      windows: windows.map((win) => ({
        windowId: win.id,
        focused: win.focused,
        incognito: win.incognito,
        type: win.type,
        state: win.state,
        tabs: (win.tabs || []).map((tab) => ({
          tabId: tab.id,
          windowId: tab.windowId,
          active: tab.active,
          pinned: tab.pinned,
          title: tab.title,
          url: tab.url,
          status: tab.status,
        })),
      })),
    };
  }
}
