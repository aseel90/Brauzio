# Brauzio Architecture

## Product direction

Brauzio is an Arabic-first Chrome MCP bridge. It is no longer treated as a branded copy of the upstream extension.

The supported production path is:

`ChatGPT Custom MCP -> Cloudflare Worker -> Durable Object -> WebSocket -> Brauzio Chrome Extension -> Browser tools`

There is no local Node bridge, native messaging host, cloudflared dependency, local AI model, embedded agent chat, workflow builder, or web editor in the supported product surface.

## Core extension entrypoints

- `background/` — Cloudflare relay and browser-tool execution.
- `popup/` — connection status, MCP URL, and Cloudflare/device settings.
- `welcome/` — first-install setup guidance.
- `offscreen/` — retained only for browser capabilities that require an offscreen document.
- `element-picker.content.ts` — retained for explicit human-in-the-loop element selection.

## Deprecated upstream surfaces

The following features are removed from the Brauzio product and must not be reintroduced without an explicit product decision:

- Local semantic/embedding models.
- Vector tab search backed by local ML models.
- Agent Chat / Quick Panel.
- Workflow recorder, workflow builder, and record/replay runtime.
- Web Editor.
- Side panel product UI.
- Legacy local/native MCP bridge.
- Chinese locale/branding or upstream product naming.

## UX principles

1. The popup exists to answer three questions: Is Brauzio connected? Which browser/device is connected? What MCP URL should be used in ChatGPT?
2. Secrets are masked by default.
3. Advanced connection settings stay collapsed during normal use.
4. Browser automation is initiated from ChatGPT, not from a second AI interface embedded inside the extension.
5. Diagnostic logging must never print device tokens or MCP secrets.

## Change log

### 2026-09-06 — Clean Core v1.1

- Rebuilt popup UI from scratch.
- Reduced the background runtime to the Brauzio Cloud relay.
- Removed record/replay from the MCP execution map.
- Removed vector-search tool implementation from the browser-tool execution map.
- Removed options, side-panel and command declarations from the manifest.
- Removed local-model and workflow UI dependencies from the extension package.
- Reduced Arabic locale to the strings that belong to the current product.
- Renamed the welcome page title to Brauzio.
