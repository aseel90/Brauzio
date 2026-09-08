import { liveViewTool } from './tools/browser/live-view';

type PopupLiveAction = 'start' | 'status' | 'stop';

const POPUP_LIVE_TAB_KEY = 'brauzio-popup-live-view-tab-v1';

function isCapturableWebTab(tab: chrome.tabs.Tab | undefined): tab is chrome.tabs.Tab & { id: number } {
  return Boolean(
    tab
      && typeof tab.id === 'number'
      && typeof tab.url === 'string'
      && /^https?:\/\//i.test(tab.url),
  );
}

async function storedLiveTab(): Promise<(chrome.tabs.Tab & { id: number }) | undefined> {
  try {
    const stored = await chrome.storage.session.get(POPUP_LIVE_TAB_KEY);
    const tabId = Number(stored[POPUP_LIVE_TAB_KEY]);
    if (!Number.isFinite(tabId)) return undefined;
    const tab = await chrome.tabs.get(tabId).catch(() => undefined);
    return isCapturableWebTab(tab) ? tab : undefined;
  } catch {
    return undefined;
  }
}

async function rememberLiveTab(tabId: number | null): Promise<void> {
  if (tabId == null) await chrome.storage.session.remove(POPUP_LIVE_TAB_KEY);
  else await chrome.storage.session.set({ [POPUP_LIVE_TAB_KEY]: tabId });
}

async function resolveLiveTab(action: PopupLiveAction): Promise<chrome.tabs.Tab & { id: number }> {
  if (action !== 'start') {
    const stored = await storedLiveTab();
    if (stored) return stored;
  }

  const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (isCapturableWebTab(active)) {
    await rememberLiveTab(active.id);
    return active;
  }

  const tabs = await chrome.tabs.query({ currentWindow: true });
  const candidates = tabs
    .filter(isCapturableWebTab)
    .sort((a, b) => Number(b.lastAccessed || 0) - Number(a.lastAccessed || 0));
  if (candidates[0]) {
    await rememberLiveTab(candidates[0].id);
    return candidates[0];
  }

  throw new Error('لا يمكن تشغيل البث على صفحات Chrome أو صفحات الإضافة. افتح تبويب ويب عادي يبدأ بـ http أو https ثم أعد المحاولة.');
}

function localizeLiveViewError(message: string): string {
  if (/protected browser or extension pages/i.test(message)) {
    return 'لا يمكن تشغيل البث على صفحات Chrome أو صفحات الإضافة. افتح تبويب ويب عادي ثم أعد المحاولة.';
  }
  return message;
}

async function runLiveViewAction(action: PopupLiveAction, options: Record<string, unknown> = {}) {
  const tab = await resolveLiveTab(action);
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
    try { payload = JSON.parse(rawText); }
    catch { payload = { message: rawText }; }
  }

  if (result.isError) {
    const message = String(payload.error || payload.message || rawText || 'تعذر تنفيذ أمر Live View');
    throw new Error(localizeLiveViewError(message));
  }
  if (action === 'stop') await rememberLiveTab(null);
  return { ...payload, selectedTabId: tab.id, selectedUrl: tab.url };
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
