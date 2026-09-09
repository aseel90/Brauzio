import { createErrorResponse, type ToolResult } from '@/common/tool-handler';
import { BaseBrowserToolExecutor } from '../base-browser';
import { TOOL_NAMES } from 'brauzio-shared';
import { cdpRouter } from '@/utils/cdp-router';

type Orientation = 'portrait' | 'landscape';
type DeviceModeAction = 'list_presets' | 'apply' | 'custom' | 'status' | 'reset';

interface DevicePreset {
  width: number;
  height: number;
  deviceScaleFactor: number;
  mobile: boolean;
  touch: boolean;
  label: string;
  userAgent?: string;
  platform?: string;
}

interface DeviceModeParams {
  action: DeviceModeAction;
  preset?: string;
  orientation?: Orientation;
  width?: number;
  height?: number;
  deviceScaleFactor?: number;
  mobile?: boolean;
  touch?: boolean;
  userAgent?: string;
  platform?: string;
  tabId?: number;
  windowId?: number;
}

interface ActiveDeviceMode {
  owner: string;
  preset?: string;
  orientation: Orientation;
  width: number;
  height: number;
  deviceScaleFactor: number;
  mobile: boolean;
  touch: boolean;
  userAgentApplied: boolean;
  userAgent?: string;
  platform?: string;
  originalUserAgent?: string;
  originalPlatform?: string;
  appliedAt: number;
}

const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const ANDROID_UA = 'Mozilla/5.0 (Linux; Android 15; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36';
const IPAD_UA = 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

const PRESETS: Record<string, DevicePreset> = {
  iphone_se: { label: 'iPhone SE', width: 375, height: 667, deviceScaleFactor: 2, mobile: true, touch: true, userAgent: IPHONE_UA, platform: 'iPhone' },
  iphone_14: { label: 'iPhone 14', width: 390, height: 844, deviceScaleFactor: 3, mobile: true, touch: true, userAgent: IPHONE_UA, platform: 'iPhone' },
  iphone_14_pro_max: { label: 'iPhone 14 Pro Max', width: 430, height: 932, deviceScaleFactor: 3, mobile: true, touch: true, userAgent: IPHONE_UA, platform: 'iPhone' },
  iphone_15_pro: { label: 'iPhone 15 Pro', width: 393, height: 852, deviceScaleFactor: 3, mobile: true, touch: true, userAgent: IPHONE_UA, platform: 'iPhone' },
  pixel_7: { label: 'Google Pixel 7', width: 412, height: 915, deviceScaleFactor: 2.625, mobile: true, touch: true, userAgent: ANDROID_UA, platform: 'Linux armv8l' },
  pixel_9: { label: 'Google Pixel 9', width: 412, height: 923, deviceScaleFactor: 2.625, mobile: true, touch: true, userAgent: ANDROID_UA, platform: 'Linux armv8l' },
  galaxy_s23: { label: 'Samsung Galaxy S23', width: 360, height: 780, deviceScaleFactor: 3, mobile: true, touch: true, userAgent: ANDROID_UA, platform: 'Linux armv8l' },
  galaxy_s24: { label: 'Samsung Galaxy S24', width: 360, height: 780, deviceScaleFactor: 3, mobile: true, touch: true, userAgent: ANDROID_UA, platform: 'Linux armv8l' },
  ipad_mini: { label: 'iPad Mini', width: 768, height: 1024, deviceScaleFactor: 2, mobile: true, touch: true, userAgent: IPAD_UA, platform: 'iPad' },
  ipad_air: { label: 'iPad Air', width: 820, height: 1180, deviceScaleFactor: 2, mobile: true, touch: true, userAgent: IPAD_UA, platform: 'iPad' },
  ipad_pro_11: { label: 'iPad Pro 11', width: 834, height: 1194, deviceScaleFactor: 2, mobile: true, touch: true, userAgent: IPAD_UA, platform: 'iPad' },
  laptop_1366: { label: 'Laptop 1366×768', width: 1366, height: 768, deviceScaleFactor: 1, mobile: false, touch: false },
  desktop_1440: { label: 'Desktop 1440×900', width: 1440, height: 900, deviceScaleFactor: 1, mobile: false, touch: false },
};

const activeModes = new Map<number, ActiveDeviceMode>();
const RESET_STORAGE_PREFIX = 'brauzio-device-mode-reset-v1:';
const STATE_STORAGE_PREFIX = 'brauzio-device-mode-state-v2:';

function resetStorageKey(tabId: number): string {
  return `${RESET_STORAGE_PREFIX}${tabId}`;
}

function stateStorageKey(tabId: number): string {
  return `${STATE_STORAGE_PREFIX}${tabId}`;
}

async function setResetMarker(tabId: number, active: boolean): Promise<void> {
  const key = resetStorageKey(tabId);
  if (active) await chrome.storage.session.set({ [key]: true });
  else await chrome.storage.session.remove(key);
}

