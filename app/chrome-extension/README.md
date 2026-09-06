# Brauzio Chrome Extension

إضافة Chrome الخاصة بـBrauzio V2.

وظيفتها الأساسية هي الاتصال بـBrauzio Cloud MCP عبر WebSocket، استقبال استدعاءات أدوات المتصفح من ChatGPT، تنفيذها باستخدام Chrome APIs وChrome DevTools Protocol، ثم إعادة النتيجة إلى Cloudflare.

## نقاط الدخول الحالية

- `background/` — relay وأدوات المتصفح.
- `popup/` — واجهة الاتصال والإعدادات.
- `welcome/` — إعداد أول تشغيل.
- `offscreen/` — ترميز GIF فقط.
- `element-picker.content.ts` — اختيار عنصر يدوي عند الحاجة.

لا توجد في V2 واجهة Agent داخلية أو Workflow Builder أو Record/Replay أو Local AI أو Web Editor أو Side Panel.

## تحقق V2 النهائي

يجب أن ينجح البناء القياسي وأن يمر فحص النسخة المبنية بدون أي مسارات Runtime قديمة مثل Native Host أو Record/Replay أو `rr-*` أو semantic/vector stack قبل الدمج إلى `main`.

## البناء

من جذر المستودع:

```bash
pnpm --filter brauzio-extension exec wxt prepare
pnpm --filter brauzio-extension compile
pnpm --filter brauzio-extension build
```
