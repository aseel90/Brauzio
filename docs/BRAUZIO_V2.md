# Brauzio V2

Brauzio is now treated as an independent Chrome MCP product. The supported core is: Chrome extension -> Cloudflare relay -> ChatGPT Custom MCP -> browser tools.

## V2 priorities

1. Keep Cloudflare relay and browser-control tools stable.
2. Replace the legacy product UI with a Brauzio-only Arabic-first interface.
3. Add visible AI pointer feedback inside web pages.
4. Add true mouse state controls for apps, canvases and virtual joysticks: `mouse_move`, `mouse_down`, `mouse_up`, and `drag_hold`.
5. Remove legacy recorder/builder/local-agent/vector/editor/sidepanel surfaces after the V2 build is verified.
6. Keep end-to-end relay tracing and the automatic `latest` ZIP publisher.

## Virtual mouse design

The pointer is rendered inside the target page with `pointer-events:none` and a maximum z-index. Browser input itself is still sent through Chrome DevTools Protocol, so the visual pointer never intercepts the real interaction. A small Brauzio badge distinguishes AI input from the user's physical pointer.

## Safety rule for cleanup

Legacy files are removed only after the replacement path builds and passes a real browser test. MCP relay, read-page, screenshot, console, JavaScript, network, element selection and browser interaction tools must not be removed merely because their UI surface is removed.
