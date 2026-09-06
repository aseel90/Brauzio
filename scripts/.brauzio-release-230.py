from pathlib import Path

p = Path('app/cloudflare-mcp/src/index.ts')
s = p.read_text()
s = s.replace("const BRAUZIO_RUNTIME_VERSION = '2.1.4';", "const BRAUZIO_RUNTIME_VERSION = '2.3.0';")
s = s.replace("const BRAUZIO_SCHEMA_VERSION = 'v2.1.4-2026-09-06';", "const BRAUZIO_SCHEMA_VERSION = 'v2.3.0-2026-09-06';")
p.write_text(s)

p = Path('docs/ROADMAP.md')
s = p.read_text()
s = s.replace(
    '- [ ] Durable Object ring buffer أو مزامنة event state مع Cloudflare كي لا تضيع الحالة عند Service Worker restart/suspend.',
    '- [x] Durable Object ring buffer + مزامنة watch state/events مع Cloudflare، مع restore تلقائي بعد Relay/Service Worker restart.',
)
s = s.replace(
    '- [ ] `document_ready`\n- [ ] `selector_exists`\n- [ ] `selector_removed`\n- [ ] `text_appears`\n- [ ] `text_disappears`\n- [ ] `url_matches`\n- [ ] `network_idle`\n- [ ] `request_finished`',
    '- [x] `page_loaded`\n- [x] `selector_exists`\n- [x] `selector_hidden`\n- [x] `text_appears`\n- [x] `text_disappears`\n- [x] `url_matches`\n- [x] `network_idle`\n- [x] `request_finished`',
)
s = s.replace(
    'المبدأ: إذا تحقق الشرط بعد 280ms فلا ننتظر 5 ثوانٍ.',
    '''المبدأ: إذا تحقق الشرط بعد 280ms فلا ننتظر 5 ثوانٍ.

## مكتمل في 2.3.0

- [x] `chrome_computer` يدعم `action: wait_for` بدون إضافة Tool جديدة.
- [x] DOM waits مبنية على `MutationObserver` بدل polling.
- [x] URL waits مبنية على `chrome.tabs.onUpdated`.
- [x] Network waits مبنية على CDP Core V3 مع inflight request tracking.
- [x] `network_idle` يدعم quiet window ويستثني الاتصالات الطويلة WebSocket/EventSource/Media.
- [x] `request_finished` ينتظر اكتمال أو فشل request المطابق.
- [x] `wait` القديم عند انتظار النص يستخدم Smart Wait مع الحفاظ على backward compatibility.
- [ ] `download_started`, `console_error`, `dialog_opened` كـSmart Wait conditions مباشرة.
- [ ] E2E على ZIP المثبت لكل condition وtimeout/cancel.''',
)
s = s.replace(
    '| 3 | Event Engine | P0 | Extension engine مكتمل، Cloud persistence/E2E متبقٍ |',
    '| 3 | Event Engine | P0 | Extension + Durable persistence مكتملة، E2E/trace/download متبقٍ |',
)
s = s.replace(
    '| 4 | Smart Wait | P0 | التالي بعد تثبيت Event persistence |',
    '| 4 | Smart Wait | P0 | Foundation مكتملة داخل chrome_computer، E2E وشروط إضافية متبقية |',
)
p.write_text(s)

p = Path('docs/CHANGELOG.md')
s = p.read_text()
entry = '''# Brauzio Changelog

## 2026-09-06 — Extension V2.3.0 Durable Watch Persistence + Smart Wait

- إضافة Durable Object persistence لـ`chrome_watch_*`: تعريفات الـWatch وring-buffer events تبقى في Cloudflare بدل الاعتماد على ذاكرة MV3 فقط.
- استعادة الـWatches تلقائيًا بعد Relay/Service Worker reconnect باستخدام `watch_restore` مع الحفاظ على `watchId` و`nextSequence`.
- `chrome_watch_read` و`chrome_watch_wait` يمكنهما القراءة/الانتظار من Durable Object عند وجود Watch محفوظ.
- `chrome_watch_stop` يوقف الحالة السحابية ويرسل stop إلى الإضافة المتصلة.
- إزالة query/hash/credentials من URLs التي تدخل event persistence لتقليل احتمال تخزين secrets.
- إضافة `activeWatches` إلى حالة BrowserSession للتشخيص.
- إضافة Smart Wait event-driven داخل `chrome_computer` عبر `action: wait_for` بدل إنشاء Tool مستقلة.
- الشروط المتاحة: `selector_exists`, `selector_hidden`, `text_appears`, `text_disappears`, `url_matches`, `network_idle`, `request_finished`, `page_loaded`.
- DOM waits تستخدم `MutationObserver`، وURL waits تستخدم tab events، وNetwork waits تستخدم CDP Core V3.
- مسار `wait` القديم للنص أصبح يستخدم Smart Wait مع الحفاظ على التوافق الخلفي.
- إصدار Cloud runtime/schema أصبح `2.3.0` / `v2.3.0-2026-09-06`.
- ما يزال E2E على ZIP المثبت مطلوبًا قبل إغلاق مراحل Event Engine وSmart Wait بالكامل.

'''
if not s.startswith('# Brauzio Changelog\n\n## 2026-09-06 — Extension V2.3.0'):
    assert s.startswith('# Brauzio Changelog\n')
    s = entry + s[len('# Brauzio Changelog\n\n'):]
p.write_text(s)
