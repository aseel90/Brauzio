#!/usr/bin/env python3
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
TEXT_EXTS = {'.ts', '.tsx', '.js', '.mjs', '.cjs', '.vue', '.html', '.css', '.md', '.json', '.yaml', '.yml'}
CJK = re.compile(r'[\u3400-\u4dbf\u4e00-\u9fff]')
SKIP_PARTS = {'.git', 'node_modules', '.output', 'dist'}
EXCLUDE = {
    Path('app/chrome-extension/_locales/ja/messages.json'),
    Path('app/chrome-extension/_locales/ko/messages.json'),
}


def find_token_outside_strings(line: str, token: str) -> int:
    quote = None
    escaped = False
    i = 0
    while i <= len(line) - len(token):
        ch = line[i]
        if escaped:
            escaped = False
            i += 1
            continue
        if quote:
            if ch == '\\':
                escaped = True
            elif ch == quote:
                quote = None
            i += 1
            continue
        if ch in ("'", '"', '`'):
            quote = ch
            i += 1
            continue
        if line.startswith(token, i):
            return i
        i += 1
    return -1


def clean_line(line: str) -> tuple[str, bool]:
    if not CJK.search(line):
        return line, False

    indent = line[: len(line) - len(line.lstrip())]
    stripped = line.strip()

    if stripped.startswith('//'):
        return indent + '// Brauzio internal note.', True

    if stripped.startswith('/*'):
        if '*/' in stripped:
            return indent + '/* Brauzio internal note. */', True
        return indent + '/*', True

    if stripped.startswith('*') and not stripped.startswith('*/'):
        return indent + ' * Brauzio internal note.', True

    if stripped.startswith('<!--'):
        if '-->' in stripped:
            return indent + '<!-- Brauzio internal note. -->', True
        return indent + '<!--', True

    pos = find_token_outside_strings(line, '//')
    if pos >= 0 and CJK.search(line[pos + 2 :]):
        return line[:pos].rstrip() + ' // Brauzio internal note.', True

    pos = find_token_outside_strings(line, '/*')
    if pos >= 0:
        end = line.find('*/', pos + 2)
        if end >= 0 and CJK.search(line[pos : end + 2]):
            return line[:pos].rstrip() + ' /* Brauzio internal note. */' + line[end + 2 :], True

    return line, False


changed_files = []
changed_lines = 0
for path in ROOT.rglob('*'):
    if not path.is_file() or path.suffix.lower() not in TEXT_EXTS:
        continue
    rel = path.relative_to(ROOT)
    if any(part in SKIP_PARTS for part in rel.parts) or rel in EXCLUDE:
        continue
    try:
        original = path.read_text(encoding='utf-8')
    except UnicodeDecodeError:
        continue

    lines = original.splitlines()
    out = []
    file_changes = 0
    for line in lines:
        cleaned, changed = clean_line(line)
        out.append(cleaned)
        if changed:
            file_changes += 1

    if file_changes:
        suffix = '\n' if original.endswith('\n') else ''
        path.write_text('\n'.join(out) + suffix, encoding='utf-8')
        changed_files.append(str(rel))
        changed_lines += file_changes

print(f'Cleaned {changed_lines} CJK comment lines across {len(changed_files)} files')
for item in changed_files:
    print(item)
