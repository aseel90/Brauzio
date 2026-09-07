from pathlib import Path
import json


def replace(path: str, old: str, new: str, count: int | None = None):
    p = Path(path)
    s = p.read_text(encoding='utf-8')
    if old not in s:
        raise SystemExit(f'expected text not found in {path}: {old[:100]!r}')
    s = s.replace(old, new) if count is None else s.replace(old, new, count)
    p.write_text(s, encoding='utf-8')

# 1) Cloud MCP: unwrap Durable Object's {result: ToolResult} envelope so MCP
# image content reaches ChatGPT as native image content.
replace(
    'app/cloudflare-mcp/src/index.ts',
    """  try {\n    return JSON.parse(raw) as CallToolResult;\n  } catch {\n    return jsonError(raw || 'Browser tool returned an invalid response');\n  }\n""",
    """  try {\n    const parsed = JSON.parse(raw) as any;\n    const candidate = parsed?.result && typeof parsed.result === 'object'\n      ? parsed.result\n      : parsed;\n    if (candidate && Array.isArray(candidate.content)) {\n      return candidate as CallToolResult;\n    }\n    if (parsed?.error) return jsonError(String(parsed.error));\n    return jsonError('Browser tool returned an invalid MCP result');\n  } catch {\n    return jsonError(raw || 'Browser tool returned an invalid response');\n  }\n""",
)

# 2) Device Mode: persist reset intent across service-worker restarts and navigation.
path = 'app/chrome-extension/entrypoints/background/tools/browser/device-mode.ts'
replace(path, "const activeModes = new Map<number, ActiveDeviceMode>();\n", """const activeModes = new Map<number, ActiveDeviceMode>();
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
""")
replace(path, """async function releaseMode(tabId: number): Promise<void> {
  const state = activeModes.get(tabId);
  const owner = state?.owner || `device-mode:${tabId}`;
  activeModes.delete(tabId);

  const clearOverrides = async () => {
    await cdpRouter.sendCommand(tabId, 'Emulation.clearDeviceMetricsOverride');
    await cdpRouter.sendCommand(tabId, 'Emulation.setTouchEmulationEnabled', { enabled: false });
  };

  try {
    if (cdpRouter.hasSession(tabId)) {
      await clearOverrides();
    } else {
      // `activeModes` is in-memory and may be empty after a service-worker
      // lifecycle restart while Chrome still has emulation state. Reset must
      // therefore clear the browser state even when our local map is empty.
      await cdpRouter.withSession(tabId, `device-reset:${tabId}`, clearOverrides);
    }
  } catch {
    // Reset is best-effort for tabs that are closing or no longer debuggable.
  }
""", """async function clearDeviceOverrides(tabId: number): Promise<void> {
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
""")
replace(path, """chrome.tabs.onRemoved.addListener((tabId) => {
  void releaseMode(tabId);
});
""", """chrome.tabs.onRemoved.addListener((tabId) => {
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
""")
replace(path, """    if (action === 'status') {
      const state = activeModes.get(tabId);
""", """    if (action === 'status') {
      const resetMarked = await hasResetMarker(tabId);
      const state = resetMarked ? undefined : activeModes.get(tabId);
""")
replace(path, """            active: Boolean(state),
            mode: state || null,
            metrics,
""", """            active: Boolean(state),
            resetMarked,
            mode: state || null,
            metrics,
""", 1)
replace(path, """    if (action === 'reset') {
      await releaseMode(tabId);
""", """    if (action === 'reset') {
      await setResetMarker(tabId, true);
      await releaseMode(tabId);
""")
replace(path, """    const orientation: Orientation = args.orientation === 'landscape' ? 'landscape' : 'portrait';
""", """    await setResetMarker(tabId, false);
    const orientation: Orientation = args.orientation === 'landscape' ? 'landscape' : 'portrait';
""")

