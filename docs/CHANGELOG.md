# Brauzio Changelog

## 2026-09-07 — Extension/Cloud V2.9.1 Smart Wait + Device Mode

- إصلاح Smart Wait للـ DOM بحيث يحترم `timeoutMs` فعليًا عبر polling آمن من طبقة الإضافة.
- إصلاح Verify للنصوص والـ selectors المبني على Smart Wait.
- إضافة `chrome_device_mode` مع presets للهواتف والتابلت واللابتوب/الديسكتوب.
- دعم portrait/landscape وDPR وmobile metrics وtouch emulation وcustom viewport وstatus/reset.
- يبقى Device Mode فعالًا أثناء التنقل حتى `reset` أو إغلاق التبويب.
- رفع runtime/schema إلى 2.9.1.

## 2026-09-07 — Extension/Cloud V2.9.0 Live View / Stream

- إضافة `chrome_live_view` بإجراءات `start`, `status`, `latest`, `stop`.
- التقاط متتابع خفيف للتبويب النشط مع interval افتراضي 900ms وحد أدنى آمن 550ms.
- ضغط JPEG داخل الذاكرة مع scale/quality قابلة للضبط لتقليل النقل.
- Ring buffer من 1–3 Frames فقط؛ لا Downloads ولا ملفات مؤقتة ولا حفظ على القرص.
- إرجاع أحدث Frames كـ MCP `image` content لكي يراها الأيجينت مباشرة.
- إسقاط Frames المتطابقة وتقارير captured/dropped/lastFrameAt.
- إيقاف تلقائي ومسح الذاكرة عند Navigation أو إغلاق التبويب أو Relay disconnect/error/heartbeat recycle أو خمول الأيجينت 15 ثانية.
- حماية من تصوير صفحات Chrome/Extension المحمية ومن تصوير تبويب غير نشط بالخطأ.

## 2026-09-07 — Extension/Cloud V2.8.1 Relay Reconnect Watchdog

- إصلاح حالة WebSocket المعلقة بعد إعادة نشر Worker عندما لا يصل حدث `close` للعميل.
- heartbeat أصبح يتتبع `pong` فعليًا ويعيد تدوير الاتصال إذا تجاوز مهلة الاستجابة.
- إعادة الاتصال تلقائيًا عند فشل heartbeat أو خطأ WebSocket بدل البقاء في حالة اتصال وهمية.
- حماية من أحداث socket قديم حتى لا تمسح أو تغيّر socket أحدث بعد reconnect.
- الحفاظ على Mouse/Watch safety أثناء تدوير الاتصال.

## 2026-09-07 — Extension/Cloud V2.8.0 Diagnostics + Self Test

- إضافة بطاقة `فحص Brauzio` داخل Popup بواجهة عربية وحالات نجاح/تحذير/خطأ.
- فحص `/health` وقياس HTTP latency مع عرض Cloud runtime/schema/tool count.
- قياس WebSocket round-trip latency فعليًا عبر `ping`/`pong` على نفس Relay المصادق عليه.
- فحص مصادقة الجهاز، Chrome Debugger API، ورؤية CDP page targets بدون attach أو تغيير الصفحة.
- فحص Input Safety وحالة Human Takeover/Pause والتبويب النشط.
- إظهار إصدار الإضافة وCloud runtime وآخر وقت للفحص.
- Self Test غير متلف: لا ينقر، لا يتنقل، ولا يفتح CDP attachment جديد.
- رفع Extension/Cloud runtime/schema إلى `2.8.0` / `v2.8.0-2026-09-07`.

## 2026-09-07 — Cloud Runtime V2.7.0 Actor / Observer Sessions

- إضافة Actor Lease ذري داخل Durable Object لمنع جلستين Agent من تعديل المتصفح في الوقت نفسه.
- اشتقاق caller identity داخليًا من MCP session/client/auth context ثم SHA-256؛ لا يتم إرسال أو تخزين OAuth token كمعرّف.
- منع mutating calls المتزامنة حتى من نفس Actor عبر `activeRequestId` وإرجاع `ACTOR_BUSY`.
- إبقاء lease طوال تنفيذ الأمر، ثم handoff idle لمدة 15 ثانية فقط لتسليم التحكم بسرعة.
- Observer sessions مستقلة بTTL خمس دقائق ولا تمنع DOM/Network/Console/Screenshot/Performance المتوازية.
- Human Takeover أو WebSocket disconnect يلغي Actor Lease فورًا.
- إضافة `actorLeaseActive`, `actorLeaseBusy`, `actorLeaseExpiresAt`, و`observerSessions` إلى BrowserSession status.
- الحفاظ على عقد relay المصحح `/ws` وعقد Durable Object الداخلي `/call` مع توافق `/tool-call` القديم.
- رفع Cloud runtime/schema إلى `2.7.0` / `v2.7.0-2026-09-07`.

