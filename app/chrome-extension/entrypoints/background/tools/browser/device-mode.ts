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
  appliedAt: number;
}

const PRESETS: Record<string, DevicePreset> = {
  iphone_se: { label: 'iPhone SE', width: 375, height: 667, deviceScaleFactor: 2, mobile: true, touch: true },
  iphone_14: { label: 'iPhone 14', width: 390, height: 844, deviceScaleFactor: 3, mobile: true, touch: true },
  iphone_14_pro_max: { label: 'iPhone 14 Pro Max', width: 430, height: 932, deviceScaleFactor: 3, mobile: true, touch: true },
  pixel_7: { label: 'Google Pixel 7', width: 412, height: 915, deviceScaleFactor: 2.625, mobile: true, touch: true },
  galaxy_s23: { label: 'Samsung Galaxy S23', width: 360, height: 780, deviceScaleFactor: 3, mobile: true, touch: true },
  ipad_mini: { label: 'iPad Mini', width: 768, height: 1024, deviceScaleFactor: 2, mobile: true, touch: true },
  ipad_pro_11: { label: 'iPad Pro 11', width: 834, height: 1194, deviceScaleFactor: 2, mobile: true, touch: true },
  laptop_1366: { label: 'Laptop 1366×768', width: 1366, height: 768, deviceScaleFactor: 1, mobile: false, touch: false },
  desktop_1440: { label: 'Desktop 1440×900', width: 1440, height: 900, deviceScaleFactor: 1, mobile: false, touch: false },
};

const activeModes = new Map<number, ActiveDeviceMode>();
const RESET_STORAGE_PREFIX = 'brauzio-device-mode-reset-v1:';

function resetStorageKey(tabId: number): string {
  return `${RESET_STORAGE_PREFIX}${tabId}`;
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

async function clearDeviceOverrides(tabId: number): Promise<void> {
  const clearOverrides = async () => {
    await cdpRouter.sendCommand(tabId, 'Emulation.clearDeviceMetricsOverride');
    await cdpRouter.sendCommand(tabId, 'Emulation.setTouchEmulationEnabled', { enabled: false });
  };
  try {
    if (cdpRouter.hasSession(tabId)) await clearOverrides();
    else await cdpRouter.withSession(tabId, `device-reset:${tabId}`, clearOverrides);
  } catch {
    // A navigation may temporarily replace the target. The onUpdated listener
    // retries on the next loading/complete transition when reset is marked.
  }
}

async function releaseMode(tabId: number): Promise<void> {
  const state = activeModes.get(tabId);
  const owner = state?.owner || `device-mode:${tabId}`;
  activeModes.delete(tabId);

  await clearDeviceOverrides(tabId);

  // Release every stale/ref-counted Device Mode owner without disturbing
  // other CDP owners such as watches or raw CDP sessions.
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
    activeModes.delete(tabId);
    await clearDeviceOverrides(tabId);
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
      const state = resetMarked ? undefined : activeModes.get(tabId);
      let metrics: unknown = undefined;
      try {
        if (state) metrics = await cdpRouter.sendCommand(tabId, 'Page.getLayoutMetrics');
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
            metrics,
          }),
        }],
        isError: false,
      };
    }

    if (action === 'reset') {
      await setResetMarker(tabId, true);
      await releaseMode(tabId);
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
      };
    } else {
      return createErrorResponse(`Unsupported chrome_device_mode action: ${String(action)}`);
    }

    await setResetMarker(tabId, false);
    const orientation: Orientation = args.orientation === 'landscape' ? 'landscape' : 'portrait';
    const size = orientedSize(base.width, base.height, orientation);
    const owner = `device-mode:${tabId}`;

    const existing = activeModes.get(tabId);
    if (!existing) {
      await cdpRouter.attach(tabId, owner);
    }

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

      const state: ActiveDeviceMode = {
        owner,
        preset: presetName,
        orientation,
        width: size.width,
        height: size.height,
        deviceScaleFactor: base.deviceScaleFactor,
        mobile: base.mobile,
        touch: base.touch,
        appliedAt: Date.now(),
      };
      activeModes.set(tabId, state);

      const metrics = await cdpRouter.sendCommand(tabId, 'Page.getLayoutMetrics').catch(() => undefined);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            tabId,
            active: true,
            label: base.label,
            mode: state,
            metrics,
          }),
        }],
        isError: false,
      };
    } catch (error) {
      if (!existing) await releaseMode(tabId);
      return createErrorResponse(
        `Device emulation failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}

export const deviceModeTool = new DeviceModeTool();
