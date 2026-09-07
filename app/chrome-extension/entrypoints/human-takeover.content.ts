type HumanEventKind = 'pointerdown' | 'keydown' | 'wheel' | 'touchstart';

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_start',
  allFrames: true,

  main() {
    const report = (eventType: HumanEventKind, event: Event) => {
      // Synthetic DOM events are never a human takeover signal. Note that CDP
      // input can still surface as trusted, so background-side agent execution
      // suppression remains the second line of defense.
      if (event.isTrusted === false) return;
      const now = Date.now();
      chrome.runtime
        .sendMessage({
          type: 'brauzio_human_input',
          eventType,
          at: now,
        })
        .catch(() => {});
    };

    // Only high-confidence, user-initiated gestures may request takeover.
    // `scroll`, `selectionchange`, pointermove and pointerup are intentionally
    // excluded: navigation, focus changes and layout restoration can generate
    // those without a person touching the browser.
    window.addEventListener('pointerdown', (event) => report('pointerdown', event), { capture: true, passive: true });
    window.addEventListener('keydown', (event) => report('keydown', event), { capture: true, passive: true });
    window.addEventListener('wheel', (event) => report('wheel', event), { capture: true, passive: true });
    window.addEventListener('touchstart', (event) => report('touchstart', event), { capture: true, passive: true });
  },
});
