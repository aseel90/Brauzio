#!/usr/bin/env python3
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
PATH = ROOT / 'app/chrome-extension/entrypoints/popup/App.vue'
text = PATH.read_text(encoding='utf-8')

# Remove the old localhost/native-server state and generated localhost MCP config.
text = re.sub(
    r"\nconst nativeConnectionStatus = ref<.*?\nconst currentModel = ref<ModelPreset \| null>\(null\);",
    "\nconst currentModel = ref<ModelPreset | null>(null);",
    text,
    flags=re.S,
)

# Remove old status helpers that only served the Native Messaging card.
text = re.sub(
    r"\nconst getStatusClass = \(\) => \{.*?\n\};\n\n// Open sidepanel and close popup",
    "\n// Open sidepanel and close popup",
    text,
    flags=re.S,
)
text = re.sub(
    r"\nconst getStatusText = \(\) => \{.*?\n\};\n\nconst formatIndexSize",
    "\nconst formatIndexSize",
    text,
    flags=re.S,
)

# Remove all port/native connect functions from the popup.
text = re.sub(
    r"\nconst updatePort = async \(event: Event\) => \{.*?\nconst loadModelPreference = async \(\) => \{",
    "\nconst loadModelPreference = async () => {",
    text,
    flags=re.S,
)
text = re.sub(
    r"\nconst savePortPreference = async \(port: number\) => \{.*?\nconst saveModelState = async \(\) => \{",
    "\nconst saveModelState = async () => {",
    text,
    flags=re.S,
)

# The runtime listener now only watches workflow updates; Cloud relay status is handled by RemoteConnectionCard.
text = re.sub(
    r"\n\s*// Server status changes\n\s*if \(message\.type === BACKGROUND_MESSAGE_TYPES\.SERVER_STATUS_CHANGED && message\.payload\) \{.*?\n\s*\}",
    "",
    text,
    flags=re.S,
)

# Replace the last visible Chinese log message left in model switching.
text = text.replace("'模型切换成功:'", "'Model switched successfully:'")

# Remove Chinese-only comments from this UI file without touching executable logic.
lines = []
for line in text.splitlines():
    stripped = line.lstrip()
    if re.search(r'[\u3400-\u9fff]', line) and (
        stripped.startswith('//') or stripped.startswith('<!--') or stripped.startswith('*')
    ):
        continue
    lines.append(line)
text = '\n'.join(lines) + '\n'

# Guard: Native UI identifiers must be gone.
for forbidden in (
    'nativeServerPort',
    'nativeConnectionStatus',
    'ping_native',
    'connectNative',
    'disconnect_native',
    '127.0.0.1',
    'savePortPreference',
    'loadPortPreference',
):
    if forbidden in text:
        raise SystemExit(f'Legacy popup identifier still present: {forbidden}')

PATH.write_text(text, encoding='utf-8')
print('Popup native/localhost cleanup complete')