async function hasResetMarker(tabId: number): Promise<boolean> {
  try {
    const key = resetStorageKey(tabId);
    const stored = await chrome.storage.session.get(key);
    return stored[key] === true;
  } catch {
    return false;
  }
}

async function persistState(tabId: number, state?: ActiveDeviceMode): Promise<void> {
  try {
    const key = stateStorageKey(tabId);
    if (state) await chrome.storage.session.set({ [key]: state });
    else await chrome.storage.session.remove(key);
  } catch {}
}

async function loadState(tabId: number): Promise<ActiveDeviceMode | undefined> {
  const memory = activeModes.get(tabId);
  if (memory) return memory;
  try {
    const key = stateStorageKey(tabId);
    const stored = await chrome.storage.session.get(key);
    const state = stored[key] as ActiveDeviceMode | undefined;
    if (state) activeModes.set(tabId, state);
    return state;
  } catch {
    return undefined;
  }
}

function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(min, Math.min(Math.round(numeric), max));
}

function clampDpr(value: unknown, fallback: number): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(0.5, Math.min(numeric, 5));
}

function orientedSize(width: number, height: number, orientation: Orientation) {
  return orientation === 'landscape'
    ? { width: Math.max(width, height), height: Math.min(width, height) }
    : { width: Math.min(width, height), height: Math.max(width, height) };
}

async function currentIdentity(tabId: number): Promise<{ userAgent?: string; platform?: string }> {
  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId },
      world: 'ISOLATED',
      func: () => ({ userAgent: navigator.userAgent, platform: navigator.platform }),
    });
    return (result?.result || {}) as { userAgent?: string; platform?: string };
  } catch {
    return {};
  }
}

async function clearDeviceOverrides(tabId: number, state?: ActiveDeviceMode): Promise<void> {
  const clearOverrides = async () => {
    await cdpRouter.sendCommand(tabId, 'Emulation.clearDeviceMetricsOverride').catch(() => undefined);
    await cdpRouter.sendCommand(tabId, 'Emulation.setTouchEmulationEnabled', { enabled: false }).catch(() => undefined);
    if (state?.userAgentApplied && state.originalUserAgent) {
      await cdpRouter.sendCommand(tabId, 'Emulation.setUserAgentOverride', {
        userAgent: state.originalUserAgent,
        platform: state.originalPlatform || '',
      }).catch(() => undefined);
    }
  };
  try {
    if (cdpRouter.hasSession(tabId)) await clearOverrides();
    else await cdpRouter.withSession(tabId, `device-reset:${tabId}`, clearOverrides);
  } catch {
    // A navigation may temporarily replace the target. The reset marker causes
    // another cleanup attempt on the next loading/complete transition.
  }
}

async function releaseMode(tabId: number): Promise<void> {
  const state = await loadState(tabId);
  const owner = state?.owner || `device-mode:${tabId}`;
  activeModes.delete(tabId);

  await clearDeviceOverrides(tabId, state);
  await persistState(tabId, undefined);

  try {
    let refs = cdpRouter.getSessionSnapshot(tabId)[0]?.owners?.[owner] || 0;
    while (refs > 0) {
      await cdpRouter.detach(tabId, owner);
      refs = cdpRouter.getSessionSnapshot(tabId)[0]?.owners?.[owner] || 0;
    }
  } catch {}
}

chrome.tabs.onRemoved.addListener((tabId) => {
  void releaseMode(tabId);
  void setResetMarker(tabId, false);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status !== 'loading' && changeInfo.status !== 'complete') return;
  void (async () => {
    if (!(await hasResetMarker(tabId))) return;
    await releaseMode(tabId);
  })();
});

class DeviceModeTool extends BaseBrowserToolExecutor {
  name = TOOL_NAMES.BROWSER.DEVICE_MODE;

  private async getTab(args: DeviceModeParams): Promise<chrome.tabs.Tab | null> {
    const explicit = await this.tryGetTab(args.tabId);
    if (explicit) return explicit;
    return await this.getActiveTabInWindow(args.windowId);
  }

