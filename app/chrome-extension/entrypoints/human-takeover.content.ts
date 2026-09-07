export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_start',
  allFrames: true,

  main() {
    // Automatic human-takeover sensing is intentionally disabled.
    // Brauzio control can only be paused/resumed explicitly from the extension UI.
  },
});
