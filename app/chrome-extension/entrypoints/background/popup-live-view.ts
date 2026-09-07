import { liveViewTool } from './tools/browser/live-view';

type PopupLiveAction = 'start' | 'status' | 'stop';

async function runLiveViewAction(action: PopupLiveAction, options: Record<string, unknown> = {}) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error('لم يتم العثور على تبويب نشط');

  const result = await liveViewTool.execute({
    action,
    tabId: tab.id,
    intervalMs: options.intervalMs,
    scale: options.scale,
    quality: options.quality,
    maxFrames: options.maxFrames,
  } as any);

  const textItem = (result.content as any[])?.find((item) => item?.type === 'text');
  const rawText = typeof textItem?.text === 'string' ? textItem.text : '';
  let payload: Record<string, unknown> = {};
  if (rawText) {
    try {
      payload = JSON.parse(rawText);
    } catch {
      payload = { message: rawText };
    }
  }

  if (result.isError) {
    throw new Error(String(payload.error || payload.message || rawText || 'تعذر تنفيذ أمر Live View'));
  }
  return payload;
}

export function initPopupLiveViewControls() {
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || typeof message.type !== 'string') return false;

    if (message.type === 'brauzio_live_view_get_status') {
      void runLiveViewAction('status')
        .then((status) => sendResponse({ success: true, status }))
        .catch((error) => sendResponse({ success: false, error: error instanceof Error ? error.message : String(error) }));
      return true;
    }

    if (message.type === 'brauzio_live_view_start') {
      void runLiveViewAction('start', message.options || {})
        .then((status) => sendResponse({ success: true, status }))
        .catch((error) => sendResponse({ success: false, error: error instanceof Error ? error.message : String(error) }));
      return true;
    }

    if (message.type === 'brauzio_live_view_stop') {
      void runLiveViewAction('stop')
        .then((status) => sendResponse({ success: true, status }))
        .catch((error) => sendResponse({ success: false, error: error instanceof Error ? error.message : String(error) }));
      return true;
    }

    return false;
  });
}
