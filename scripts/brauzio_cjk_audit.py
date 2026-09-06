#!/usr/bin/env python3
from __future__ import annotations

import re
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EXT = ROOT / 'app/chrome-extension'
OUT = ROOT / 'docs/BRAUZIO_CJK_AUDIT.md'
CJK = re.compile(r'[\u3400-\u9fff]')
TEXT_EXTENSIONS = {'.ts', '.tsx', '.js', '.vue', '.html', '.css', '.json', '.md', '.yaml', '.yml'}

counts: Counter[str] = Counter()
for path in EXT.rglob('*'):
    if not path.is_file() or path.suffix.lower() not in TEXT_EXTENSIONS:
        continue
    if any(part in {'node_modules', '.output', 'dist'} for part in path.parts):
        continue
    try:
        lines = path.read_text(encoding='utf-8').splitlines()
    except (UnicodeDecodeError, OSError):
        continue
    count = sum(1 for line in lines if CJK.search(line))
    if count:
        counts[str(path.relative_to(ROOT))] = count

OUT.parent.mkdir(parents=True, exist_ok=True)
total = sum(counts.values())
body = [
    '# Brauzio CJK audit',
    '',
    f'Remaining CJK-containing lines in `app/chrome-extension`: **{total}**',
    f'Files containing CJK text: **{len(counts)}**',
    '',
]
if counts:
    body += ['| File | Lines |', '|---|---:|']
    for path, count in counts.most_common():
        body.append(f'| `{path}` | {count} |')
else:
    body.append('No CJK text remains in the extension source.')

OUT.write_text('\n'.join(body) + '\n', encoding='utf-8')
print(f'CJK lines: {total}; files: {len(counts)}')
