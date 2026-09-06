# Brauzio Changelog

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
