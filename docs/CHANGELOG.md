# Brauzio Changelog

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
