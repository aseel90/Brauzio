import { createErrorResponse, ToolResult } from '@/common/tool-handler';
import { BaseBrowserToolExecutor } from '../base-browser';
import { TOOL_NAMES } from 'brauzio-shared';
import { screenshotContextManager } from '@/utils/screenshot-context';

const CAPTURE_TIMEOUT_MS = 7000;
const METADATA_TIMEOUT_MS = 2500;
const DEFAULT_JPEG_QUALITY = 65;
const MAX_CAPTURE_HEIGHT_PX = 50000;

interface ScreenshotToolParams {
  name?: string;
  selector?: string;
  tabId?: number;
  background?: boolean;
  windowId?: number;
  width?: number;
  height?: number;
  storeBase64?: boolean;
  returnImage?: boolean;
  fullPage?: boolean;
  savePng?: boolean;
  maxHeight?: number;
}

interface CaptureResult {
  dataUrl: string;
  mimeType: 'image/jpeg' | 'image/png';
  width?: number;
  height?: number;
  dpr?: number;
  delivery: 'capture-visible-tab' | 'cdp';
}

interface RectInfo {
  x: number;
  y: number;
  width: number;
  height: number;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`${label} timed out after ${timeoutMs}ms`)),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function mimeFor(format: 'jpeg' | 'png'): 'image/jpeg' | 'image/png' {
  return format === 'jpeg' ? 'image/jpeg' : 'image/png';
}

function stripDataUrl(dataUrl: string): string {
  return dataUrl.replace(/^data:image\/[^;]+;base64,/, '');
}

class ScreenshotTool extends BaseBrowserToolExecutor {
  name = TOOL_NAMES.BROWSER.SCREENSHOT;

