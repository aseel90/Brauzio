type HumanEventKind =
  | 'pointerdown'
  | 'pointerup'
  | 'pointermove'
  | 'keydown'
  | 'wheel'
  | 'scroll'
  | 'selectionchange'
  | 'touchstart';

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_start',
  allFrames: true,

  main() {
    let lastPointerMoveAt = 0;
    let lastScrollAt = 0;

    const report = (eventType: HumanEventKind, event?: Event) => {
      if (event && event.isTrusted === false) return;
      const now = Date.now();
      if (eventType === 'pointermove') {
        if (now - lastPointerMoveAt < 120) return;
        lastPointerMoveAt = now;
      }
      if (eventType === 'scroll') {
        if (now - lastScrollAt < 150) return;
        lastScrollAt = now;
      }
      chrome.runtime
        .sendMessage({
          type: 'brauzio_human_input',
          eventType,
          at: now,
        })
        .catch(() => {});
    };

    const onPointerDown = (event: PointerEvent) => report('pointerdown', event);
    const onPointerUp = (event: PointerEvent) => report('pointerup', event);
    const onPointerMove = (event: PointerEvent) => report('pointermove', event);
    const onKeyDown = (event: KeyboardEvent) => report('keydown', event);
    const onWheel = (event: WheelEvent) => report('wheel', event);
    const onScroll = (event: Event) => report('scroll', event);
    const onSelection = (event: Event) => report('selectionchange', event);
    const onTouchStart = (event: TouchEvent) => report('touchstart', event);

    window.addEventListener('pointerdown', onPointerDown, { capture: true, passive: true });
    window.addEventListener('pointerup', onPointerUp, { capture: true, passive: true });
    window.addEventListener('pointermove', onPointerMove, { capture: true, passive: true });
    window.addEventListener('keydown', onKeyDown, { capture: true, passive: true });
    window.addEventListener('wheel', onWheel, { capture: true, passive: true });
    window.addEventListener('scroll', onScroll, { capture: true, passive: true });
    document.addEventListener('selectionchange', onSelection, { capture: true, passive: true });
    window.addEventListener('touchstart', onTouchStart, { capture: true, passive: true });
  },
});
