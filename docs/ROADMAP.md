# Brauzio Development Roadmap

هذه الوثيقة هي خريطة التطوير الرسمية لـBrauzio بعد تثبيت نواة V2 وتنظيف المشروع من أنظمة المنتج القديم.

## الهدف

الانتقال من MCP يتحكم في Chrome إلى منصة Browser Agent حقيقية، مع الحفاظ على المبادئ التالية:

- لا Python أو Node أو Native Host مطلوب من المستخدم النهائي.
- الاتصال الأساسي يبقى: ChatGPT → Cloudflare → Brauzio Extension → Chrome.
- عدم تضخيم عدد أدوات MCP بدون حاجة.
- تفضيل أدوات عالية المستوى سهلة للنموذج، مع طبقة CDP متقدمة عند الحاجة.
- كل عملية مهمة يجب أن تكون قابلة للمراقبة والتحقق والتتبع.
- الإنسان يظل قادرًا على رؤية تحكم الوكيل والتدخل فورًا.

## مرجع الدراسة

تمت دراسة مشروع `captivus/chrome-agent` كمرجع هندسي لأفكار CDP، الجلسات المعزولة، Event-driven automation، التعاون بين الإنسان والوكيل، ونمط Sense → Act → Verify.

Brauzio لن ينسخ معمارية chrome-agent المحلية. سنأخذ الأفكار التي تناسب منتجنا السحابي فقط.

---

# المرحلة 0 — تثبيت واعتماد Brauzio V2

الأولوية: P0

- [x] إعادة بناء UI خاصة بـBrauzio.
- [x] إزالة Record/Replay وWorkflow Builder وAgent Chat وQuick Panel وWeb Editor وLocal AI/Vector والـNative Host القديم.
- [x] اتصال ChatGPT → Cloudflare → Extension → Chrome.
- [x] إضافة Virtual Cursor مرئي.
- [x] إضافة `mouse_move` و`mouse_down` و`mouse_up` و`drag_hold`.
- [x] توحيد traceId عبر Worker → Durable Object → Extension.
- [x] فحص ZIP النهائي والتأكد من عدم وجود Runtime قديم.
- [ ] تثبيت آخر ZIP على جهاز الاختبار.
- [ ] اختبار Virtual Mouse فعليًا على Wreckmarch وCanvas وDrag & Drop وsliders.
- [ ] اختبار release آمن لأي Mouse Down عالق عند disconnect أو tab close أو navigation.

معيار الإكمال:

- نجاح joystick في Wreckmarch بحركة ناتجة من الماوس نفسه وليس knockback.
- `mouse_up` يعيد الحالة دائمًا إلى released.
- لا يبقى debugger session أو mouse hold عالقًا بعد أي فشل.

---

# المرحلة 1 — CDP Core V3

الأولوية: P0

إعادة تصميم طبقة CDP الحالية لتصبح Session Router حقيقية بدل attachment واحد بسيط لكل tab.

المكونات المخطط لها:

```text
CDPRouter
 ├── Root attachment per tab
 ├── Child sessions
 ├── Session ownership
 ├── Event routing
 ├── reconnect / recovery
 └── emergency input release
```

المهام:

- [ ] إنشاء `CDPRouter` جديد فوق `chrome.debugger`.
- [ ] دعم session ownership لكل أداة أو مراقب.
- [ ] دعم child sessions عندما يسمح Chrome بذلك.
- [ ] إضافة API داخلي مثل:
  - `attach(tabId, owner)`
  - `createChildSession(tabId, owner)`
  - `send(sessionId, method, params)`
  - `detach(sessionId)`
- [ ] عزل Network / Performance / Input / Console قدر الإمكان.
- [ ] إضافة emergency release للماوس والكيبورد عند الخطأ.
- [ ] استعادة attachment بعد disconnect غير المتوقع.

معيار الإكمال:

- أكثر من مراقب يستطيع قراءة نفس tab بدون تداخل في الأحداث.
- فشل أداة لا يفصل sessions الخاصة بالأدوات الأخرى.
- لا يوجد debugger ownership leak.

---

# المرحلة 2 — Event Engine

الأولوية: P0

هذه أهم خطوة بعد CDP Core.

الهدف هو استبدال الانتظار الثابت بنظام يعتمد على أحداث Chrome الحقيقية.

أدوات MCP المخطط لها:

```text
chrome_watch_start
chrome_watch_wait
chrome_watch_read
chrome_watch_stop
```