  async execute(args: DeviceModeParams): Promise<ToolResult> {
    const action = args.action;

    if (action === 'list_presets') {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            presets: Object.entries(PRESETS).map(([id, preset]) => ({ id, ...preset })),
          }),
        }],
        isError: false,
      };
    }

    const tab = await this.getTab(args);
    if (!tab?.id) return createErrorResponse('No target tab found');
    const tabId = tab.id;

    if (action === 'status') {
      const resetMarked = await hasResetMarker(tabId);
      const state = resetMarked ? undefined : await loadState(tabId);
      let metrics: unknown = undefined;
      let identity: unknown = undefined;
      try {
        if (state) metrics = await cdpRouter.sendCommand(tabId, 'Page.getLayoutMetrics');
        identity = await currentIdentity(tabId);
      } catch {}
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            tabId,
            active: Boolean(state),
            resetMarked,
            mode: state || null,
            identity,
            metrics,
          }),
        }],
        isError: false,
      };
    }

    if (action === 'reset') {
      await setResetMarker(tabId, true);
      await releaseMode(tabId);
      await setResetMarker(tabId, false);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ success: true, tabId, active: false, reset: true }),
        }],
        isError: false,
      };
    }

    let base: DevicePreset;
    let presetName: string | undefined;
    if (action === 'apply') {
      const requestedPreset = String(args.preset || '').trim();
      const normalizedPreset = requestedPreset.toLowerCase().replace(/[\s_-]+/g, '');
      const match = Object.entries(PRESETS).find(([id, preset]) => {
        const normalizedId = id.toLowerCase().replace(/[\s_-]+/g, '');
        const normalizedLabel = preset.label.toLowerCase().replace(/[\s_-]+/g, '');
        return requestedPreset === id || normalizedPreset === normalizedId || normalizedPreset === normalizedLabel;
      });
      if (!match) return createErrorResponse(`Unknown device preset: ${requestedPreset}`);
      [presetName, base] = match;
    } else if (action === 'custom') {
      const width = clampInt(args.width, 390, 240, 3840);
      const height = clampInt(args.height, 844, 240, 3840);
      base = {
        label: 'Custom',
        width,
        height,
        deviceScaleFactor: clampDpr(args.deviceScaleFactor, 1),
        mobile: args.mobile === true,
        touch: args.touch === true,
        userAgent: args.userAgent ? String(args.userAgent).slice(0, 1024) : undefined,
        platform: args.platform ? String(args.platform).slice(0, 128) : undefined,
      };
    } else {
      return createErrorResponse(`Unsupported chrome_device_mode action: ${String(action)}`);
    }

    await setResetMarker(tabId, false);
    const orientation: Orientation = args.orientation === 'landscape' ? 'landscape' : 'portrait';
    const size = orientedSize(base.width, base.height, orientation);
    const owner = `device-mode:${tabId}`;
    const existing = await loadState(tabId);
    const originalIdentity = existing
      ? { userAgent: existing.originalUserAgent, platform: existing.originalPlatform }
      : await currentIdentity(tabId);

    if (!existing) await cdpRouter.attach(tabId, owner);

    try {
      await cdpRouter.sendCommand(tabId, 'Emulation.setDeviceMetricsOverride', {
        width: size.width,
        height: size.height,
        deviceScaleFactor: base.deviceScaleFactor,
        mobile: base.mobile,
        screenWidth: size.width,
        screenHeight: size.height,
        screenOrientation: {
          type: orientation === 'landscape' ? 'landscapePrimary' : 'portraitPrimary',
          angle: orientation === 'landscape' ? 90 : 0,
        },
      });
      await cdpRouter.sendCommand(tabId, 'Emulation.setTouchEmulationEnabled', {
        enabled: base.touch,
        maxTouchPoints: base.touch ? 5 : 1,
      });
      if (base.userAgent) {
        await cdpRouter.sendCommand(tabId, 'Emulation.setUserAgentOverride', {
          userAgent: base.userAgent,
          platform: base.platform || '',
          acceptLanguage: 'en-US,en;q=0.9',
        });
      }

      const state: ActiveDeviceMode = {
        owner,
        preset: presetName,
        orientation,
        width: size.width,
        height: size.height,
        deviceScaleFactor: base.deviceScaleFactor,
        mobile: base.mobile,
        touch: base.touch,
        userAgentApplied: Boolean(base.userAgent),
        userAgent: base.userAgent,
        platform: base.platform,
        originalUserAgent: originalIdentity.userAgent,
        originalPlatform: originalIdentity.platform,
        appliedAt: Date.now(),
      };
      activeModes.set(tabId, state);
      await persistState(tabId, state);

      const metrics = await cdpRouter.sendCommand(tabId, 'Page.getLayoutMetrics').catch(() => undefined);
      const identity = await currentIdentity(tabId);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            tabId,
            active: true,
            label: base.label,
            mode: state,
            identity,
            metrics,
          }),
        }],
        isError: false,
      };
    } catch (error) {
      await setResetMarker(tabId, true);
      await clearDeviceOverrides(tabId, {
        owner,
        preset: presetName,
        orientation,
        width: size.width,
        height: size.height,
        deviceScaleFactor: base.deviceScaleFactor,
        mobile: base.mobile,
        touch: base.touch,
        userAgentApplied: Boolean(base.userAgent),
        originalUserAgent: originalIdentity.userAgent,
        originalPlatform: originalIdentity.platform,
        appliedAt: Date.now(),
      });
      if (!existing) await cdpRouter.detach(tabId, owner).catch(() => undefined);
      await persistState(tabId, existing);
      if (existing) activeModes.set(tabId, existing);
      else activeModes.delete(tabId);
      await setResetMarker(tabId, false);
      return createErrorResponse(
        `Device emulation failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}

export const deviceModeTool = new DeviceModeTool();
