#!/usr/bin/env python3
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EXT = ROOT / 'app/chrome-extension'
OUT = ROOT / 'docs/UI_CJK_PHRASES.json'
CJK = re.compile(r'[\u3400-\u4dbf\u4e00-\u9fff]')

roots = [
    EXT / 'entrypoints/popup',
    EXT / 'entrypoints/sidepanel',
    EXT / 'entrypoints/builder',
    EXT / 'entrypoints/welcome',
    EXT / 'entrypoints/options',
    EXT / 'entrypoints/quick-panel',
]
allowed = {'.vue', '.ts', '.tsx', '.js', '.html'}

# quoted JS/TS/HTML attribute strings and plain Vue text nodes
quoted = re.compile(r'''(?P<q>["'`])(?P<body>(?:\\.|(?!\1).)*?)(?P=q)''')
text_node = re.compile(r'>([^<>]+)<')

phrases: dict[str, set[str]] = {}

for base in roots:
    if not base.exists():
        continue
    for path in base.rglob('*'):
        if not path.is_file() or path.suffix.lower() not in allowed:
            continue
        rel = str(path.relative_to(ROOT))
        source = path.read_text(encoding='utf-8')
        # Strip block/HTML comments before extracting literals.
        cleaned = re.sub(r'/\*.*?\*/', '', source, flags=re.S)
        cleaned = re.sub(r'<!--.*?-->', '', cleaned, flags=re.S)
        cleaned = re.sub(r'(?m)^\s*//.*$', '', cleaned)

        found: set[str] = set()
        for match in quoted.finditer(cleaned):
            value = match.group('body').strip()
            if CJK.search(value) and 0 < len(value) <= 300:
                found.add(value)
        for match in text_node.finditer(cleaned):
            value = re.sub(r'\s+', ' ', match.group(1)).strip()
            if CJK.search(value) and 0 < len(value) <= 300:
                found.add(value)

        for value in found:
            phrases.setdefault(value, set()).add(rel)

records = [
    {'source': source, 'files': sorted(files)}
    for source, files in sorted(phrases.items(), key=lambda item: (item[0], sorted(item[1])))
]
OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(json.dumps(records, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(f'Unique UI CJK phrases: {len(records)}')
