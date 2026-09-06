import { cdpSessionManager } from '@/utils/cdp-session-manager';

type Point = { x: number; y: number };

type ReleaseOptions = {
  point?: Point;
  reason?: string;
  force?: boolean;
};

const HELD_OWNER = 'brauzio-mouse-hold';
const heldMouseTabs = new Map<number, { point: Point; pressedAt: number }>();
let listenersInstalled = false;

function safePoint(point?: Point): Point {
  return {
    x: Number.isFinite(point?.x) ? Math.round(point!.x) : 0,
    y: Number.isFinite(point?.y) ? Math.round(point!.y) : 0,
  };
}

export function isMouseHeld(tabId: number): boolean {
  return heldMouseTabs.has(tabId);
}

export function updateMouseHoldPoint(tabId: number, point: Point): void {
  const state = heldMouseTabs.get(tabId);
  if (!state) return;
  state.point = safePoint(point);
}

export async function beginMouseHold(tabId: number, point: Point): Promise<void> {
  if (heldMouseTabs.has(tabId)) {
    updateMouseHoldPoint(tabId, point);
    return;
  }

  await cdpSessionManager.attach(tabId, HELD_OWNER);
  heldMouseTabs.set(tabId, { point: safePoint(point), pressedAt: Date.now() });
}

export async function releaseMouseHold(
  tabId: number,
  options: ReleaseOptions = {},
): Promise<{ released: boolean; dispatched: boolean; reason: string }> {
  const state = heldMouseTabs.get(tabId);
  const reason = options.reason || 'unspecified';
  if (!state && !options.force) return { released: false, dispatched: false, reason };

  // Delete first so duplicate cleanup paths (socket close + tab event, for example)
  // cannot race and retain a logical held state.
  heldMouseTabs.delete(tabId);
  const point = safePoint(options.point || state?.point);
  let dispatched = false;

  try {
    await cdpSessionManager.sendCommand(tabId, 'Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x: point.x,
      y: point.y,
      button: 'left',
      buttons: 0,
      clickCount: 1,
    });
    dispatched = true;
  } catch {
    // The tab may already be gone or navigating. Cleanup below is still required.
  } finally {
    if (state) {
      await cdpSessionManager.detach(tabId, HELD_OWNER).catch(() => {});
    }
  }

  return { released: Boolean(state) || Boolean(options.force), dispatched, reason };
}

export async function releaseAllMouseHolds(reason = 'emergency'): Promise<number> {
  const tabIds = [...heldMouseTabs.keys()];
  if (!tabIds.length) return 0;
  await Promise.allSettled(tabIds.map((tabId) => releaseMouseHold(tabId, { reason })));
  return tabIds.length;
}

export function forgetMouseHold(tabId: number): void {
  heldMouseTabs.delete(tabId);
}

export function initMouseHoldSafetyListeners(): void {
  if (listenersInstalled) return;
  listenersInstalled = true;

  chrome.tabs.onRemoved.addListener((tabId) => {
    void releaseMouseHold(tabId, { reason: 'tab_closed' });
  });

  chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.status === 'loading' || typeof changeInfo.url === 'string') {
      void releaseMouseHold(tabId, { reason: 'navigation' });
    }
  });

  chrome.debugger.onDetach.addListener((source) => {
    if (typeof source.tabId === 'number') forgetMouseHold(source.tabId);
  });

  chrome.runtime.onSuspend.addListener(() => {
    void releaseAllMouseHolds('service_worker_suspend');
  });
}
