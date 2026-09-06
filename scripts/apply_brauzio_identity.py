#!/usr/bin/env python3
"""Apply the production Brauzio visual identity and generate extension icons."""
from __future__ import annotations

import json
from pathlib import Path
from typing import Iterable

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
EXT = ROOT / "app" / "chrome-extension"

TEXT_EXTENSIONS = {".ts", ".tsx", ".js", ".vue", ".css", ".html", ".json", ".yml", ".yaml", ".md"}

PACKAGE_REPLACEMENTS = {
    "chrome-mcp-server": "brauzio-extension",
    "chrome-mcp-shared": "brauzio-shared",
}

# Consolidate inherited palettes into Brauzio's indigo + teal system.
COLOR_REPLACEMENTS = {
    "#667eea": "#5b5bd6",
    "#667EEA": "#5B5BD6",
    "#764ba2": "#12b8b0",
    "#764BA2": "#12B8B0",
    "#5a67d8": "#4f46e5",
    "#5A67D8": "#4F46E5",
    "#d97757": "#14b8a6",
    "#D97757": "#14B8A6",
    "#c4664a": "#0d9488",
    "#C4664A": "#0D9488",
    "#8b5cf6": "#5b5bd6",
    "#8B5CF6": "#5B5BD6",
    "#7c3aed": "#4f46e5",
    "#7C3AED": "#4F46E5",
    "#3b82f6": "#5b5bd6",
    "#3B82F6": "#5B5BD6",
    "#2563eb": "#5b5bd6",
    "#2563EB": "#5B5BD6",
    "#1d4ed8": "#4f46e5",
    "#1D4ED8": "#4F46E5",
    "#eff6ff": "#eef2ff",
    "#EFF6FF": "#EEF2FF",
    "#dbeafe": "#e0e7ff",
    "#DBEAFE": "#E0E7FF",
    "#bfdbfe": "#c7d2fe",
    "#BFDBFE": "#C7D2FE",
    "rgba(102, 126, 234, 0.1)": "rgba(91, 91, 214, 0.12)",
    "rgba(102, 126, 234, 0.2)": "rgba(91, 91, 214, 0.18)",
    "rgba(59, 130, 246, 0.1)": "rgba(91, 91, 214, 0.12)",
    "rgba(37, 99, 235, 0.08)": "rgba(91, 91, 214, 0.08)",
    "rgba(37, 99, 235, 0.12)": "rgba(91, 91, 214, 0.12)",
    "rgba(37, 99, 235, 0.14)": "rgba(91, 91, 214, 0.14)",
    "rgba(37, 99, 235, 0.16)": "rgba(91, 91, 214, 0.16)",
    "rgba(37, 99, 235, 0.25)": "rgba(91, 91, 214, 0.25)",
    "rgba(37, 99, 235, 0.45)": "rgba(91, 91, 214, 0.45)",
}


def iter_text_files() -> Iterable[Path]:
    roots = [EXT, ROOT / "app" / "cloudflare-mcp", ROOT / "packages" / "shared", ROOT / ".github" / "workflows"]
    for base in roots:
        if not base.exists():
            continue
        for path in base.rglob("*"):
            if path.is_file() and path.suffix.lower() in TEXT_EXTENSIONS:
                yield path


def replace_text(path: Path, replacements: dict[str, str]) -> bool:
    text = path.read_text(encoding="utf-8")
    updated = text
    for old, new in replacements.items():
        updated = updated.replace(old, new)
    if updated != text:
        path.write_text(updated, encoding="utf-8")
        return True
    return False


