# Brauzio v2 — Product Cleanup & Rebuild Plan

## Product definition

Brauzio is a focused Chrome extension that lets ChatGPT control and inspect the user's browser through a Cloudflare-hosted MCP relay.

The canonical path is:

`ChatGPT -> Cloudflare MCP/Relay -> Brauzio Chrome Extension -> Chrome`

Anything that does not directly support this path must justify its cost in code size, permissions, runtime work, UX complexity, and maintenance.

## v2 core — keep

- Cloudflare relay connection and secure device pairing.
- Browser/window/tab navigation.
- Page reading and accessibility-tree inspection.
- Mouse, keyboard, form, and dialog interaction.
- Persistent mouse input (`mouse_down`, `mouse_move`, `mouse_up`) for canvas games, virtual sticks, sliders, drag handles, and other held-pointer interactions.
- Screenshots.
- Console and JavaScript inspection.
- Network inspection and requests.
- Performance diagnostics.
- File upload/download handling where required by browser-control tools.
- Element Picker as a human-in-the-loop fallback for hard-to-identify page elements.
- Safe connection diagnostics and end-to-end relay tracing.

## legacy product surfaces — remove

The following belong to the upstream/old product direction and are not part of Brauzio v2:

- Local AI model manager.
- Semantic-similarity engine and vector database/search UI.
- Internal Agent Chat / assistant side panel.
- Workflow recorder / Record-Replay v1/v3.
- Workflow Builder and Vue Flow editor.
- Web Editor.
- Quick Panel and its internal agent handlers.
- GIF recording/capture tooling unless a future Brauzio use case explicitly requires it.
- Old onboarding, documentation, links, names, package identities, text, images, and localization inherited from the upstream extension.
- Old keyboard shortcuts related to removed product surfaces.

## dependency cleanup targets

After legacy entrypoints are removed, audit and remove unused dependencies such as:

- `@xenova/transformers`
- `hnswlib-wasm-static`
- `@vue-flow/*`
- `elkjs`
- `markstream-vue`
- `gifenc`
- any other package only referenced by removed surfaces

## manifest cleanup targets

After code removal, reduce Chrome permissions to the minimum required by the remaining MCP tools. In particular, re-evaluate:

- `sidePanel`
- `contextMenus`
- `offscreen`
- `declarativeNetRequest`
- any permission that only served removed functionality

Do not remove a permission until the tool that depends on it is either retained and verified or intentionally removed.

## UI/UX principles

1. Arabic-first RTL, with concise technical English only where it is a protocol/product term.
2. One primary job: show whether Brauzio is connected and ready for ChatGPT.
3. Secret device token is hidden by default and excluded from diagnostics.
4. Advanced connection settings are collapsed when the extension is healthy.
5. No “coming soon” buttons, dead controls, or unrelated AI/model/workflow screens.
6. Diagnostics must be one-click and safe to share.
7. Connection state must distinguish: disconnected, connecting, authenticated, and error.
8. UI should remain useful at popup size without unnecessary scrolling.

## migration phases

### Phase 1 — core isolation
- New popup UI.
- Stop booting legacy background runtimes.
- Keep relay + browser control + element picker.
- Add persistent mouse control.

### Phase 2 — physical deletion
- Delete legacy entrypoints and their support modules.
- Delete old assets/locales/docs.
- Remove unused dependencies.
- Remove unused manifest permissions and commands.

### Phase 3 — identity purge
- Repository-wide audit for old project names, old package identifiers, Chinese text, old URLs, and old documentation.
- Replace only the items required by Brauzio; delete the rest.

### Phase 4 — QA
- Build Chrome ZIP.
- Install cleanly in a new extension profile.
- Connect through Cloudflare.
- Test all retained MCP tools.
- Test persistent mouse control against Wreckmarch virtual stick.
- Verify console is free of legacy-runtime errors.
- Compare extension ZIP size and permissions against v1.
