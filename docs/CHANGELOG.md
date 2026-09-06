# Brauzio Changelog

## 2026-09-06 — V2 Clean Runtime

- تحقق فعلي من اتصال ChatGPT → Cloudflare → Chrome.
- إضافة end-to-end tracing للRelay والWorker وDurable Object.
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
- إزالة اختبارات وحزم وأصول مرتبطة بالطبقات المحذوفة.
- نجاح compile وbuild للنواة النظيفة في commit `a1db67c33d9b1e071bbfdbf77136f48c48f02000`.