  async execute(args: ScreenshotToolParams): Promise<ToolResult> {
    const name = args.name || 'screenshot';
    const fullPage = args.fullPage === true;
    const selector = args.selector?.trim() || undefined;
    const returnImage = args.returnImage !== false;
    const storeBase64 = args.storeBase64 === true;
    const savePng = args.savePng === true;

    const explicit = await this.tryGetTab(args.tabId);
    const tab = explicit || (await this.getActiveTabOrThrowInWindow(args.windowId));
    if (typeof tab.id !== 'number' || typeof tab.windowId !== 'number') {
      return createErrorResponse('Screenshot error: target tab is unavailable.');
    }

    if (
      tab.url?.startsWith('chrome://') ||
      tab.url?.startsWith('edge://') ||
      tab.url?.startsWith('https://chrome.google.com/webstore') ||
      tab.url?.startsWith('https://microsoftedge.microsoft.com/')
    ) {
      return createErrorResponse(
        'Cannot capture special browser pages or web store pages due to security restrictions.',
      );
    }

    try {
      const format: 'jpeg' | 'png' = savePng ? 'png' : 'jpeg';
      const requiresCdp =
        args.background === true || fullPage || Boolean(selector) || tab.active !== true;

      const capture = requiresCdp
        ? await this.captureWithCdp(tab.id, format, args, selector)
        : await this.captureVisible(tab, format);

      this.updateScreenshotContext(tab, capture);

      const base64 = stripDataUrl(capture.dataUrl);
      if (!base64) throw new Error('Captured image payload is empty');

      const results: Record<string, unknown> = {
        base64: null,
        fileSaved: false,
        delivery: capture.delivery,
        width: capture.width,
        height: capture.height,
      };

      if (storeBase64) {
        results.base64 = base64;
        results.base64MimeType = capture.mimeType;
      }

      if (savePng) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `${name.replace(/[^a-z0-9_-]/gi, '_') || 'screenshot'}_${timestamp}.png`;
        const downloadId = await chrome.downloads.download({
          url: capture.dataUrl,
          filename,
          saveAs: false,
        });
        results.downloadId = downloadId;
        results.filename = filename;
        results.fileSaved = true;
      }

      const content: ToolResult['content'] = [
        {
          type: 'text',
          text: JSON.stringify({
            success: true,
            message: `Screenshot [${name}] captured successfully`,
            tabId: tab.id,
            url: tab.url,
            name,
            returnedImage: returnImage,
            ...results,
          }),
        },
      ];

      if (returnImage) {
        content.push({ type: 'image', data: base64, mimeType: capture.mimeType });
      }
      return { content, isError: false };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[Screenshot Tool] failed:', message);
      return createErrorResponse(`Screenshot error: ${message}`);
    }
  }

  private async captureVisible(
    tab: chrome.tabs.Tab,
    format: 'jpeg' | 'png',
  ): Promise<CaptureResult> {
    const options: { format: 'jpeg' | 'png'; quality?: number } = { format };
    if (format === 'jpeg') options.quality = DEFAULT_JPEG_QUALITY;

    const dataUrl = await withTimeout(
      chrome.tabs.captureVisibleTab(tab.windowId, options),
      CAPTURE_TIMEOUT_MS,
      'Visible viewport screenshot',
    );
    if (!dataUrl) throw new Error('captureVisibleTab returned empty data');

    let width: number | undefined;
    let height: number | undefined;
    let dpr: number | undefined;
    try {
      const [result] = await withTimeout(
        chrome.scripting.executeScript({
          target: { tabId: tab.id! },
          func: () => ({
            width: window.innerWidth,
            height: window.innerHeight,
            dpr: window.devicePixelRatio || 1,
          }),
        }),
        METADATA_TIMEOUT_MS,
        'Viewport metadata',
      );
      const meta = result?.result as
        | { width?: number; height?: number; dpr?: number }
        | undefined;
      width = typeof meta?.width === 'number' ? meta.width : undefined;
      height = typeof meta?.height === 'number' ? meta.height : undefined;
      dpr = typeof meta?.dpr === 'number' ? meta.dpr : undefined;
    } catch (error) {
      console.warn('[Screenshot Tool] viewport metadata unavailable:', error);
    }

    return {
      dataUrl,
      mimeType: mimeFor(format),
      width,
      height,
      dpr,
      delivery: 'capture-visible-tab',
    };
  }

  private async captureWithCdp(
    tabId: number,
    format: 'jpeg' | 'png',
    args: ScreenshotToolParams,
    selector?: string,
  ): Promise<CaptureResult> {
    const { cdpSessionManager } = await import('@/utils/cdp-session-manager');

    return await withTimeout(
      cdpSessionManager.withSession(tabId, 'screenshot', async () => {
        const metrics: any = await cdpSessionManager.sendCommand(
          tabId,
          'Page.getLayoutMetrics',
          {},
        );

        const viewport = metrics?.layoutViewport || metrics?.visualViewport || {};
        const contentSize = metrics?.cssContentSize || metrics?.contentSize || {};
        let clip: RectInfo | undefined;

        if (selector) {
          clip = await this.resolveSelectorRect(tabId, selector);
        } else if (args.fullPage === true) {
          const width = Number(contentSize.width || viewport.clientWidth || 800);
          const requestedMax = Number(args.maxHeight || MAX_CAPTURE_HEIGHT_PX);
          const height = Math.min(
            Number(contentSize.height || viewport.clientHeight || 600),
            Math.max(1, requestedMax),
          );
          clip = { x: 0, y: 0, width, height };
        }

        const params: Record<string, unknown> = {
          format,
          captureBeyondViewport: true,
          fromSurface: true,
        };
        if (format === 'jpeg') params.quality = DEFAULT_JPEG_QUALITY;
        if (clip) params.clip = { ...clip, scale: 1 };

        const shot: any = await cdpSessionManager.sendCommand(
          tabId,
          'Page.captureScreenshot',
          params,
        );
        const base64 = typeof shot?.data === 'string' ? shot.data : '';
        if (!base64) throw new Error('CDP Page.captureScreenshot returned empty data');

        return {
          dataUrl: `data:${mimeFor(format)};base64,${base64}`,
          mimeType: mimeFor(format),
          width: clip?.width || Number(viewport.clientWidth || 800),
          height: clip?.height || Number(viewport.clientHeight || 600),
          dpr: 1,
          delivery: 'cdp' as const,
        };
      }),
      CAPTURE_TIMEOUT_MS,
      'CDP screenshot',
    );
  }

  private async resolveSelectorRect(tabId: number, selector: string): Promise<RectInfo> {
    const [result] = await withTimeout(
      chrome.scripting.executeScript({
        target: { tabId },
        args: [selector],
        func: (value: string) => {
          const element = document.querySelector(value);
          if (!element) return { error: `Element not found: ${value}` };
          const rect = element.getBoundingClientRect();
          return {
            x: rect.left + window.scrollX,
            y: rect.top + window.scrollY,
            width: rect.width,
            height: rect.height,
          };
        },
      }),
      METADATA_TIMEOUT_MS,
      'Selector lookup',
    );

    const value = result?.result as (RectInfo & { error?: string }) | undefined;
    if (value?.error) throw new Error(value.error);
    if (
      !value ||
      !Number.isFinite(value.x) ||
      !Number.isFinite(value.y) ||
      !Number.isFinite(value.width) ||
      !Number.isFinite(value.height) ||
      value.width <= 0 ||
      value.height <= 0
    ) {
      throw new Error(`Invalid element bounds for selector: ${selector}`);
    }
    return { x: value.x, y: value.y, width: value.width, height: value.height };
  }

  private updateScreenshotContext(tab: chrome.tabs.Tab, capture: CaptureResult): void {
    if (
      typeof tab.id !== 'number' ||
      typeof capture.width !== 'number' ||
      typeof capture.height !== 'number'
    ) {
      return;
    }
    let hostname = '';
    try {
      hostname = tab.url ? new URL(tab.url).hostname : '';
    } catch {
      // Ignore malformed URL metadata.
    }
    screenshotContextManager.setContext(tab.id, {
      screenshotWidth: capture.width,
      screenshotHeight: capture.height,
      viewportWidth: capture.width,
      viewportHeight: capture.height,
      devicePixelRatio: capture.dpr || 1,
      hostname,
    });
  }
}

export const screenshotTool = new ScreenshotTool();
