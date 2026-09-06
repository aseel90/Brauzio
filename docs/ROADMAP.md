# Brauzio Development Roadmap

هذه الوثيقة هي خريطة التطوير الرسمية لـBrauzio.

## الهدف

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

الهدف: Session Router حقيقية بدل attachment بسيط لكل tab.

```text
CDPRouter
 ├── Root attachment per tab
 ├── Child sessions
 ├── Session ownership
 ├── Event routing
 ├── recovery
 └── emergency input cleanup
```

## مكتمل

- [x] إنشاء `CDPRouter` فوق `chrome.debugger`.
- [x] ownership بعدّادات مستقلة لكل owner بدل `Set + refCount` غير الدقيق.
- [x] منع owner غير مسجل من إنقاص ملكية session تخص أداة أخرى.
- [x] Root APIs: `attach`, `detach`, `sendCommand`, `withSession`, `forceDetach`, `getSessionSnapshot`.
- [x] event routing داخلي عبر `chrome.debugger.onEvent`.
- [x] lazy recovery عند فقد root debugger attachment.
- [x] Child CDP Sessions عبر `Target.attachToTarget(..., flatten: true)`.
- [x] Child APIs: `createChildSession`, `sendToChild`, `detachChildSession`, `getChildSessionSnapshot`.
- [x] ownership وتنظيف مستقل للـchild sessions.
- [x] compatibility layer باسم `cdpSessionManager` حتى تعمل الأدوات الحالية فوق V3 بدون إعادة كتابة جماعية.
- [x] emergency mouse release مربوط بمسار الأخطاء والانقطاع.

## متبقٍ

- [ ] نقل Network / Performance / Console إلى child sessions عندما يعطي ذلك عزلًا حقيقيًا.
- [ ] إضافة keyboard-held state وemergency key release عندما ندعم key-down/key-up المستمر.
- [ ] اختبارات E2E لتعدد owners وchild lifecycle والفشل أثناء الاستخدام.

معيار الإكمال:

- أكثر من مراقب يستطيع استخدام tab نفسه دون أن يفصل أحدهم session الآخر.
- فشل أداة لا يفصل أدوات أخرى.
- لا يوجد root أو child debugger ownership leak.

---

# المرحلة 2 — Event Engine

الأولوية: P0

الهدف: استبدال `sleep` الثابت بمراقبة أحداث Chrome الحقيقية.

أدوات MCP:

```text
chrome_watch_start
chrome_watch_wait
chrome_watch_read
chrome_watch_stop
```

## مكتمل في Extension

- [x] Event Router مبني فوق `CDPRouter.subscribeEvents`.
- [x] الأدوات الأربع موجودة في Shared MCP schema وExtension dispatcher.
- [x] دعم أولي لأحداث Navigation / Network / Runtime errors / Log / Dialog / Lifecycle.
- [x] Filtering حسب categories وCDP methods و`urlIncludes`.
- [x] local ring buffer لكل Watch.
- [x] sequence number متزايد لكل event.
- [x] timestamp + tabId + sessionId/watchId.
- [x] `watch_wait` يعيد event موجود مسبقًا فورًا، فلا تضيع الأحداث التي حدثت قبل wait.
- [x] حدود للذاكرة: 20 Watch، وحجم buffer افتراضي 100 وأقصى 500.
- [x] TTL وحد أقصى للانتظار.
- [x] stop/cancel يحل waiters المعلقة ويحرر CDP ownership.
- [x] cleanup للـWatches عند tab close أو Relay disconnect/error.
- [x] summaries آمنة للشبكة لا تسجل cookies أو auth headers أو tokens.
- [x] تجاهل الأحداث عالية التردد افتراضيًا ما لم تكن مطلوبة صراحة.

## متبقٍ قبل إغلاق المرحلة