# 3) Clipboard: use extension clipboard permissions via execCommand first.
path = 'app/chrome-extension/entrypoints/offscreen/main.ts'
replace(path, """async function handleClipboard(message: ClipboardMessage): Promise<unknown> {
  if (message.type === 'BRAUZIO_CLIPBOARD_READ') {
    const text = await navigator.clipboard.readText();
    return { success: true, text };
  }
  if (message.type === 'BRAUZIO_CLIPBOARD_WRITE') {
    await navigator.clipboard.writeText(String(message.text ?? ''));
    return { success: true };
  }
  return null;
}
""", """function clipboardTextarea(value = ''): HTMLTextAreaElement {
  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.setAttribute('aria-hidden', 'true');
  textarea.style.position = 'fixed';
  textarea.style.left = '-10000px';
  textarea.style.top = '0';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.focus({ preventScroll: true });
  textarea.select();
  return textarea;
}

function execClipboardWrite(text: string): void {
  const textarea = clipboardTextarea(text);
  try {
    if (!document.execCommand('copy')) throw new Error('execCommand(copy) returned false');
  } finally {
    textarea.remove();
  }
}

function execClipboardRead(): string {
  const textarea = clipboardTextarea();
  try {
    if (!document.execCommand('paste')) throw new Error('execCommand(paste) returned false');
    return textarea.value;
  } finally {
    textarea.remove();
  }
}

async function handleClipboard(message: ClipboardMessage): Promise<unknown> {
  if (message.type === 'BRAUZIO_CLIPBOARD_READ') {
    try {
      return { success: true, text: execClipboardRead(), method: 'execCommand' };
    } catch {
      const text = await navigator.clipboard.readText();
      return { success: true, text, method: 'navigator.clipboard' };
    }
  }
  if (message.type === 'BRAUZIO_CLIPBOARD_WRITE') {
    const text = String(message.text ?? '');
    try {
      execClipboardWrite(text);
      return { success: true, method: 'execCommand' };
    } catch {
      await navigator.clipboard.writeText(text);
      return { success: true, method: 'navigator.clipboard' };
    }
  }
  return null;
}
""")

# 4) V3 drag: use fresh FULL mechanical snapshot for non-interactive drag nodes.
path = 'app/chrome-extension/entrypoints/background/runtime-v3/action-engine.ts'
replace(path, """    // Always execute from a fresh mechanical snapshot. Historical snapshots stay
    // in the registry only to explain stale EIDs to the agent.
    const before = (await observationService.observe(tab, { mode: 'compact' })).snapshot;
""", """    // Always execute from a fresh mechanical snapshot. Drag needs the full DOM
    // because draggable/drop targets are frequently non-interactive and omitted
    // from compact observations. EIDs remain deterministic for the same document.
    const before = (await observationService.observe(tab, {
      mode: request.action === 'drag' ? 'full' : 'compact',
    })).snapshot;
""")
replace(path, """      navigationWaiter = ['navigate', 'back', 'forward', 'reload'].includes(request.action)
        ? this.prepareNavigationCommit(tab.id, Math.min(timeoutMs, 10000))
        : undefined;
""", """      navigationWaiter = ['navigate', 'back', 'forward', 'reload'].includes(request.action)
        ? this.prepareNavigationReady(tab.id, Math.min(Math.max(timeoutMs, 5000), 15000))
        : undefined;
""")
p = Path(path)
s = p.read_text(encoding='utf-8')
start = s.index('  private prepareNavigationCommit(')
end = s.index('\n  private error(', start)
replacement = """  private prepareNavigationReady(tabId: number, timeoutMs: number): { promise: Promise<void>; cancel: () => void } {
    let settled = false;
    let transitionSeen = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let resolvePromise: (() => void) | undefined;
    const cleanup = () => {
      if (timer) clearTimeout(timer);
      chrome.webNavigation.onCommitted.removeListener(onCommitted);
      chrome.webNavigation.onCompleted.removeListener(onCompleted);
      chrome.webNavigation.onHistoryStateUpdated.removeListener(onHistory);
      chrome.tabs.onUpdated.removeListener(onTabUpdated);
    };
    const finish = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolvePromise?.();
    };
    const onCommitted = (details: any) => {
      if (details.tabId !== tabId || details.frameId !== 0 || settled) return;
      transitionSeen = true;
    };
    const onCompleted = (details: any) => {
      if (details.tabId !== tabId || details.frameId !== 0 || settled) return;
      transitionSeen = true;
      finish();
    };
    const onHistory = (details: any) => {
      if (details.tabId !== tabId || details.frameId !== 0 || settled) return;
      transitionSeen = true;
      void chrome.tabs.get(tabId).then((current) => {
        if (current.status === 'complete') finish();
      }).catch(() => undefined);
    };
    const onTabUpdated = (updatedTabId: number, changeInfo: chrome.tabs.TabChangeInfo, current: chrome.tabs.Tab) => {
      if (updatedTabId !== tabId || settled) return;
      if (changeInfo.url || changeInfo.status === 'loading') transitionSeen = true;
      if (transitionSeen && (changeInfo.status === 'complete' || current.status === 'complete')) finish();
    };
    const promise = new Promise<void>((resolve, reject) => {
      resolvePromise = resolve;
      chrome.webNavigation.onCommitted.addListener(onCommitted);
      chrome.webNavigation.onCompleted.addListener(onCompleted);
      chrome.webNavigation.onHistoryStateUpdated.addListener(onHistory);
      chrome.tabs.onUpdated.addListener(onTabUpdated);
      timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(new Error(`Navigation did not finish loading within ${timeoutMs}ms`));
      }, Math.max(500, timeoutMs));
    });
    return { promise, cancel: () => finish() };
  }
"""
p.write_text(s[:start] + replacement + s[end:], encoding='utf-8')

