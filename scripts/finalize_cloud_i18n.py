#!/usr/bin/env python3
from pathlib import Path
import json

ROOT = Path(__file__).resolve().parents[1]
EXT = ROOT / 'app/chrome-extension'
LOCALES = EXT / '_locales'
AR = LOCALES / 'ar' / 'messages.json'
I18N = EXT / 'utils' / 'i18n.ts'

LEGACY_KEYS = {
    'nativeServerConfigLabel',
    'serviceRunningStatus',
    'serviceNotConnectedStatus',
    'connectedServiceNotStartedStatus',
    'connectionPortLabel',
    'nativeServerConfig',
    'connectionPort',
    'serviceRunning',
    'connectedServiceNotStarted',
    'serviceNotConnected',
}

changed = []
for path in sorted(LOCALES.glob('*/messages.json')):
    data = json.loads(path.read_text(encoding='utf-8'))
    before = set(data)
    for key in LEGACY_KEYS:
        data.pop(key, None)
    if set(data) != before:
        path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        changed.append(str(path.relative_to(ROOT)))

ar_data = json.loads(AR.read_text(encoding='utf-8'))
fallback = {key: value.get('message', key) for key, value in ar_data.items() if isinstance(value, dict)}
serialized = json.dumps(fallback, ensure_ascii=False, indent=2)

i18n_text = f'''/**
 * Brauzio i18n helper.
 * Chrome i18n is the primary source; Arabic is the safe fallback outside extension APIs.
 */
const fallbackMessages: Record<string, string> = {serialized};

function applyFallbackSubstitutions(message: string, substitutions?: string[]): string {{
  if (!substitutions?.length) return message;

  let index = 0;
  let output = message.replace(/\\$[A-Z0-9_]+\\$/gi, (token) => {{
    if (token === '$$') return '$';
    const value = substitutions[index];
    index += 1;
    return value ?? token;
  }});

  substitutions.forEach((value, position) => {{
    output = output.replace(`{{${{position}}}}`, value);
  }});

  return output;
}}

/**
 * Safe localized message getter with Arabic fallback support.
 */
export function getMessage(key: string, substitutions?: string[]): string {{
  try {{
    if (typeof chrome !== 'undefined' && chrome.i18n && chrome.i18n.getMessage) {{
      const message = chrome.i18n.getMessage(key, substitutions);
      if (message) return message;
    }}
  }} catch (error) {{
    console.warn(`Brauzio i18n fallback for key "${{key}}":`, error);
  }}

  return applyFallbackSubstitutions(fallbackMessages[key] || key, substitutions);
}}

/**
 * Check if Chrome extension i18n APIs are available.
 */
export function isI18nAvailable(): boolean {{
  try {{
    return (
      typeof chrome !== 'undefined' && chrome.i18n && typeof chrome.i18n.getMessage === 'function'
    );
  }} catch {{
    return false;
  }}
}}
'''

I18N.write_text(i18n_text, encoding='utf-8')
changed.append(str(I18N.relative_to(ROOT)))

# Hard gate for the old port/native wording in locale + fallback surfaces.
for path in list(LOCALES.glob('*/messages.json')) + [I18N]:
    text = path.read_text(encoding='utf-8')
    forbidden = ['12306', 'Native Server', 'native server', 'NATIVE_HOST', 'mcp-chrome-bridge']
    matches = [item for item in forbidden if item in text]
    if matches:
        raise SystemExit(f'Forbidden legacy i18n text in {path.relative_to(ROOT)}: {matches}')

print(f'Finalized cloud i18n in {len(changed)} files')
for item in changed:
    print(item)