## 2026-09-07 — Extension/Cloud V2.6.0 Human Takeover + Emergency Stop

- رصد إدخال الإنسان وإيقاف Actor tools مع إبقاء أدوات المراقبة متاحة.
- تحرير أي Mouse Hold عند takeover أو disconnect.
- Emergency Stop وResume من Popup مع Badge `STOP` وحفظ حالة الإيقاف.
- مزامنة `controlPaused` مع Durable Object ورفض Actor calls بحالة 423 أثناء الإيقاف.
- إصلاح regressions في `/ws` و`/call` بعد 2.6 وإعادة اختبار اتصال Chrome فعليًا.

## 2026-09-06 — Extension V2.5.0 Sense → Act → Verify

- إضافة طبقة `action-verification` موحدة بدل اعتبار dispatch وحده نجاحًا نهائيًا.
- `chrome_click_element` و`chrome_navigate` يدعمان الآن `verify` اختياريًا وإرجاع `Action + Evidence`.
- دعم URL وDOM/text وpage-loaded وnetwork-idle كـpostconditions مبنية على Smart Wait.
- Network request verification يتم تسليحه قبل الفعل عبر CDP حتى لا تضيع requests السريعة.
- Console verification يتم تسليحه قبل الفعل ويغطي `Runtime.consoleAPICalled`, `Runtime.exceptionThrown`, و`Log.entryAdded`.
- evidence يعرض snapshot آمن قبل/بعد الفعل، check-by-check status، وelapsed time مع تنظيف query/hash/credentials من URLs المسجلة.
- إذا نُفذ الفعل لكن فشل postcondition المطلوبة، ترجع النتيجة `actionSucceeded: true` و`verified: false` كخطأ بدل نجاح زائف.
- عند فتح tab/window جديد مع verification، يبدأ Brauzio من `about:blank` لتسليح Network/Console evidence قبل navigation.
- رفع Extension وCloud runtime/schema إلى `2.5.0` / `v2.5.0-2026-09-06`.

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

## 2026-09-06 — Extension V2.2.0 CDP Core V3 + Event Watch Foundation

- إضافة `CDPRouter` جديد فوق `chrome.debugger` مع ownership مرجعي صحيح لكل أداة أو مراقب.
- إضافة Root Session snapshots و`forceDetach` وlazy recovery عند فقد debugger attachment.
- إضافة Child CDP Sessions عبر `Target.attachToTarget(..., flatten: true)` مع `sendToChild` وownership وتنظيف مستقل.
- إبقاء `cdpSessionManager` كطبقة توافق بحيث تنتقل الأدوات الحالية إلى V3 بدون إعادة كتابة جماعية.
- إضافة Event Router داخلي فوق `chrome.debugger.onEvent`.
- إضافة أدوات MCP الجديدة: `chrome_watch_start`, `chrome_watch_wait`, `chrome_watch_read`, `chrome_watch_stop`.
- إضافة local ring buffer لكل Watch مع sequence numbers وTTL وbackpressure وحد أقصى للذاكرة.
- دعم أحداث Navigation وNetwork وRuntime errors وLog وDialogs وLifecycle مع summaries آمنة لا تسجل headers/cookies/tokens.
- `watch_wait` يعيد الحدث فورًا إذا كان حدث قبل استدعائه، بدل الاعتماد على sleep ثابت.
- تنظيف الـWatches وإطلاق CDP ownership تلقائيًا عند tab close أو Relay disconnect/error.
- تقوية Virtual Mouse fail-safe: تحرير أي Mouse Down عالق عند navigation/tab close/Relay disconnect وتنظيف CDP stale state.
- ما يزال Durable Object watch persistence وربط traceId الكامل وSmart Wait ضمن المراحل التالية؛ لا تعتبر هذه العناصر مكتملة في 2.2.0.