الأحداث الأولى المستهدفة:

- `Page.frameNavigated`
- `Page.loadEventFired`
- `Runtime.exceptionThrown`
- `Network.requestWillBeSent`
- `Network.responseReceived`
- `Network.loadingFinished`
- `Network.loadingFailed`
- Dialog / Download events المناسبة والمتاحة.

المهام:

- [ ] Event Router داخل Extension.
- [ ] Filtering قبل رفع الأحداث إلى Cloudflare.
- [ ] Ring Buffer قصير لكل Watch داخل Durable Object.
- [ ] sequence number لكل event.
- [ ] timestamp + tabId + sessionId/watchId + traceId.
- [ ] backpressure وحد أقصى للذاكرة.
- [ ] تجاهل الأحداث عالية التردد افتراضيًا مثل mousemove.
- [ ] timeout وcancel لكل watch.

معيار الإكمال:

- يمكن بدء Watch قبل النقر ثم انتظار navigation/network event بدون sleep ثابت.
- إذا وصل الحدث قبل `watch_wait` يبقى موجودًا في buffer ولا يضيع.

---

# المرحلة 3 — Smart Wait

الأولوية: P0

تطوير `wait` الحالي إلى شروط حقيقية.

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

المبدأ:

لا نستخدم `sleep 5s` إذا كان Chrome يستطيع إخبارنا بأن الحالة المطلوبة تحققت بعد 280ms.

---

# المرحلة 4 — Raw CDP Advanced Tool

الأولوية: P1

إضافة أداة متقدمة واحدة بدل عشرات أدوات MCP الجديدة:

```text
chrome_cdp
```

مثال داخلي:

```json
{
  "method": "DOM.getDocument",
  "params": {
    "depth": -1,
    "pierce": true
  }
}
```

المهام:

- [ ] allowlist للـDomains المسموحة والآمنة.
- [ ] validation لاسم method وparams.
- [ ] منع الأوامر غير المتاحة عبر `chrome.debugger`.
- [ ] حدود output وحماية من payloads كبيرة.
- [ ] logging بالـtraceId بدون أسرار.
- [ ] إبقاء الأداة في Advanced Mode وعدم استخدامها للنقرات اليومية البسيطة.

الهدف:

الحفاظ على حوالي 30 أداة عالية الجودة بدل زيادة Brauzio إلى 70–100 أداة ثابتة.

---

# المرحلة 5 — CDP Capability Discovery

الأولوية: P2

المخطط:

```text
chrome_cdp_capabilities
chrome_cdp_describe
```

المهام:

- [ ] اختبار `Schema.getDomains` عبر `chrome.debugger`.
- [ ] إذا لم يكن متاحًا، توليد DevTools Protocol schema داخل CI.
- [ ] ربط schema بإصدار Chrome قدر الإمكان.
- [ ] إرجاع method description + params + return shape للنموذج.

---

# المرحلة 6 — Sense → Act → Verify

الأولوية: P1

لا نعتبر نجاح dispatch دليلاً على أن هدف المستخدم تحقق.

أمثلة verification المخطط لها:

```text
click
 → URL changed
 → expected text appeared
 → POST /api/order observed
```

المهام:

- [ ] verification اختياري داخل `chrome_computer`.
- [ ] URL change verification.
- [ ] DOM/text verification.
- [ ] Network verification.
- [ ] Console verification.
- [ ] نتيجة واحدة توضح Action + Evidence.

هذا يمنع الاستنتاجات الخاطئة مثل اعتبار حركة ناتجة عن enemy knockback دليلًا على نجاح joystick input.

---

# المرحلة 7 — Human Takeover

الأولوية: P1

Brauzio يجب أن يعرف عندما يبدأ الإنسان باستخدام المتصفح أثناء عمل Agent.

الأحداث المستهدفة:

- `pointerdown`
- `click`
- `keydown`
- `scroll`
- `selectionchange`

السلوك:

```text
Human input detected
 → release held mouse/button
 → pause agent input
 → update popup state
 → notify Cloudflare
```

المهام:

- [ ] تمييز Agent-generated input عن Human input باستخدام التوقيت/الإحداثيات وحالة الأوامر المرسلة.
- [ ] عدم الاعتماد على `isTrusted` وحده.
- [ ] زر "استئناف تحكم ChatGPT".
- [ ] زر Emergency Stop واضح في Popup.

---

