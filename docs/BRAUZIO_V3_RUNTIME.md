# Brauzio 3.0 Browser Runtime

## Design principle

Brauzio is a browser runtime, not the intelligence layer. The external Agent owns goals, reasoning, planning, semantic recovery, and the decision to choose among ambiguous candidates. The extension owns mechanical browser observation, execution, event correlation, and reliable evidence.

## Primary V3 tools

- `chrome_observe`: compact/full/delta observation combining DOMSnapshot, Accessibility, layout geometry, tabs, frames/OOPIF sessions, forms, optional screenshots, and the last mechanical action checkpoint.
- `chrome_resolve`: resolves exact EIDs or returns ranked mechanical candidates. A stale EID is always returned as `stale_target`; Brauzio never silently substitutes another element.
- `chrome_act`: atomic actions with actionability waiting, fresh pre-action observation, event correlation by `actionId`, optional Verify, and before/after evidence.
- `chrome_artifacts`: lists/reads/waits for downloads so an Agent can coordinate download → completion → upload without arbitrary sleeps.
- `chrome_clipboard`: explicit read/write clipboard capability. It never observes or modifies clipboard content unless called.

Legacy/specialized tools remain available, including Live View, Device Mode, Watch/Event Engine, raw CDP, performance, screenshots, keyboard, forms/fill, downloads, tabs/windows, and existing verification/wait tools.

## Runtime invariants

1. **No planner or LLM in the extension.** Semantic decisions remain with the Agent.
2. **Fresh action state.** `chrome_act` obtains a fresh compact observation before executing an atomic action.
3. **Stable element identity.** EIDs are derived from document/frame/session context plus CDP backend node identity.
4. **Safe stale recovery.** Historical fingerprints can rank current candidates, but stale backend node IDs are never inherited and Brauzio never auto-selects a replacement.
5. **Mechanical retry only.** Actionability waits for visibility/stability/enabled/hit-test/editability up to the supplied timeout. Changing intent or choosing another target is the Agent's job.
6. **Evidence-first actions.** Actions return `actionId`, timing, target, actionability, correlated browser/CDP events, verification, and before/after snapshot IDs.
7. **Action event correlation.** Network/navigation/tab/download events produced during an action are tagged to that action where mechanically attributable.
8. **Frames and OOPIFs.** The session graph uses flat child CDP sessions and exposes frames/targets without requiring the Agent to manage session IDs manually for normal actions.
9. **Service-worker recovery.** Important per-tab runtime metadata is stored in `chrome.storage.session`, including the last snapshot/document/url/event cursor and last action checkpoint.
10. **Password privacy.** Password input values are not returned in observations and password `value` attributes are removed from observed attributes.
11. **Form grouping is mechanical.** Forms expose method/action/id/name and EIDs of their fields; Brauzio does not infer the meaning of those fields.
12. **Live View is memory-only.** Frames are never written to disk. Same-tab navigation clears old frames but keeps the stream alive. The idle timeout is 120 seconds.
13. **Manual control pause only.** Human-input auto-takeover is disabled. The compatibility content script has no input listeners; legacy automatic pause states are cleaned on load.
14. **CDP ownership is shared.** V3 and specialized features use the shared CDP router/owner model rather than independent debugger attachments.

## Required real-browser validation before merge

Keep PR #13 as Draft and do not deploy V3 to production until the built extension is tested with the connected Chrome browser.

Test at minimum:

- `chrome_observe` compact/full/delta and screenshot mode.
- static text visibility in full mode and password-value redaction.
- exact EID resolution and stale-EID candidate recovery after a DOM rerender/navigation.
- `chrome_act` click/fill/type/press/select/scroll/drag/navigation and 5–10 second actionability timeouts.
- Verify and action-correlated network/navigation/tab events.
- form grouping on HTTPBin or another safe form without submitting destructive data.
- multi-tab opener correlation without automatic tab switching.
- same-origin frame and an OOPIF/cross-origin frame when available.
- Live View surviving navigation in the same tab.
- Device Mode + Observe + Live View + Watch sharing CDP state.
- Device Mode reset remaining reset after navigation.
- Clipboard using non-sensitive test text.
- Download artifact list/wait and upload using a harmless test file.
- manual Pause/Resume and confirmation that mouse/keyboard movement never pauses Agent control automatically.

Only after these pass should the V3 branch be merged to `main` and the Cloudflare MCP runtime/version be deployed as 3.0.0.
