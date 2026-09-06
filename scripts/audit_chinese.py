#!/usr/bin/env python3
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'docs' / 'CHINESE_AUDIT.md'
TEXT_EXTS = {'.ts', '.tsx', '.js', '.mjs', '.cjs', '.vue', '.html', '.css', '.md', '.json', '.yaml', '.yml'}
CJK = re.compile(r'[\u3400-\u4dbf\u4e00-\u9fff]')

skip_parts = {'.git', 'node_modules', '.output', 'dist'}
# Japanese/Korean locale files can legitimately contain Han characters; the Chinese locales themselves must not exist.
locale_exclusions = {
    Path('app/chrome-extension/_locales/ja/messages.json'),
    Path('app/chrome-extension/_locales/ko/messages.json'),
}

hits = []
for path in ROOT.rglob('*'):
    if not path.is_file() or path.suffix.lower() not in TEXT_EXTS:
        continue
    rel = path.relative_to(ROOT)
    if any(part in skip_parts for part in rel.parts):
        continue
    if rel in locale_exclusions or rel == Path('docs/CHINESE_AUDIT.md'):
        continue
    try:
        lines = path.read_text(encoding='utf-8').splitlines()
    except UnicodeDecodeError:
        continue
    for number, line in enumerate(lines, 1):
        if CJK.search(line):
            sample = line.strip().replace('`', "'")[:220]
            hits.append((str(rel), number, sample))

body = [
    '# Brauzio Chinese-language audit',
    '',
    'This report excludes the Japanese and Korean Chrome locale files because they may legitimately contain Han characters.',
    '',
    f'Remaining CJK-containing source/document lines: **{len(hits)}**',
    '',
]
for rel, number, sample in hits:
    body.append(f'- `{rel}:{number}` — `{sample}`')

if not hits:
    body.append('No Chinese/CJK text remains in the scanned Brauzio source and documentation outside ja/ko locales.')

OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text('\n'.join(body) + '\n', encoding='utf-8')
print(f'Chinese audit hits: {len(hits)}')
