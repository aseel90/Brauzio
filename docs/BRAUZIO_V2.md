# Brauzio V2

## الحالة

Brauzio V2 أصبح النواة المعتمدة للمشروع.

في 2026-09-06 تم تشغيل عملية تنظيف موثقة على فرع اختبار، ثم نجح كل من:

```text
brauzio-shared build       PASS
brauzio-cloud-mcp check    PASS
brauzio-extension compile  PASS
brauzio-extension build    PASS
```

نتيجة البناء الناجحة ثُبتت في commit:

`a1db67c33d9b1e071bbfdbf77136f48c48f02000`

## نطاق المنتج

المسار الوحيد المدعوم:

`ChatGPT → Cloudflare MCP → Durable Object → WebSocket → Brauzio Extension → Chrome`

## واجهة V2

الـPopup الجديد يعرض فقط ما يحتاجه المستخدم:

1. حالة الاتصال.
2. Worker URL.
3. Device ID.
4. Device Token بشكل مخفي.
5. MCP URL للنسخ.
6. الاتصال/الفصل.
7. توضيح حالة الماوس الافتراضي.

## Virtual Mouse

أضيفت إلى `chrome_computer` العمليات:

- `mouse_move`
- `mouse_down`
- `mouse_up`
- `drag_hold`

المؤشر المرئي يعرض حركة Brauzio داخل الصفحة، بينما أحداث الإدخال الفعلية ترسل عبر CDP. المؤشر نفسه يستخدم `pointer-events:none` حتى لا يعطل الصفحة.

هذا يسمح باختبار:

- Virtual Joysticks.
- Canvas games.
- Sliders.
- Drag and drop.
- عناصر تحتاج إبقاء زر الماوس مضغوطًا.

## ما أزيل نهائيًا

- Record/Replay v2 وv3.
- Workflow Builder.
- Agent Chat.
- Quick Panel.
- Local semantic models وembeddings.
- Vector Database / Vector Search.
- ONNX/SIMD runtime.
- Web Editor.
- Side Panel product UI.
- خيارات وجسر MCP المحلي القديم.
- اختبارات وملفات البناء المرتبطة بهذه الطبقات.

## قاعدة التطوير

لا يعاد إدخال أي من الطبقات أعلاه إلا بقرار منتج صريح. أي ميزة جديدة يجب أن تدعم الهدف الرئيسي: جعل ChatGPT يرى Chrome ويتحكم فيه بصورة قابلة للملاحظة والتشخيص.
