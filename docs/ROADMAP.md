# Brauzio V3 — Engineering Roadmap

هذا الملف هو المرجع التنفيذي لتطوير Brauzio بعد الانتقال إلى Cloud MCP وChrome Extension نظيفة.

## الهدف العام

تحويل Brauzio من MCP يتحكم في Chrome إلى Browser Agent سحابي متكامل مع الحفاظ على المسار:

```text
ChatGPT → Cloudflare → Brauzio Extension → Chrome
```

المبادئ الثابتة:

- لا Node أو Python أو Native Host مطلوب من المستخدم النهائي.
- تفضيل أدوات عالية المستوى سهلة للنموذج، مع Raw CDP للحالات المتقدمة فقط.
- كل عملية مهمة يجب أن تكون قابلة للمراقبة والتحقق والتشخيص.
- عدم تضخيم عدد أدوات MCP بدون حاجة.
- الإنسان يستطيع رؤية التحكم والتدخل وإيقاف الوكيل.
- لا نعتبر مرحلة مكتملة قبل نجاح الكود والبناء والاختبارات المطلوبة لها.

---

# المرحلة 0 — تثبيت واعتماد Brauzio V2

الأولوية: P0

## مكتمل في المصدر

- [x] UI خاصة بـBrauzio وتنظيف Runtime المنتج القديم.
- [x] اتصال ChatGPT → Cloudflare → Extension → Chrome.
- [x] OAuth 2.1 + Pairing Code وفصل Device Token عن MCP auth.
- [x] Virtual Cursor مرئي.
- [x] `mouse_move`, `mouse_down`, `mouse_up`, `drag_hold`.
- [x] traceId عبر Worker → Durable Object → Extension لمسار الأدوات الحالي.
- [x] emergency mouse release عند Relay disconnect/error، navigation، tab close، ومحاولة suspend.
- [x] تنظيف CDP bookkeeping عند debugger detach أو tab close.
- [x] ZIP يبنى وينشر تلقائيًا عبر GitHub Actions.

## ما يزال يحتاج اختبارًا على ZIP النهائي

- [ ] تثبيت آخر ZIP على جهاز الاختبار.
- [ ] اختبار Virtual Mouse على Wreckmarch وCanvas وDrag & Drop وsliders.
- [ ] اختبار `mouse_down` ثم Relay disconnect والتأكد من release.
- [ ] اختبار `mouse_down` ثم navigation/tab close والتأكد من عدم بقاء state أو debugger session عالقة.

معيار الإكمال:

- joystick في Wreckmarch يتحرك من mouse input نفسه.
- `mouse_up` يعيد الحالة دائمًا إلى released.
- لا يوجد mouse hold أو debugger ownership leak بعد الفشل.

---

# المرحلة 1 — CDP Core V3

الأولوية: P0

الهدف هو جعل `chrome.debugger` طبقة مشتركة آمنة بدل أن يدير كل Tool جلسة منفصلة.

```text
Tool / Watch / Raw CDP
        ↓
     CDPRouter
        ↓
Root Session + Child Sessions
        ↓
chrome.debugger
```

## مكتمل في المصدر

- [x] `CDPRouter` مركزي لكل tab.
- [x] Root session ownership بعدّادات per-owner بدل Set + refCount غير متطابقين.
- [x] lazy recovery عند فقد debugger attachment.
- [x] تنظيف state عند `chrome.debugger.onDetach` وtab close.
- [x] snapshots للـroot sessions.
- [x] event router مركزي لـ`chrome.debugger.onEvent`.
- [x] API `subscribeEvents()`.
- [x] `forceDetach()` للطوارئ.
- [x] طبقة توافق `cdpSessionManager` للأدوات القديمة.
- [x] Child Sessions عبر `Target.attachToTarget(..., flatten: true)`.
- [x] child ownership مستقل.
- [x] `sendToChild()` و`detachChild()`.
- [x] cleanup عند `Target.detachedFromTarget`.
- [x] child snapshots.

## متبقٍ

- [ ] E2E لعمر root session مع عدة Tools متداخلة.
- [ ] E2E لـchild session على iframe/worker targets حقيقية.
- [ ] تحديد سياسة واضحة لاستخدام child sessions افتراضيًا في Network/Performance.
- [ ] session snapshot داخل Diagnostics UI.

---

# المرحلة 2 — Event Engine

الأولوية: P0

بدل:

```text
click → sleep(5s) → read
```

نستخدم:

```text
watch_start → click → watch_wait → verify
```

الأدوات:

```text
chrome_watch_start
chrome_watch_wait
chrome_watch_read
chrome_watch_stop
```

## مكتمل في المصدر