# المرحلة 8 — Actor / Observer Sessions

الأولوية: P1

الهدف: أكثر من عميل أو Agent يستطيع المراقبة، لكن Actor واحد فقط يملك حق التغيير في اللحظة نفسها.

الأدوار:

```text
Actor
  click / type / navigate / drag

Observer
  DOM / Network / Console / Screenshot / Performance
```

المهام:

- [ ] Actor Lease داخل Durable Object.
- [ ] lease timeout وتجديد آمن.
- [ ] Observer sessions متعددة.
- [ ] منع Agentين من النقر أو التنقل في نفس الوقت.
- [ ] إظهار actor الحالي في Diagnostics.

---

# المرحلة 9 — Diagnostics + Self Test

الأولوية: P1

إضافة صفحة تشخيص وزر "فحص Brauzio".

الاختبارات:

```text
Cloudflare             ✅
WebSocket              ✅
Authentication         ✅
Extension              ✅
Chrome debugger        ✅
CDP Runtime            ✅
Child session          ✅
Event Engine           ✅
Input                  ✅
Tool schema            ✅
Latency                86 ms
```

المهام:

- [ ] آخر Tool call.
- [ ] آخر Trace ID.
- [ ] latency لكل طبقة.
- [ ] reconnect count.
- [ ] آخر خطأ قابل للنسخ.
- [ ] زر "نسخ تقرير التشخيص" بدون Tokens أو Secrets.

---

# المرحلة 10 — Virtual Cursor UX

الأولوية: P2

الحالات المخطط لها:

```text
B      MOVE
B●     CLICK
B●     HOLD
B→     DRAG
B⌨     TYPE
```

المهام:

- [ ] toggle لإظهار/إخفاء المؤشر.
- [ ] smooth interpolation.
- [ ] حالة pressed/drag/type واضحة.
- [ ] label اختياري `Brauzio — ChatGPT`.
- [ ] عدم إعاقة الصفحة: `pointer-events: none` دائمًا.

---

# المرحلة 11 — Device & Session Management

الأولوية: P2

- [ ] أسماء أجهزة بدل الاعتماد على `default` فقط.
- [ ] حالة Online / Offline لكل جهاز.
- [ ] Device Token rotation.
- [ ] revoke token.
- [ ] منع session collision.
- [ ] إظهار الإصدار وschemaVersion لكل جهاز.

---

# المرحلة 12 — Automated Regression Suite

الأولوية: مستمرة

الاختبارات المطلوبة:

- [ ] Mouse hold / move / release.
- [ ] reconnect أثناء Mouse Down.
- [ ] tab close أثناء drag.
- [ ] navigation أثناء held input.
- [ ] child session lifecycle.
- [ ] Event buffer race conditions.
- [ ] Smart Wait timeout/cancel.
- [ ] Raw CDP validation.
- [ ] Human Takeover detection.
- [ ] Actor lease conflicts.
- [ ] schema compatibility.
- [ ] packaged ZIP legacy-residue scan.
- [ ] secret scanning.

---

# ترتيب التنفيذ

| # | المرحلة | الأولوية |
|---:|---|---|
| 1 | اختبار واعتماد Virtual Mouse V2 | P0 |
| 2 | CDP Core V3 | P0 |
| 3 | Event Engine | P0 |
| 4 | Smart Wait | P0 |
| 5 | Raw `chrome_cdp` | P1 |
| 6 | Sense → Act → Verify | P1 |
| 7 | Human Takeover + Emergency Stop | P1 |
| 8 | Actor / Observer Sessions | P1 |
| 9 | Diagnostics + Self Test | P1 |
| 10 | CDP Capability Discovery | P2 |
| 11 | Virtual Cursor UX | P2 |
| 12 | Device & Session Management | P2 |
| 13 | Regression / E2E Suite | مستمرة |

## قاعدة معمارية ثابتة

أي ميزة جديدة يجب أن تجيب عن سؤالين قبل إضافتها:

1. هل تحتاج Tool جديدة فعلًا، أم يمكن تنفيذها عبر أداة موجودة أو Raw CDP؟
2. هل تضيف قدرة Browser Agent حقيقية، أم تعيد تضخيم Brauzio بواجهة أو نظام لا نحتاجه؟

Brauzio V3 يجب أن يكون **أصغر في النواة، أكبر في القدرات، أوضح في التشخيص، وأكثر أمانًا عند التعاون بين الإنسان والوكيل**.
