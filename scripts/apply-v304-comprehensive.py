from pathlib import Path
import json
import re


def read(path: str) -> str:
    return Path(path).read_text(encoding='utf-8')


def write(path: str, text: str) -> None:
    Path(path).write_text(text, encoding='utf-8')


def replace_once(path: str, old: str, new: str) -> None:
    text = read(path)
    if old not in text:
        raise SystemExit(f'Expected text not found in {path}: {old[:120]!r}')
    write(path, text.replace(old, new, 1))


# 1) Cloud -> ChatGPT: unwrap Durable Object tool result envelopes so native
# image items from Screenshot / Observe / Act survive as MCP image content.
cloud = 'app/cloudflare-mcp/src/index.ts'
text = read(cloud)
old = """  try {\n    return JSON.parse(raw) as CallToolResult;\n  } catch {\n    return jsonError(raw || 'Browser tool returned an invalid response');\n  }\n"""
new = """  try {\n    const parsed = JSON.parse(raw) as any;\n    const candidate = parsed?.result && typeof parsed.result === 'object'\n      ? parsed.result\n      : parsed;\n    if (candidate && Array.isArray(candidate.content)) {\n      return candidate as CallToolResult;\n    }\n    if (parsed?.error) return jsonError(String(parsed.error));\n    return jsonError('Browser tool returned an invalid MCP result');\n  } catch {\n    return jsonError(raw || 'Browser tool returned an invalid response');\n  }\n"""
if old in text:
    text = text.replace(old, new, 1)
elif 'const candidate = parsed?.result' not in text:
    raise SystemExit('Cloud MCP result unwrap block has an unexpected shape')
text = re.sub(r"const BRAUZIO_RUNTIME_VERSION = '[^']+';", "const BRAUZIO_RUNTIME_VERSION = '3.0.4';", text, count=1)
text = re.sub(r"const BRAUZIO_SCHEMA_VERSION = '[^']+';", "const BRAUZIO_SCHEMA_VERSION = '3.0.4';", text, count=1)
write(cloud, text)


# 2) Popup Live View: never target chrome:// or chrome-extension:// pages.
# Persist the selected web tab so status/stop keep referring to the same stream.
popup_live = '''import { liveViewTool } from './tools/browser/live-view';

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
    .sort((a, b) => Number((b as any).lastAccessed || 0) - Number((a as any).lastAccessed || 0));
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
    try {
      payload = JSON.parse(rawText);
    } catch {
      payload = { message: rawText };
    }
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
'''
write('app/chrome-extension/entrypoints/background/popup-live-view.ts', popup_live)


# 3) Device Mode accepts both stable preset IDs and human labels, while retaining
# the V3 reset marker that prevents emulation from returning after navigation.
device = 'app/chrome-extension/entrypoints/background/tools/browser/device-mode.ts'
old = """    if (action === 'apply') {\n      presetName = String(args.preset || '').trim();\n      base = PRESETS[presetName];\n      if (!base) return createErrorResponse(`Unknown device preset: ${presetName}`);\n    } else if (action === 'custom') {\n"""
new = """    if (action === 'apply') {\n      const requestedPreset = String(args.preset || '').trim();\n      const normalizedPreset = requestedPreset.toLowerCase().replace(/[\\s_-]+/g, '');\n      const match = Object.entries(PRESETS).find(([id, preset]) => {\n        const normalizedId = id.toLowerCase().replace(/[\\s_-]+/g, '');\n        const normalizedLabel = preset.label.toLowerCase().replace(/[\\s_-]+/g, '');\n        return requestedPreset === id || normalizedPreset === normalizedId || normalizedPreset === normalizedLabel;\n      });\n      if (!match) return createErrorResponse(`Unknown device preset: ${requestedPreset}`);\n      [presetName, base] = match;\n    } else if (action === 'custom') {\n"""
replace_once(device, old, new)


