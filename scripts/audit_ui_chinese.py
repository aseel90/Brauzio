#!/usr/bin/env python3
from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EXT = ROOT / 'app/chrome-extension'
OUT = ROOT / 'docs/UI_CHINESE_STRINGS.md'
CJK = re.compile(r'[\u3400-\u4dbf\u4e00-\u9fff]')

# Source that can render text or produce user-facing labels, hints, validation and status messages.
roots = [
    EXT / 'entrypoints/popup',
    EXT / 'entrypoints/sidepanel',
    EXT / 'entrypoints/builder',
    EXT / 'entrypoints/welcome',
    EXT / 'entrypoints/options',
    EXT / 'entrypoints/quick-panel',
    EXT / 'entrypoints/web-editor-v2/ui',
    ROOT / 'packages/shared/src/node-specs-builtin.ts',
]

allowed = {'.vue', '.ts', '.tsx', '.js', '.html'}
rows: list[tuple[str, int, str]] = []
seen: set[tuple[str, str]] = set()

files: list[Path] = []
for base in roots:
    if base.is_file():
        files.append(base)
    elif base.exists():
        files.extend(
            path for path in base.rglob('*')
            if path.is_file() and path.suffix.lower() in allowed
        )

for path in files:
    rel = str(path.relative_to(ROOT))
    in_block_comment = False
    try:
        source_lines = path.read_text(encoding='utf-8').splitlines()
    except UnicodeDecodeError:
        continue
    for number, raw in enumerate(source_lines, 1):
        line = raw.strip()
        if not line:
            continue

        # Skip full-line HTML, JS/TS and block comments.
        if in_block_comment:
            if '*/' in line:
                in_block_comment = False
            continue
        if line.startswith('/*'):
            if '*/' not in line:
                in_block_comment = True
            continue
        if line.startswith('//') or line.startswith('*'):
            continue
        if line.startswith('<!--') and line.endswith('-->'):
            continue

        if not CJK.search(line):
            continue

        # Ignore trailing inline comments when CJK exists only in the comment.
        if '//' in line:
            prefix, suffix = line.split('//', 1)
            if CJK.search(suffix) and not CJK.search(prefix):
                continue

        compact = re.sub(r'\s+', ' ', line).replace('`', "'")[:320]
        key = (rel, compact)
        if key in seen:
            continue
        seen.add(key)
        rows.append((rel, number, compact))

OUT.parent.mkdir(parents=True, exist_ok=True)
body = [
    '# Brauzio user-facing Chinese audit',
    '',
    f'Potential user-facing CJK lines: **{len(rows)}**',
    '',
]
for rel, number, line in rows:
    body.append(f'- `{rel}:{number}` — `{line}`')
if not rows:
    body.append('No potential Chinese user-facing text remains in the scanned UI source.')
OUT.write_text('\n'.join(body) + '\n', encoding='utf-8')
print(f'Potential UI CJK lines: {len(rows)}')
