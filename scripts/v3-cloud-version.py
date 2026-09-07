from pathlib import Path

path = Path('app/cloudflare-mcp/src/index.ts')
text = path.read_text(encoding='utf-8')
old_version = "const BRAUZIO_RUNTIME_VERSION = '2.9.3';"
old_schema = "const BRAUZIO_SCHEMA_VERSION = 'v2.9.3-2026-09-07';"
if old_version not in text or old_schema not in text:
    raise SystemExit('Expected Brauzio 2.9.3 cloud version constants not found')
text = text.replace(old_version, "const BRAUZIO_RUNTIME_VERSION = '3.0.0';", 1)
text = text.replace(old_schema, "const BRAUZIO_SCHEMA_VERSION = 'v3.0.0-2026-09-07';", 1)
path.write_text(text, encoding='utf-8')
print('prepared cloud runtime 3.0.0')