# 4) V3 HTML5 Drag: keep trusted pointer movement for native/canvas semantics,
# then dispatch the HTML5 DragEvent sequence with one DataTransfer object. This
# makes standard draggable/drop targets actually receive drop.
action_engine = 'app/chrome-extension/entrypoints/background/runtime-v3/action-engine.ts'
old = """    await send({ type: 'mouseReleased', x: b.center.x, y: b.center.y, button: 'left', buttons: 0, clickCount: 1 });\n  }\n\n\n  private prepareNavigationReady"""
new = """    await send({ type: 'mouseReleased', x: b.center.x, y: b.center.y, button: 'left', buttons: 0, clickCount: 1 });\n    await this.dispatchHtml5Drag(tabId, sourceElement, targetElement);\n  }\n\n  private async dispatchHtml5Drag(tabId: number, sourceElement: V3Element, targetElement: V3Element): Promise<void> {\n    const objectGroup = 'brauzio-v3-html5-drag';\n    const sourceResolved = await this.send<any>(tabId, sourceElement, 'DOM.resolveNode', {\n      backendNodeId: sourceElement.backendNodeId,\n      objectGroup,\n    });\n    const targetResolved = await this.send<any>(tabId, targetElement, 'DOM.resolveNode', {\n      backendNodeId: targetElement.backendNodeId,\n      objectGroup,\n    });\n    const sourceObjectId = sourceResolved?.object?.objectId;\n    const targetObjectId = targetResolved?.object?.objectId;\n    if (!sourceObjectId || !targetObjectId) {\n      await this.send(tabId, sourceElement, 'Runtime.releaseObjectGroup', { objectGroup }).catch(() => undefined);\n      return;\n    }\n    try {\n      const result = await this.send<any>(tabId, sourceElement, 'Runtime.callFunctionOn', {\n        objectId: sourceObjectId,\n        arguments: [{ objectId: targetObjectId }],\n        returnByValue: true,\n        functionDeclaration: `function(target){\n          const source=this;\n          let dataTransfer=null;\n          try { dataTransfer=new DataTransfer(); } catch {}\n          if(dataTransfer){\n            try { dataTransfer.effectAllowed='all'; dataTransfer.dropEffect='move'; } catch {}\n            try { dataTransfer.setData('text/plain', source.id || source.textContent || 'brauzio-drag'); } catch {}\n          }\n          const fire=(node,type)=>{\n            let event;\n            try {\n              event=new DragEvent(type,{bubbles:true,cancelable:true,composed:true,dataTransfer});\n            } catch {\n              event=new Event(type,{bubbles:true,cancelable:true,composed:true});\n              try { Object.defineProperty(event,'dataTransfer',{value:dataTransfer}); } catch {}\n            }\n            node.dispatchEvent(event);\n          };\n          fire(source,'dragstart');\n          fire(target,'dragenter');\n          fire(target,'dragover');\n          fire(target,'drop');\n          fire(source,'dragend');\n          return true;\n        }`,\n      });\n      if (result?.exceptionDetails) {\n        throw new Error(String(result.exceptionDetails.text || 'HTML5 drag dispatch failed'));\n      }\n    } finally {\n      await this.send(tabId, sourceElement, 'Runtime.releaseObjectGroup', { objectGroup }).catch(() => undefined);\n    }\n  }\n\n\n  private prepareNavigationReady"""
replace_once(action_engine, old, new)


# 5) Version the repaired extension and Worker together.
ext_pkg = Path('app/chrome-extension/package.json')
data = json.loads(ext_pkg.read_text(encoding='utf-8'))
data['version'] = '3.0.4'
ext_pkg.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


# 6) Sanity assertions: fail the repair rather than producing another mixed build.
checks = {
    'app/chrome-extension/entrypoints/background/tools/browser/index.ts': [
        "from './v3-runtime'", "from './clipboard'", "from './artifacts'",
    ],
    'packages/shared/src/index.ts': [
        "CLIPBOARD: 'chrome_clipboard'", "ARTIFACTS: 'chrome_artifacts'", 'WATCH_TOOL_SCHEMAS',
    ],
    'packages/shared/src/tools.ts': [
        "OBSERVE: 'chrome_observe'", "RESOLVE: 'chrome_resolve'", "ACT: 'chrome_act'", 'returnImage',
    ],
    'app/chrome-extension/wxt.config.ts': ["'clipboardRead'", "'clipboardWrite'"],
    'app/chrome-extension/entrypoints/background/runtime-v3/observation-service.ts': ['liveTitle', 'liveUrl'],
    'app/chrome-extension/entrypoints/background/tools/browser/screenshot.ts': ['compressionFallback', 'responseImage', 'returnImage = true'],
    'app/chrome-extension/entrypoints/background/tools/browser/device-mode.ts': ['RESET_STORAGE_PREFIX', 'normalizedLabel'],
    'app/cloudflare-mcp/src/index.ts': ["BRAUZIO_RUNTIME_VERSION = '3.0.4'", 'const candidate = parsed?.result'],
}
for path, needles in checks.items():
    content = read(path)
    for needle in needles:
        if needle not in content:
            raise SystemExit(f'Sanity check failed: {needle!r} missing from {path}')

print('Brauzio 3.0.4 comprehensive repair applied and sanity-checked')
