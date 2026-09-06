# Brauzio Architecture

## Production path

```text
ChatGPT Custom MCP
        │ HTTPS /mcp
        ▼
Cloudflare Worker
        │ Durable Object by device id
        ▼
BrowserSession Durable Object
        │ authenticated WebSocket /ws
        ▼
Brauzio Chrome Extension
        │ tool dispatcher
        ├─ Chrome Extension APIs
        └─ Chrome DevTools Protocol
                ▼
              Chrome
```

## Cloudflare

`app/cloudflare-mcp/src/index.ts` يستقبل MCP ويصادق الطلب ويحدد `deviceId` ثم يمرر الأداة إلى Durable Object.

`app/cloudflare-mcp/src/browser-session.ts` يحتفظ باتصال WebSocket المصادق عليه، يرسل `tool_call` إلى الإضافة ويربط النتيجة بالطلب الأصلي.

### Runtime health

`GET /health` عام وآمن ولا يعرض أي سر. يستخدم للتحقق من النسخة المنشورة فعليًا ويعرض إصدار Brauzio، إصدار مخطط الأدوات، عدد الأدوات وأسماء أوامر الماوس المستمر الأساسية.

### End-to-end trace ID

كل استدعاء أداة ينشئ UUID واحدًا في Worker. يمر نفس `traceId` إلى Durable Object، ويستخدم هو نفسه كـ`requestId` في رسالة `tool_call` المرسلة إلى الإضافة، ثم يعود مع `tool_result`.

بالتالي يمكن تتبع الطلب نفسه عبر:

```text
[BrauzioWorker] traceId
       =
[BrauzioSession] requestId
       =
[BrauzioRelay] requestId
```

إذا وصل طلب داخلي إلى Durable Object بدون UUID v4 صالح، ينشئ DO معرفًا جديدًا بدل الوثوق بقيمة غير صالحة.

## Extension

### Background

`remote-relay.ts` يدير WebSocket، hello/auth، heartbeat، reconnect، وتنفيذ استدعاءات الأدوات.

`tools/` يحتوي أدوات Chrome فقط. لا يحتوي على Agent أو Workflow engine.

### Popup

واجهة عربية RTL لإدارة الاتصال فقط. ليست منصة AI ثانية داخل المتصفح.

### Offscreen

مخصص حاليًا لترميز GIF فقط.

### Element Picker

مسار Human-in-the-loop لاختيار عنصر من الصفحة عندما لا تكفي refs أو selectors أو الإحداثيات.

## Virtual Mouse

`chrome_computer` يدير مؤشراً مرئياً خاصاً بـBrauzio وأحداث CDP الحقيقية.

عند `mouse_down` يبقى CDP session مملوكًا لحالة الضغط. `mouse_move` اللاحق يرسل الحركة مع زر مضغوط، ثم `mouse_up` يحرر الزر والجلسة. هذا مختلف عن drag التقليدي السريع ويتيح التعامل مع الألعاب والـCanvas.

## Security

لا يطبع Logging الأسرار. القيم التالية حساسة:

- `BROWSER_SHARED_SECRET`
- `MCP_SHARED_SECRET`
- Device Token

يسمح بتسجيل Device ID وtrace/request IDs لتتبع الطلب عبر الطبقات.

## Removed architecture

ليست جزءًا من Brauzio V2:

- Native/local MCP bridge.
- Record/Replay.
- Workflow system.
- Local AI/semantic/vector stack.
- Quick Panel / Agent Chat.
- Web Editor.
- Side Panel product UI.
