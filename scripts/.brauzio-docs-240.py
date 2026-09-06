from pathlib import Path

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
smart_marker = 'المبدأ: إذا تحقق الشرط بعد 280ms فلا ننتظر 5 ثوانٍ.'
smart_details = '''المبدأ: إذا تحقق الشرط بعد 280ms فلا ننتظر 5 ثوانٍ.

## مكتمل في 2.3.0+

- [x] `chrome_computer` يدعم `action: wait_for` بدون إضافة Tool جديدة.
- [x] DOM waits مبنية على `MutationObserver` بدل polling.
- [x] URL waits مبنية على `chrome.tabs.onUpdated`.
- [x] Network waits مبنية على CDP Core V3 مع inflight request tracking.
- [x] `network_idle` يدعم quiet window ويستثني WebSocket/EventSource/Media.
- [x] `request_finished` ينتظر اكتمال أو فشل request المطابق.
- [x] `wait` القديم عند انتظار النص يستخدم Smart Wait مع backward compatibility.
- [ ] `download_started`, `console_error`, `dialog_opened` كـSmart Wait conditions مباشرة.
- [ ] E2E على ZIP المثبت لكل condition وtimeout/cancel.'''
if '## مكتمل في 2.3.0+' not in s:
    s = s.replace(smart_marker, smart_details)

s = s.replace('- [ ] allowlist للـDomains الآمنة.', '- [x] allowlist للـDomains الآمنة.')
s = s.replace('- [ ] validation للـmethod والparams.', '- [x] validation للـmethod والparams.')
s = s.replace('- [ ] حدود output وحماية من payloads كبيرة.', '- [x] حدود output وحماية من payloads كبيرة.')
s = s.replace('- [ ] trace logging بدون أسرار.', '- [ ] trace logging موحد بدون أسرار.')
s = s.replace('- [ ] Advanced Mode فقط؛ لا تستخدم بدل الأدوات اليومية البسيطة.', '- [x] Advanced Mode منطقيًا عبر allowlist؛ الأدوات اليومية تبقى المسار المفضل.')
raw_marker = '- [x] Advanced Mode منطقيًا عبر allowlist؛ الأدوات اليومية تبقى المسار المفضل.'
raw_details = raw_marker + '''
- [x] `list_allowed` يعرض capability surface المسموح.
- [x] `sessions` يعرض root/child CDP snapshots.
- [x] دعم إرسال command إلى root أو child session معروف.
- [x] حظر cookies، browser contexts، إنشاء/إغلاق targets، وnavigation الخام افتراضيًا.
- [ ] E2E على ZIP 2.4.0 المثبت.'''
if '`list_allowed` يعرض capability surface' not in s:
    s = s.replace(raw_marker, raw_details)

s = s.replace(
    '| 3 | Event Engine | P0 | Extension engine مكتمل، Cloud persistence/E2E متبقٍ |',
    '| 3 | Event Engine | P0 | Extension + Durable persistence مكتملة، E2E/trace/download متبقٍ |',
)
s = s.replace(
    '| 4 | Smart Wait | P0 | التالي بعد تثبيت Event persistence |',
    '| 4 | Smart Wait | P0 | Foundation مكتملة، E2E وشروط إضافية متبقية |',
)
s = s.replace(
    '| 5 | Raw `chrome_cdp` | P1 | لاحقًا |',
    '| 5 | Raw `chrome_cdp` | P1 | allowlisted implementation مكتمل، E2E/trace متبقٍ |',
)
p.write_text(s)

p = Path('docs/CHANGELOG.md')
s = p.read_text()
if 'Extension V2.4.0 Allowlisted Raw CDP' not in s:
    entries = '''# Brauzio Changelog

## 2026-09-06 — Extension V2.4.0 Allowlisted Raw CDP

- إضافة `chrome_cdp` كواجهة CDP متقدمة واحدة بدل تضخيم Brauzio بعشرات الأدوات المتخصصة.
- إضافة `command`, `list_allowed`, و`sessions`.
- allowlist محددة لـAccessibility/CSS/DOM/DOMSnapshot/Emulation/Log/Network/Page/Performance/Runtime/Schema/Target.
- حظر صريح لأوامر cookies، browser contexts، إنشاء/إغلاق targets، `Target.attachToTarget` الخام، و`Page.navigate` الخام.
- حد params يبلغ 128 KiB، وحد output أقصى 256 KiB، وtimeout أقصى 120 ثانية.
- النتائج تمر عبر output sanitizer وتدعم root وBrauzio child CDP sessions.
- رفع Extension إلى `2.4.0` وCloud runtime/schema إلى `2.4.0` / `v2.4.0-2026-09-06`.

## 2026-09-06 — Extension V2.3.0 Durable Watch Persistence + Smart Wait

- إضافة Durable Object persistence لـ`chrome_watch_*` مع حفظ تعريفات الـWatch وring-buffer events في Cloudflare.
- استعادة الـWatches تلقائيًا بعد Relay/Service Worker reconnect مع نفس `watchId` و`nextSequence`.
- `watch_read` و`watch_wait` يمكنهما استخدام Durable Object state، و`watch_stop` يزامن التوقف مع الإضافة.
- تنظيف URLs قبل persistence بإزالة credentials/query/hash لتقليل تخزين الأسرار.
- إضافة `activeWatches` إلى BrowserSession status.
- إضافة `action: wait_for` داخل `chrome_computer` بدل Tool جديدة.
- Smart Wait يدعم `selector_exists`, `selector_hidden`, `text_appears`, `text_disappears`, `url_matches`, `network_idle`, `request_finished`, `page_loaded`.
- DOM عبر MutationObserver، URL عبر tab events، Network عبر CDP Core V3.
- مسار `wait` القديم للنص أصبح يستخدم Smart Wait مع backward compatibility.

'''
    assert s.startswith('# Brauzio Changelog\n')
    s = entries + s[len('# Brauzio Changelog\n\n'):]
p.write_text(s)