- [x] Event Watch Engine داخل الإضافة.
- [x] local ring buffer لكل Watch.
- [x] sequence numbers تمنع ضياع الحدث إذا سبق `watch_wait`.
- [x] TTL و`maxEvents` وlimits للذاكرة.
- [x] Navigation events.
- [x] Network request/response/finish/fail events.
- [x] Runtime exceptions + Log entries.
- [x] JavaScript dialogs.
- [x] Page lifecycle events.
- [x] cleanup عند tab close.
- [x] cleanup عند Relay disconnect/error.
- [x] URLs في persistence تُنظف من credentials/query/hash.
- [x] Durable Object persistence لتعريفات الـWatch والـring buffer.
- [x] `watch_read` و`watch_wait` يقرآن من Durable state عندما تكون الإضافة أعيد تشغيلها.
- [x] Relay يعيد تفعيل الـWatches تلقائيًا بعد reconnect مع نفس `watchId`.
- [x] `activeWatches` يظهر في BrowserSession status.

## متبقٍ

- [ ] download events ضمن Event Engine الموحد.
- [ ] console-api messages العادية، وليس errors فقط.
- [ ] traceId داخل كل event من Worker إلى Extension والعكس.
- [ ] E2E لـreconnect أثناء Watch نشط وإثبات عدم فقد sequence.

---

# المرحلة 3 — Smart Wait

الأولوية: P0

بدون Tool جديدة؛ داخل `chrome_computer`:

```text
action: wait_for
condition: selector_exists | selector_hidden | text_appears | text_disappears |
           url_matches | network_idle | request_finished | page_loaded
```

- [x] `wait_for` داخل `chrome_computer`.
- [x] `selector_exists`.
- [x] `selector_hidden`.
- [x] `text_appears`.
- [x] `text_disappears`.
- [x] `url_matches`.
- [x] `network_idle`.
- [x] `request_finished`.
- [x] `page_loaded`.
- [x] DOM waits مبنية على `MutationObserver` بدل polling ثابت.
- [x] URL waits مبنية على `chrome.tabs.onUpdated`.
- [x] Network waits مبنية على CDP Core V3 مع inflight request tracking.
- [x] `network_idle` يدعم quiet window ويستثني WebSocket/EventSource/Media.
- [x] `request_finished` ينتظر اكتمال أو فشل request المطابق.
- [x] `wait` القديم عند انتظار النص يستخدم Smart Wait مع backward compatibility.
- [ ] `download_started`, `console_error`, `dialog_opened` كـSmart Wait conditions مباشرة.
- [ ] E2E على ZIP المثبت لكل condition وtimeout/cancel.

---

# المرحلة 4 — Raw CDP Advanced Tool

الأولوية: P1

أداة واحدة متقدمة:

```text
chrome_cdp
```

- [x] allowlist للـDomains الآمنة.
- [x] validation للـmethod والparams.
- [x] حدود output وحماية من payloads كبيرة.
- [ ] trace logging موحد بدون أسرار.
- [x] Advanced Mode منطقيًا عبر allowlist؛ الأدوات اليومية تبقى المسار المفضل.
- [x] `list_allowed` يعرض capability surface المسموح.
- [x] `sessions` يعرض root/child CDP snapshots.
- [x] دعم إرسال command إلى root أو child session معروف.
- [x] حظر cookies، browser contexts، إنشاء/إغلاق targets، وnavigation الخام افتراضيًا.
- [ ] E2E على ZIP 2.4.0 المثبت.

---

# المرحلة 5 — CDP Capability Discovery

الأولوية: P2

```text
chrome_cdp_capabilities
chrome_cdp_describe
```

- [ ] تجربة `Schema.getDomains` حيث يكون متاحًا.
- [ ] fallback إلى DevTools Protocol schema مولدة في CI.
- [ ] ربط الإمكانات بإصدار Chrome قدر الإمكان.

---

# المرحلة 6 — Sense → Act → Verify

الأولوية: P1

لا نعتبر dispatch ناجحًا دليلًا أن هدف المستخدم تحقق.

```text
click
 → URL changed
 → expected text appeared
 → expected network request observed
```

- [x] URL verification عبر `verify.urlIncludes`.
- [x] DOM/text verification عبر `selector` و`text` مع exists/hidden وappears/disappears.
- [x] Network verification pre-armed عبر `requestUrlIncludes` حتى لا تضيع requests السريعة أثناء الفعل.
- [x] Console verification pre-armed عبر `Runtime.consoleAPICalled`, `Runtime.exceptionThrown`, و`Log.entryAdded`.
- [x] نتيجة موحدة: `Action + Evidence` مع `before`, `after`, `checks`, و`verified`.
- [x] دمج التحقق اختياريًا في `chrome_click_element` و`chrome_navigate` بدون Tool جديدة.
- [x] فشل postcondition المطلوبة يجعل tool result خطأ مع `actionSucceeded: true` بدل الإبلاغ عن نجاح زائف.
- [ ] E2E على ZIP 2.5.0 المثبت لحالات URL/DOM/Network/Console المركبة.

---

# المرحلة 7 — Human Takeover + Emergency Stop

الأولوية: P1

```text
Human input detected
 → release held input
 → pause agent input
 → update UI
 → notify Cloudflare
```