def update_packages() -> None:
    ext_pkg = EXT / "package.json"
    data = json.loads(ext_pkg.read_text(encoding="utf-8"))
    data["name"] = "brauzio-extension"
    data["description"] = "Brauzio: Arabic-first cloud MCP control for your Chrome browser"
    data["author"] = "Brauzio Contributors"
    deps = data.get("dependencies", {})
    if "chrome-mcp-shared" in deps:
        deps["brauzio-shared"] = deps.pop("chrome-mcp-shared")
    ext_pkg.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    shared_pkg = ROOT / "packages" / "shared" / "package.json"
    data = json.loads(shared_pkg.read_text(encoding="utf-8"))
    data["name"] = "brauzio-shared"
    data["author"] = "Brauzio Contributors"
    shared_pkg.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    cloud_pkg = ROOT / "app" / "cloudflare-mcp" / "package.json"
    data = json.loads(cloud_pkg.read_text(encoding="utf-8"))
    deps = data.get("dependencies", {})
    if "chrome-mcp-shared" in deps:
        deps["brauzio-shared"] = deps.pop("chrome-mcp-shared")
    cloud_pkg.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def inject_brand_imports() -> None:
    targets = ["popup", "sidepanel", "welcome", "options", "builder"]
    for name in targets:
        path = EXT / "entrypoints" / name / "main.ts"
        if not path.exists():
            continue
        text = path.read_text(encoding="utf-8")
        marker = "import '../../brand.css';"
        if marker in text:
            continue
        lines = text.splitlines()
        last_import = -1
        for i, line in enumerate(lines):
            if line.startswith("import "):
                last_import = i
        lines.insert(last_import + 1, marker)
        path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def inject_brand_marks() -> None:
    popup = EXT / "entrypoints" / "popup" / "App.vue"
    text = popup.read_text(encoding="utf-8")
    old = '<div class="header-content">\n          <h1 class="header-title">Brauzio</h1>\n        </div>'
    new = '''<div class="header-content brand-lockup">\n          <img class="brand-mark" src="/brand/brauzio-mark.svg" alt="" aria-hidden="true" />\n          <div class="brand-title-stack">\n            <h1 class="header-title">Brauzio</h1>\n            <span class="brand-subtitle">بوابتك الذكية إلى المتصفح</span>\n          </div>\n        </div>'''
    if old in text:
        popup.write_text(text.replace(old, new, 1), encoding="utf-8")

    welcome = EXT / "entrypoints" / "welcome" / "App.vue"
    text = welcome.read_text(encoding="utf-8")
    text = text.replace(
        '<div class="brand-icon" aria-hidden="true">B</div>',
        '<img class="brand-icon brand-icon-image" src="/brand/brauzio-mark.svg" alt="" aria-hidden="true" />',
        1,
    )
    welcome.write_text(text, encoding="utf-8")


def update_theme_defaults() -> None:
    path = EXT / "entrypoints" / "sidepanel" / "composables" / "useAgentTheme.ts"
    if not path.exists():
        return
    text = path.read_text(encoding="utf-8")
    text = text.replace("const DEFAULT_THEME: AgentThemeId = 'warm-editorial';", "const DEFAULT_THEME: AgentThemeId = 'blueprint-architect';")
    text = text.replace("'warm-editorial': 'Editorial'", "'warm-editorial': 'ناعم'")
    text = text.replace("'blueprint-architect': 'Blueprint'", "'blueprint-architect': 'Brauzio'")
    text = text.replace("'zen-journal': 'Zen'", "'zen-journal': 'هادئ'")
    text = text.replace("'neo-pop': 'Neo-Pop'", "'neo-pop': 'جريء'")
    text = text.replace("'dark-console': 'Console'", "'dark-console': 'داكن'")
    text = text.replace("'swiss-grid': 'Swiss'", "'swiss-grid': 'شبكي'")
    path.write_text(text, encoding="utf-8")


def update_manifest_config() -> None:
    path = EXT / "wxt.config.ts"
    text = path.read_text(encoding="utf-8")
    if "icons: {" not in text:
        anchor = "    description: '__MSG_extensionDescription__',\n"
        icons = (
            "    icons: {\n"
            "      16: 'icon/16.png',\n"
            "      32: 'icon/32.png',\n"
            "      48: 'icon/48.png',\n"
            "      96: 'icon/96.png',\n"
            "      128: 'icon/128.png',\n"
            "    },\n"
        )
        text = text.replace(anchor, anchor + icons, 1)
    action_anchor = "    action: {\n      default_popup: 'popup.html',\n      default_title: 'Brauzio',\n"
    if action_anchor in text and "default_icon" not in text:
        action_new = (
            "    action: {\n"
            "      default_popup: 'popup.html',\n"
            "      default_title: 'Brauzio',\n"
            "      default_icon: {\n"
            "        16: 'icon/16.png',\n"
            "        32: 'icon/32.png',\n"
            "        48: 'icon/48.png',\n"
            "        128: 'icon/128.png',\n"
            "      },\n"
        )
        text = text.replace(action_anchor, action_new, 1)
    path.write_text(text, encoding="utf-8")