## 2026-09-06 — V2.1.2 OAuth Form CSP Fix

- أصلحنا منع متصفح OAuth لإرسال نموذج `/authorize` بسبب `Content-Security-Policy: form-action 'self'`.
- صفحة التفويض تستخدم الآن عنوان Worker نفسه صراحةً في `form-action` وفي `action` للنموذج، مع بقاء الإرسال محصورًا في نفس أصل Brauzio.
- لا يتطلب الإصلاح إعادة تثبيت الإضافة؛ التغيير Cloud-only.

## 2026-09-06 — V2.1.1 Pairing Reliability

- يبقى Pairing Code صالحًا طوال مدة الخمس دقائق حتى إذا أعادت الإضافة اتصال WebSocket بعد إنشاء الرمز.
- صفحة OAuth تعرض سبب الرفض الحقيقي بدل رسالة عامة: لا يوجد رمز نشط، منتهي، غير مطابق، تجاوز المحاولات، أو خطأ Cloud.
- الإبقاء على خصائص الأمان: استخدام مرة واحدة، SHA-256 فقط في التخزين، وحد أقصى عشر محاولات فاشلة.
- إضافة reason codes غير سرية إلى logs لتشخيص مشاكل الربط دون تسجيل الرمز نفسه.
- رفع Cloud runtime إلى `2.1.1`؛ لا يحتاج هذا الإصلاح إلى إعادة تثبيت الإضافة `2.1.0`.

## 2026-09-06 — V2.1 OAuth Pairing

- استبدال مصادقة `/mcp?key=...` بـOAuth 2.1.
- رابط MCP أصبح نظيفًا: `/mcp` بدون Device Token أو secret في query string.
- فصل مصادقة ChatGPT عن مصادقة Extension: OAuth tokens للـMCP وDevice Token للـWebSocket فقط.
- إزالة `MCP_SHARED_SECRET` وإزالة fallback إلى `BROWSER_SHARED_SECRET`.
- إضافة Pairing Code مؤقت من الإضافة، صالح لخمس دقائق ويستخدم مرة واحدة.
- تخزين SHA-256 للـPairing Code فقط داخل Durable Object مع حد للمحاولات الفاشلة.
- إضافة صفحة تفويض Brauzio عربية وربط OAuth grant بالـ`deviceId`.
- إضافة `OAUTH_KV` لـCloudflare OAuth Provider وPKCE/DCR/CIMD support.
- منع `/browser-status` من قبول query-string credentials.
- رفع إصدار الإضافة والـCloud runtime إلى `2.1.0`.

## 2026-09-06 — V2 Clean Runtime

- تحقق فعلي من اتصال ChatGPT → Cloudflare → Chrome.
- إضافة end-to-end tracing للRelay والWorker وDurable Object.
- توحيد `traceId` بحيث يمر UUID نفسه من Worker إلى Durable Object ثم Extension ويعود مع النتيجة.
- إضافة `/health` آمن للتحقق من إصدار Runtime المنشور ومخطط الأدوات بدون كشف أسرار.
- إثبات نشر Cloudflare V2 فعليًا: `version=2.0.0`, `schemaVersion=v2-2026-09-06`, وعدد الأدوات 27.
- إضافة نشر تلقائي لـ`brauzio-chrome-latest.zip`.
- إعادة بناء Popup بواجهة Brauzio عربية مستقلة.
- إضافة Virtual Mouse مرئي داخل الصفحة.
- إضافة `mouse_move`, `mouse_down`, `mouse_up`, `drag_hold` إلى `chrome_computer`.
- تحويل Offscreen إلى GIF-only.
- استبدال Read Page وElement Picker بمسارات مستقلة عن المنتج القديم.
- إزالة Record/Replay v2/v3 وWorkflow Builder.
- إزالة Agent Chat وQuick Panel وSide Panel.
- إزالة Web Editor.
- إزالة Local AI/semantic/vector/ONNX/SIMD stack.
- إزالة Native Host runtime paths المتبقية من رفع الملفات والشبكة وتحليل الأداء.
- فحص ZIP النهائي ضد علامات الإرث القديمة بنتيجة صفر hits.
- إزالة اختبارات وحزم وأصول مرتبطة بالطبقات المحذوفة.
- نجاح compile وbuild للنواة النظيفة في commit `a1db67c33d9b1e071bbfdbf77136f48c48f02000`.