- [x] مراقبة pointer/click/keyboard/scroll/selection.
- [x] تمييز Human input عن Agent-generated input بدون الاعتماد على `isTrusted` وحده.
- [x] زر Emergency Stop.
- [x] زر "استئناف تحكم ChatGPT".
- [ ] E2E يدوي على takeover أثناء click/drag/tool طويل بعد تثبيت ZIP النهائي.

---

# المرحلة 8 — Actor / Observer Sessions

الأولوية: P1

```text
Actor   = click / type / navigate / drag
Observer = DOM / Network / Console / Screenshot / Performance
```

- [x] Actor Lease داخل Durable Object.
- [x] lease timeout أثناء التنفيذ + handoff idle لمدة 15 ثانية.
- [x] عدة Observer sessions مع TTL مستقل.
- [x] منع Agentين من التغيير في الوقت نفسه، ومنع mutating calls متزامنة حتى من نفس Actor.
- [x] هوية caller مشتقة داخليًا ومشفرة SHA-256 بدون كشف OAuth token.
- [ ] E2E تعارض حقيقي بين جلستي OAuth مستقلتين.

---

# المرحلة 9 — Diagnostics + Self Test

الأولوية: P1

زر "فحص Brauzio" يجب أن يعرض على الأقل:

```text
Cloudflare       ✅
WebSocket        ✅
Authentication   ✅
Extension        ✅
Chrome debugger  ✅
CDP Core         ✅
Child session    ✅
Event Engine     ✅
Input            ✅
Latency          86 ms
```

- [ ] آخر Tool call وTrace ID.
- [ ] latency لكل طبقة.
- [ ] reconnect count.
- [ ] CDP root/child ownership snapshots.
- [ ] active watches.
- [ ] آخر خطأ قابل للنسخ.

---

# المرحلة 10 — Virtual Cursor UX

الأولوية: P2

```text
B MOVE
B● CLICK
B● HOLD
B→ DRAG
B⌨ TYPE
```

- [ ] animation ثابتة للحركة.
- [ ] حالات visual مختلفة لكل action.
- [ ] إخفاء تلقائي بعد idle.
- [ ] عدم حجب عناصر الصفحة.

---

# المرحلة 11 — Device & Session Management

الأولوية: P2

- [ ] أسماء أجهزة بدل `default` فقط.
- [ ] Online / Offline / Last seen.
- [ ] إصدار الإضافة لكل جهاز.
- [ ] إصدار Cloud runtime لكل جهاز.
- [ ] token rotation/revoke.
- [ ] حذف جهاز.

---

# المرحلة 12 — Automated Regression / E2E

الأولوية: مستمرة

- [ ] Mouse hold/move/release.
- [ ] reconnect أثناء Mouse Down.
- [ ] tab close/navigation أثناء held input.
- [ ] root ownership counters.
- [ ] child session lifecycle.
- [ ] Event buffer race conditions.
- [ ] Event cleanup عند Relay disconnect.
- [ ] Smart Wait timeout/cancel.
- [ ] Raw CDP validation.
- [ ] Human Takeover.
- [ ] Actor lease conflicts.
- [ ] packaged ZIP legacy-residue scan.
- [ ] secret scanning.

---

# ترتيب التنفيذ الحالي

| # | المرحلة | الأولوية | الحالة |
|---:|---|---|---|
| 1 | اعتماد Virtual Mouse V2 على ZIP النهائي | P0 | الكود مكتمل، الاختبار النهائي متبقٍ |
| 2 | CDP Core V3 | P0 | Foundation + child sessions مكتملة، العزل/E2E متبقٍ |
| 3 | Event Engine | P0 | Extension + Durable persistence مكتملة، E2E/trace/download متبقٍ |
| 4 | Smart Wait | P0 | Foundation مكتملة، E2E وشروط إضافية متبقية |
| 5 | Raw `chrome_cdp` | P1 | allowlisted implementation مكتمل، E2E/trace متبقٍ |
| 6 | Sense → Act → Verify | P1 | Foundation مكتملة في 2.5.0، E2E والتوسيع لبقية actions متبقيان |
| 7 | Human Takeover + Emergency Stop | P1 | Foundation مكتملة في 2.6.0، E2E يدوي متبقٍ |
| 8 | Actor / Observer Sessions | P1 | Foundation مكتملة في Cloud runtime 2.7.0، multi-session E2E متبقٍ |
| 9 | Diagnostics + Self Test | P1 | لاحقًا |
| 10 | CDP Capability Discovery | P2 | لاحقًا |
| 11 | Virtual Cursor UX | P2 | لاحقًا |
| 12 | Device & Session Management | P2 | لاحقًا |
| 13 | Regression / E2E Suite | مستمرة | مستمرة |

## قاعدة معمارية ثابتة

قبل إضافة أي ميزة:

1. هل تحتاج Tool جديدة فعلًا، أم يمكن تنفيذها عبر أداة موجودة أو Raw CDP؟
2. هل تضيف Browser Agent capability حقيقية أم تعيد تضخيم Brauzio؟

Brauzio V3 يجب أن يكون **أصغر في النواة، أكبر في القدرات، أوضح في التشخيص، وأكثر أمانًا عند التعاون بين الإنسان والوكيل**.