def generate_icon_master(size: int = 512) -> Image.Image:
    scale = size / 128
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))

    # Smooth diagonal indigo -> teal gradient.
    gradient = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    gp = gradient.load()
    a = (91, 91, 214)
    b = (18, 184, 176)
    for y in range(size):
        for x in range(size):
            t = min(1.0, max(0.0, (x + y) / (2 * (size - 1))))
            gp[x, y] = tuple(round(a[i] * (1 - t) + b[i] * t) for i in range(3)) + (255,)

    bg_mask = Image.new("L", (size, size), 0)
    bg_draw = ImageDraw.Draw(bg_mask)
    inset = round(6 * scale)
    bg_draw.rounded_rectangle(
        [inset, inset, size - inset - 1, size - inset - 1],
        radius=round(30 * scale),
        fill=255,
    )
    img.alpha_composite(Image.composite(gradient, Image.new("RGBA", (size, size), (0, 0, 0, 0)), bg_mask))

    # Geometric B: highly legible even at 16px.
    mark_mask = Image.new("L", (size, size), 0)
    d = ImageDraw.Draw(mark_mask)
    d.rounded_rectangle(
        [round(35 * scale), round(27 * scale), round(52 * scale), round(101 * scale)],
        radius=round(8 * scale),
        fill=255,
    )
    d.ellipse([round(43 * scale), round(27 * scale), round(96 * scale), round(67 * scale)], fill=255)
    d.ellipse([round(43 * scale), round(59 * scale), round(101 * scale), round(103 * scale)], fill=255)
    d.ellipse([round(54 * scale), round(38 * scale), round(82 * scale), round(57 * scale)], fill=0)
    d.ellipse([round(54 * scale), round(71 * scale), round(85 * scale), round(92 * scale)], fill=0)
    white = Image.new("RGBA", (size, size), (255, 255, 255, 255))
    img.alpha_composite(Image.composite(white, Image.new("RGBA", (size, size), (0, 0, 0, 0)), mark_mask))

    # Relay/status spark — part of Brauzio's distinct mark.
    spark = ImageDraw.Draw(img)
    cx, cy = round(99 * scale), round(27 * scale)
    r = round(10 * scale)
    spark.ellipse([cx-r, cy-r, cx+r, cy+r], fill=(215, 255, 251, 255), outline=(255, 255, 255, 255), width=max(1, round(4*scale)))
    return img


def generate_icons() -> None:
    icon_dir = EXT / "public" / "icon"
    icon_dir.mkdir(parents=True, exist_ok=True)
    master = generate_icon_master(512)
    for size in (16, 32, 48, 96, 128):
        out = master.resize((size, size), Image.Resampling.LANCZOS)
        out.save(icon_dir / f"{size}.png", format="PNG", optimize=True)


def remove_scaffold_assets() -> None:
    for path in [EXT / "public" / "wxt.svg", EXT / "assets" / "vue.svg"]:
        if path.exists():
            path.unlink()


def apply_color_system() -> None:
    for path in iter_text_files():
        # Preserve legal documents; visual/code assets are the migration target.
        if path.name == "LICENSE":
            continue
        replace_text(path, COLOR_REPLACEMENTS)


def apply_package_identity() -> None:
    for path in iter_text_files():
        replace_text(path, PACKAGE_REPLACEMENTS)


def main() -> None:
    update_packages()
    apply_package_identity()
    apply_color_system()
    inject_brand_imports()
    inject_brand_marks()
    update_theme_defaults()
    update_manifest_config()
    remove_scaffold_assets()
    generate_icons()
    print("Brauzio identity applied: own mark, own palette, own package names, generated PNG icons.")


if __name__ == "__main__":
    main()