# 5) Observation identity: read current title/url from live page after navigation.
path = 'app/chrome-extension/entrypoints/background/runtime-v3/observation-service.ts'
replace(path, """    const dpr = Number(dprResult?.result?.value);
    const base = elementRegistry.get(options.sinceSnapshotId) || (mode === 'delta' ? elementRegistry.latest(tab.id) : undefined);
""", """    const dpr = Number(dprResult?.result?.value);
    const identityResult = await cdpRouter.sendCommand<any>(tab.id, 'Runtime.evaluate', {
      expression: '({title: document.title, url: location.href})',
      returnByValue: true,
    }).catch(() => ({}));
    const liveIdentity = identityResult?.result?.value || {};
    const freshTab = await chrome.tabs.get(tab.id).catch(() => tab);
    const liveUrl = String(liveIdentity.url || mainUrl || freshTab.url || tab.url || '');
    const liveTitle = String(liveIdentity.title || freshTab.title || tab.title || '');
    const base = elementRegistry.get(options.sinceSnapshotId) || (mode === 'delta' ? elementRegistry.latest(tab.id) : undefined);
""")
replace(path, """      url: mainUrl || String(tab.url || ''),
      title: String(tab.title || ''),
""", """      url: liveUrl,
      title: liveTitle,
""", 1)

