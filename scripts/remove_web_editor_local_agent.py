#!/usr/bin/env python3
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
PATH = ROOT / 'app/chrome-extension/entrypoints/background/web-editor/index.ts'
text = PATH.read_text(encoding='utf-8')
original = text

text = text.replace("const DEFAULT_NATIVE_SERVER_PORT = 12306;\n", "")

# Remove local Agent SSE plumbing. It only served localhost Agent apply requests.
text, count_sse = re.subn(
    r"\n// SSE connections for status updates \(per sessionId\).*?(?=\n/\*\*\n \* Web Editor version configuration)",
    "\n",
    text,
    count=1,
    flags=re.S,
)


def replace_handler(name: str, body: str, final: bool = False) -> int:
    global text
    if final:
        lookahead = r"(?=\n    \} catch \(error\) \{)"
    else:
        lookahead = r"(?=\n      if \(message\?\.type === BACKGROUND_MESSAGE_TYPES\.)"
    pattern = re.compile(
        rf"      if \(message\?\.type === BACKGROUND_MESSAGE_TYPES\.{re.escape(name)}\) \{{.*?{lookahead}",
        re.S,
    )
    text, count = pattern.subn(body.rstrip(), text, count=1)
    return count

replacements = {
    'WEB_EDITOR_OPEN_SOURCE': """      if (message?.type === BACKGROUND_MESSAGE_TYPES.WEB_EDITOR_OPEN_SOURCE) {
        sendResponse({
          success: false,
          error:
            'فتح ملف المصدر في VS Code كان يعتمد على الخادم المحلي، وهو غير مستخدم في Brauzio Cloud.',
        });
        return false;
      }
""",
    'WEB_EDITOR_APPLY_BATCH': """      if (message?.type === BACKGROUND_MESSAGE_TYPES.WEB_EDITOR_APPLY_BATCH) {
        sendResponse({
          success: false,
          error:
            'تطبيق التغييرات عبر وكيل AI المحلي غير مستخدم في Brauzio Cloud. استخدم ChatGPT المتصل بـ Brauzio MCP لتنفيذ التعديلات المطلوبة.',
        });
        return false;
      }
""",
    'WEB_EDITOR_APPLY': """      if (message?.type === BACKGROUND_MESSAGE_TYPES.WEB_EDITOR_APPLY) {
        sendResponse({
          success: false,
          error:
            'وكيل Web Editor المحلي غير مستخدم في Brauzio Cloud. استخدم ChatGPT عبر Brauzio MCP بدلًا منه.',
        });
        return false;
      }
""",
}

counts = {name: replace_handler(name, body) for name, body in replacements.items()}
counts['WEB_EDITOR_CANCEL_EXECUTION'] = replace_handler(
    'WEB_EDITOR_CANCEL_EXECUTION',
    """      if (message?.type === BACKGROUND_MESSAGE_TYPES.WEB_EDITOR_CANCEL_EXECUTION) {
        const payload = message.payload as WebEditorCancelExecutionPayload | undefined;
        const requestId = payload?.requestId?.trim();
        if (requestId) {
          setExecutionStatus(requestId, 'cancelled', 'تم إلغاء التنفيذ.');
        }
        sendResponse({ success: true } as WebEditorCancelExecutionResponse);
        return false;
      }
""",
    final=True,
)

if count_sse != 1:
    raise SystemExit(f'Expected one SSE block, changed {count_sse}')
for name, count in counts.items():
    if count != 1:
        raise SystemExit(f'Expected one {name} handler, changed {count}')

if text == original:
    raise SystemExit('No changes made')

PATH.write_text(text, encoding='utf-8')
print('Web Editor local Agent transport removed successfully')
