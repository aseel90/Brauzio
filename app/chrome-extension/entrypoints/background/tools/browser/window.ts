import { createErrorResponse, ToolResult } from '@/common/tool-handler';
import { BaseBrowserToolExecutor } from '../base-browser';
import { TOOL_NAMES } from 'brauzio-shared';
import { tabTopology } from '../../runtime-v3/tab-topology';

class WindowTool extends BaseBrowserToolExecutor {
  name = TOOL_NAMES.BROWSER.GET_WINDOWS_AND_TABS;
  async execute(): Promise<ToolResult> {
    try {
      await tabTopology.ensureInitialized();
      await tabTopology.reconcile();
      const windows = await chrome.windows.getAll({ populate: true });
      let tabCount = 0;

      const structuredWindows = windows.map((window) => {
        const tabs =
          window.tabs?.map((tab) => {
            tabCount++;
            const topology = typeof tab.id === 'number' ? tabTopology.get(tab.id) : undefined;
            return {
              tabId: tab.id || 0,
              url: tab.url || '',
              title: tab.title || '',
              active: tab.active || false,
              topology: topology
                ? {
                    kind: topology.kind,
                    windowType: topology.windowType,
                    openerTabId: topology.openerTabId ?? null,
                    parentTabId: topology.parentTabId ?? null,
                    rootTabId: topology.rootTabId,
                    confidence: topology.confidence,
                    sources: topology.sources,
                  }
                : null,
            };
          }) || [];

        return {
          windowId: window.id || 0,
          windowType: String(window.type || 'normal'),
          tabs: tabs,
        };
      });

      const result = {
        runtime: {
          extensionVersion: chrome.runtime.getManifest().version,
          buildId: 'BRAUZIO_BUILD_3_2_0_RC1',
        },
        windowCount: windows.length,
        tabCount: tabCount,
        windows: structuredWindows,
      };

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result),
          },
        ],
        isError: false,
      };
    } catch (error) {
      console.error('Error in WindowTool.execute:', error);
      return createErrorResponse(
        `Error getting windows and tabs information: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}

export const windowTool = new WindowTool();