- [ ] Durable Object ring buffer أو مزامنة event state مع Cloudflare كي لا تضيع الحالة عند Service Worker restart/suspend.
- [ ] ربط traceId الكامل بسياق Watch وكل event.
- [ ] download events ضمن Event Engine الموحد.
- [ ] اختبار Watch فعليًا على ZIP المثبت: start → action → navigation/network event → wait/read → stop.
- [ ] اختبار race: وصول event قبل `watch_wait`.

معيار الإكمال:

- يمكن بدء Watch قبل النقر وانتظار navigation/network بدون sleep ثابت.
- event الذي يصل قبل `watch_wait` يبقى قابلًا للقراءة.
- Restart/Suspend لا يفقد الأحداث المهمة بعد إضافة Cloud persistence.

---

# المرحلة 3 — Smart Wait

الأولوية: P0

الشروط المخطط لها:

- [ ] `document_ready`
- [ ] `selector_exists`
- [ ] `selector_removed`
- [ ] `text_appears`
- [ ] `text_disappears`
- [ ] `url_matches`
- [ ] `network_idle`
- [ ] `request_finished`
- [ ] `download_started`
- [ ] `console_error`
- [ ] `dialog_opened`

المبدأ: إذا تحقق الشرط بعد 280ms فلا ننتظر 5 ثوانٍ.

---

# المرحلة 4 — Raw CDP Advanced Tool

الأولوية: P1

أداة واحدة متقدمة:

```text
chrome_cdp
```

- [ ] allowlist للـDomains الآمنة.
- [ ] validation للـmethod والparams.
- [ ] حدود output وحماية من payloads كبيرة.
- [ ] trace logging بدون أسرار.
- [ ] Advanced Mode فقط؛ لا تستخدم بدل الأدوات اليومية البسيطة.

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

- [ ] URL verification.
- [ ] DOM/text verification.
- [ ] Network verification.
- [ ] Console verification.
- [ ] نتيجة موحدة: Action + Evidence.

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

- [ ] مراقبة pointer/click/keyboard/scroll/selection.
- [ ] تمييز Human input عن Agent-generated input بدون الاعتماد على `isTrusted` وحده.
- [ ] زر Emergency Stop.
- [ ] زر "استئناف تحكم ChatGPT".

---

# المرحلة 8 — Actor / Observer Sessions

الأولوية: P1

```text
Actor   = click / type / navigate / drag
Observer = DOM / Network / Console / Screenshot / Performance
```

- [ ] Actor Lease داخل Durable Object.
- [ ] lease timeout وتجديد.
- [ ] عدة Observer sessions.
- [ ] منع Agentين من التغيير في الوقت نفسه.

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
- [ ] تقرير تشخيص بدون Tokens أو Secrets.

---

# المرحلة 10 — Virtual Cursor UX

الأولوية: P2

```text
B      MOVE
B●     CLICK
B●     HOLD
B→     DRAG
B⌨     TYPE
```

- [ ] toggle إظهار/إخفاء.
- [ ] حالات pressed/drag/type أوضح.
- [ ] label اختياري `Brauzio — ChatGPT`.
- [x] `pointer-events: none` للمؤشر.
- [x] smooth visual movement أولي.

---

# المرحلة 11 — Device & Session Management

الأولوية: P2

- [ ] أسماء أجهزة بدل `default` فقط.
- [ ] Online / Offline لكل جهاز.
- [ ] Device Token rotation/revoke.
- [ ] منع session collision.
- [ ] إظهار extensionVersion وschemaVersion لكل جهاز.

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
| 3 | Event Engine | P0 | Extension engine مكتمل، Cloud persistence/E2E متبقٍ |
| 4 | Smart Wait | P0 | التالي بعد تثبيت Event persistence |
| 5 | Raw `chrome_cdp` | P1 | لاحقًا |
| 6 | Sense → Act → Verify | P1 | لاحقًا |
| 7 | Human Takeover + Emergency Stop | P1 | لاحقًا |
| 8 | Actor / Observer Sessions | P1 | لاحقًا |
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
