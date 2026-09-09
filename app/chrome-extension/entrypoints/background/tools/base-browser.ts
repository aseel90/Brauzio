import { ToolExecutor } from '@/common/tool-handler';
import type { ToolResult } from '@/common/tool-handler';
import { TIMEOUTS, ERROR_MESSAGES } from '@/common/constants';

const PING_TIMEOUT_MS = 300;
const TAB_MESSAGE_TIMEOUT_MS = 7000;

/**
 * Base class for browser tool executors
 */
export abstract class BaseBrowserToolExecutor implements ToolExecutor {
  abstract name: string;
  abstract execute(args: any): Promise<ToolResult>;

  /**
   * Inject content script into tab
   */
  protected async injectContentScript(
    tabId: number,
    files: string[],
    injectImmediately = false,
    world: 'MAIN' | 'ISOLATED' = 'ISOLATED',
    allFrames: boolean = false,
    frameIds?: number[],
  ): Promise<void> {
    console.log(`Injecting ${files.join(', ')} into tab ${tabId}`);

    try {
      const pingFrameId = frameIds?.[0];
      const response = await Promise.race([
        typeof pingFrameId === 'number'
          ? chrome.tabs.sendMessage(tabId, { action: `${this.name}_ping` }, { frameId: pingFrameId })
          : chrome.tabs.sendMessage(tabId, { action: `${this.name}_ping` }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`${this.name} Ping action to tab ${tabId} timed out`)), PING_TIMEOUT_MS),
        ),
      ]);
      if (response && (response as any).status === 'pong') return;
    } catch (error) {
      console.warn(`ping content script failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    try {
      const target: { tabId: number; allFrames?: boolean; frameIds?: number[] } = { tabId };
      if (frameIds && frameIds.length > 0) target.frameIds = frameIds;
      else if (allFrames) target.allFrames = true;
      await chrome.scripting.executeScript({ target, files, injectImmediately, world } as any);
    } catch (injectionError) {
      const errorMessage = injectionError instanceof Error ? injectionError.message : String(injectionError);
      throw new Error(`${ERROR_MESSAGES.TOOL_EXECUTION_FAILED}: Failed to inject content script in tab ${tabId}: ${errorMessage}`);
    }
  }

  /** Send a message to a tab, but never let a dead content-script port hang the MCP request. */
  protected async sendMessageToTab(tabId: number, message: any, frameId?: number): Promise<any> {
    const action = message?.action || 'unknown';
    try {
      const sendPromise = typeof frameId === 'number'
        ? chrome.tabs.sendMessage(tabId, message, { frameId })
        : chrome.tabs.sendMessage(tabId, message);
      const response = await Promise.race([
        sendPromise,
        new Promise<never>((_, reject) => setTimeout(
          () => reject(new Error(`Tab message timed out after ${TAB_MESSAGE_TIMEOUT_MS}ms (tab=${tabId}, action=${action})`)),
          TAB_MESSAGE_TIMEOUT_MS,
        )),
      ]);
      if (response && (response as any).error) throw new Error(String((response as any).error));
      return response;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`Error sending message to tab ${tabId} for action ${action}: ${errorMessage}`);
      if (error instanceof Error) throw error;
      throw new Error(errorMessage);
    }
  }

  protected async tryGetTab(tabId?: number): Promise<chrome.tabs.Tab | null> {
    if (typeof tabId !== 'number') return null;
    try { return await chrome.tabs.get(tabId); } catch { return null; }
  }

  protected async getActiveTabOrThrow(): Promise<chrome.tabs.Tab> {
    const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!active?.id) throw new Error('No active tab found');
    return active;
  }

  protected async getActiveTabOrThrowInWindow(windowId?: number): Promise<chrome.tabs.Tab> {
    if (typeof windowId === 'number') {
      const [active] = await chrome.tabs.query({ active: true, windowId });
      if (!active?.id) throw new Error(`No active tab found in window ${windowId}`);
      return active;
    }
    return this.getActiveTabOrThrow();
  }

  protected async getTabOrActive(tabId?: number): Promise<chrome.tabs.Tab> {
    const explicit = await this.tryGetTab(tabId);
    return explicit || this.getActiveTabOrThrow();
  }

  protected async sleep(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }
}