# 6) Screenshot: memory-first MCP image. Disk saving is explicit only.
path = 'app/chrome-extension/entrypoints/background/tools/browser/screenshot.ts'
replace(path, """  storeBase64?: boolean;
  fullPage?: boolean;
  savePng?: boolean;
""", """  storeBase64?: boolean;
  returnImage?: boolean;
  fullPage?: boolean;
  savePng?: boolean;
""")
replace(path, """      storeBase64 = false,
      fullPage = false,
      savePng = true,
""", """      storeBase64 = false,
      returnImage = true,
      fullPage = false,
      savePng = false,
""")
replace(path, """    let finalImageDataUrl: string | undefined;
    let finalImageWidthCss: number | undefined;
""", """    let finalImageDataUrl: string | undefined;
    let responseImage: { data: string; mimeType: string } | undefined;
    let finalImageWidthCss: number | undefined;
""")
replace(path, """      if (storeBase64 === true) {
        // Compress image for base64 output to reduce size
        const compressed = await compressImage(finalImageDataUrl, {
          scale: 0.7, // Reduce dimensions by 30%
          quality: 0.8, // 80% quality for good balance
          format: 'image/jpeg', // JPEG for better compression
        });

        // Include base64 data in response (without prefix)
        const base64Data = compressed.dataUrl.replace(/^data:image\/[^;]+;base64,/, '');
        results.base64 = base64Data;
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ base64Data, mimeType: compressed.mimeType }),
            },
          ],
          isError: false,
        };
      }

      if (savePng === true) {
""", """      if (returnImage === true || storeBase64 === true) {
        const compressed = await compressImage(finalImageDataUrl, {
          scale: fullPage ? 0.7 : 0.85,
          quality: 0.82,
          format: 'image/jpeg',
        });
        const base64Data = compressed.dataUrl.replace(/^data:image\/[^;]+;base64,/, '');
        if (returnImage === true) responseImage = { data: base64Data, mimeType: compressed.mimeType };
        if (storeBase64 === true) {
          results.base64 = base64Data;
          results.base64MimeType = compressed.mimeType;
        }
      }

      if (savePng === true) {
""")
replace(path, """    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: true,
            message: `Screenshot [${name}] captured successfully`,
            tabId: tab.id,
            url: tab.url,
            name: name,
            ...results,
          }),
        },
      ],
      isError: false,
    };
""", """    const content: ToolResult['content'] = [
      {
        type: 'text',
        text: JSON.stringify({
          success: true,
          message: `Screenshot [${name}] captured successfully`,
          tabId: tab.id,
          url: tab.url,
          name: name,
          returnedImage: Boolean(responseImage),
          ...results,
        }),
      },
    ];
    if (responseImage) content.push({ type: 'image', data: responseImage.data, mimeType: responseImage.mimeType });
    return { content, isError: false };
""")

# 7) Shared schema advertises memory image return and explicit disk saving.
path = 'packages/shared/src/tools.ts'
replace(path, """  { name: TOOL_NAMES.BROWSER.SCREENSHOT, description: 'Capture the current page or a page element.', inputSchema: { type: 'object', properties: { name: { type: 'string' }, selector: { type: 'string' }, fullPage: { type: 'boolean' }, storeBase64: { type: 'boolean' }, savePng: { type: 'boolean' }, width: { type: 'number' }, height: { type: 'number' }, background: { type: 'boolean' }, ...tabTarget }, required: [] } },
""", """  { name: TOOL_NAMES.BROWSER.SCREENSHOT, description: 'Capture the current page or a page element. Returns an MCP image in memory by default; saving to Downloads is explicit.', inputSchema: { type: 'object', properties: { name: { type: 'string' }, selector: { type: 'string' }, fullPage: { type: 'boolean' }, returnImage: { type: 'boolean', description: 'Return the screenshot as MCP image content. Defaults to true.' }, storeBase64: { type: 'boolean', description: 'Also include compressed base64 in text metadata for programmatic compatibility.' }, savePng: { type: 'boolean', description: 'Explicitly save a PNG to Chrome Downloads. Defaults to false.' }, width: { type: 'number' }, height: { type: 'number' }, background: { type: 'boolean' }, ...tabTarget }, required: [] } },
""")

# 8) Version metadata 3.0.1.
p = Path('app/chrome-extension/package.json')
data = json.loads(p.read_text(encoding='utf-8'))
data['version'] = '3.0.1'
p.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

p = Path('app/cloudflare-mcp/src/index.ts')
s = p.read_text(encoding='utf-8')
s = s.replace("const BRAUZIO_RUNTIME_VERSION = '3.0.0';", "const BRAUZIO_RUNTIME_VERSION = '3.0.1';")
s = s.replace("const BRAUZIO_SCHEMA_VERSION = 'v3.0.0-2026-09-07';", "const BRAUZIO_SCHEMA_VERSION = 'v3.0.1-2026-09-07';")
p.write_text(s, encoding='utf-8')

print('Brauzio 3.0.1 fixes applied')
