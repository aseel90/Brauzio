from pathlib import Path
p = Path('app/cloudflare-mcp/src/index.ts')
s = p.read_text()
s = s.replace("const BRAUZIO_RUNTIME_VERSION = '2.1.4';", "const BRAUZIO_RUNTIME_VERSION = '2.4.0';")
s = s.replace("const BRAUZIO_RUNTIME_VERSION = '2.3.0';", "const BRAUZIO_RUNTIME_VERSION = '2.4.0';")
s = s.replace("const BRAUZIO_SCHEMA_VERSION = 'v2.1.4-2026-09-06';", "const BRAUZIO_SCHEMA_VERSION = 'v2.4.0-2026-09-06';")
s = s.replace("const BRAUZIO_SCHEMA_VERSION = 'v2.3.0-2026-09-06';", "const BRAUZIO_SCHEMA_VERSION = 'v2.4.0-2026-09-06';")
if "BRAUZIO_RUNTIME_VERSION = '2.4.0'" not in s or "BRAUZIO_SCHEMA_VERSION = 'v2.4.0-2026-09-06'" not in s:
    raise SystemExit('Could not set Brauzio runtime/schema version to 2.4.0')
p.write_text(s)
