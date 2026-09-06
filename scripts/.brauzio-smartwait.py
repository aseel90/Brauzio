from pathlib import Path

# Wire Smart Wait into chrome_computer.
p = Path('app/chrome-extension/entrypoints/background/tools/browser/computer.ts')
s = p.read_text()

needle = """import {\n  beginMouseHold,\n  isMouseHeld,\n  releaseMouseHold,\n  updateMouseHoldPoint,\n} from '@/utils/mouse-hold-safety';\n"""
replacement = needle + "import { waitForBrowserCondition, type SmartWaitCondition } from '@/utils/smart-wait';\n"
assert needle in s
s = s.replace(needle, replacement, 1)

needle = """  duration?: number;\n  appear?: boolean;\n  width?: number;\n"""
replacement = """  duration?: number;\n  appear?: boolean;\n  condition?: SmartWaitCondition;\n  urlIncludes?: string;\n  requestUrlIncludes?: string;\n  timeoutMs?: number;\n  quietMs?: number;\n  width?: number;\n"""
assert needle in s
s = s.replace(needle, replacement, 1)

needle = """      case 'wait': {\n        const seconds = Math.max(0, Math.min(args.duration ?? 0, 30));\n        if (args.text) {\n          const expected = args.text, appear = args.appear !== false;\n          const timeout = Math.max(100, Math.min(seconds > 0 ? seconds * 1000 : 10000, 120000));\n          const result = await chrome.scripting.executeScript({ target: { tabId }, world: 'MAIN', func: async (text: string, shouldAppear: boolean, timeoutMs: number) => { const deadline = Date.now() + timeoutMs; while (Date.now() < deadline) { const has = (document.body?.innerText || '').includes(text); if (has === shouldAppear) return { ok: true, found: has }; await new Promise((r) => setTimeout(r, 100)); } return { ok: false }; }, args: [expected, appear, timeout] });\n          return result?.[0]?.result?.ok ? ok({ action: 'wait', text: expected, appear }) : createErrorResponse(`Timed out waiting for text: ${expected}`);\n        }\n        if (!seconds) return createErrorResponse('duration is required for wait without text');\n        await new Promise((r) => setTimeout(r, seconds * 1000)); return ok({ action: 'wait', duration: seconds });\n      }\n"""
replacement = """      case 'wait_for': {\n        if (!args.condition) return createErrorResponse('condition is required for wait_for');\n        const result = await waitForBrowserCondition(tabId, {\n          condition: args.condition,\n          selector: args.selector,\n          text: args.text,\n          urlIncludes: args.urlIncludes,\n          requestUrlIncludes: args.requestUrlIncludes,\n          timeoutMs: args.timeoutMs,\n          quietMs: args.quietMs,\n        });\n        return result.ok\n          ? ok({ action: 'wait_for', ...result })\n          : createErrorResponse(`Smart wait failed (${result.condition}): ${result.reason || 'timeout'}`);\n      }\n      case 'wait': {\n        const seconds = Math.max(0, Math.min(args.duration ?? 0, 30));\n        if (args.text) {\n          const expected = args.text;\n          const appear = args.appear !== false;\n          const result = await waitForBrowserCondition(tabId, {\n            condition: appear ? 'text_appears' : 'text_disappears',\n            text: expected,\n            timeoutMs: Math.max(100, Math.min(seconds > 0 ? seconds * 1000 : 10000, 120000)),\n          });\n          return result.ok\n            ? ok({ action: 'wait', text: expected, appear, smart: true, elapsedMs: result.elapsedMs })\n            : createErrorResponse(`Timed out waiting for text: ${expected}`);\n        }\n        if (!seconds) return createErrorResponse('duration is required for wait without text');\n        await new Promise((r) => setTimeout(r, seconds * 1000)); return ok({ action: 'wait', duration: seconds });\n      }\n"""
assert needle in s
s = s.replace(needle, replacement, 1)
p.write_text(s)

# Extend shared MCP schema without adding another tool.
p = Path('packages/shared/src/tools.ts')
s = p.read_text()
s = s.replace(
    "left_click_drag | drag_hold | mouse_move | mouse_down | mouse_up | scroll | scroll_to | type | key | fill | fill_form | hover | wait | resize_page | zoom | screenshot",
    "left_click_drag | drag_hold | mouse_move | mouse_down | mouse_up | scroll | scroll_to | type | key | fill | fill_form | hover | wait | wait_for | resize_page | zoom | screenshot",
    1,
)
needle = """duration: { type: 'number', description: 'Seconds. For drag_hold this is the hold time at the destination (max 15).' }, appear: { type: 'boolean' }, width:"""
replacement = """duration: { type: 'number', description: 'Seconds. For drag_hold this is the hold time at the destination (max 15).' }, appear: { type: 'boolean' }, condition: { type: 'string', enum: ['selector_exists', 'selector_hidden', 'text_appears', 'text_disappears', 'url_matches', 'network_idle', 'request_finished', 'page_loaded'], description: 'Smart wait condition used with action=wait_for.' }, urlIncludes: { type: 'string', description: 'URL substring for url_matches or request filtering.' }, requestUrlIncludes: { type: 'string', description: 'Request URL substring for request_finished.' }, timeoutMs: { type: 'number', description: 'Smart wait timeout in milliseconds, up to 120000.' }, quietMs: { type: 'number', description: 'Required network quiet period for network_idle, 100-5000 ms.' }, width:"""
assert needle in s
s = s.replace(needle, replacement, 1)
p.write_text(s)
