# Brauzio Architecture

## Production path

```text
ChatGPT Custom MCP
        │ HTTPS /mcp + OAuth 2.1
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

`app/cloudflare-mcp/src/index.ts` يحمي `/mcp` بواسطة OAuth 2.1. بعد التفويض، يحمل OAuth grant خاصية `deviceId` ويستخدمها Worker لتوجيه استدعاء الأداة إلى Durable Object الصحيح.

`app/cloudflare-mcp/src/browser-session.ts` يحتفظ باتصال WebSocket المصادق عليه، يرسل `tool_call` إلى الإضافة ويربط النتيجة بالطلب الأصلي.

### OAuth + Pairing

المساران منفصلان:

```text
ChatGPT ── OAuth access/refresh token ──> Cloudflare /mcp
Extension ── Device Token ──> Cloudflare /ws
```

لا يُستخدم Device Token كمفتاح MCP ولا يوضع داخل URL. عند أول ربط ينشئ المستخدم Pairing Code من الإضافة. الرمز صالح لخمس دقائق ويستخدم مرة واحدة. لا يخزن Durable Object الرمز نفسه؛ يخزن SHA-256 فقط، ويحد المحاولات الفاشلة ثم يحذف السجل.

بعد استهلاك Pairing Code يكمل OAuth Provider عملية التفويض ويربط grant بالـ`deviceId` ويصدر التوكنات للعميل.

المسارات العامة للمصادقة يديرها `@cloudflare/workers-oauth-provider`، بما فيها Protected Resource / Authorization Server metadata، token endpoint، PKCE، وتسجيل العميل. شاشة `/authorize` هي واجهة Brauzio الخاصة بإثبات امتلاك الجهاز عبر Pairing Code.

### Runtime health

`GET /health` عام وآمن ولا يعرض أي سر. يستخدم للتحقق من النسخة المنشورة فعليًا ويعرض إصدار Brauzio، إصدار مخطط الأدوات، نوع المصادقة، عدد الأدوات وأسماء أوامر الماوس المستمر الأساسية.

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

`remote-relay.ts` يدير WebSocket، hello/auth، heartbeat، reconnect، تنفيذ استدعاءات الأدوات وإنشاء Pairing Code عند طلب المستخدم.

`tools/` يحتوي أدوات Chrome فقط. لا يحتوي على Agent أو Workflow engine.

### Popup

واجهة عربية RTL لإدارة الاتصال وربط ChatGPT. تعرض رابط MCP النظيف وتسمح بإنشاء Pairing Code مؤقت. ليست منصة AI ثانية داخل المتصفح.

### Offscreen

مخصص حاليًا لترميز GIF فقط.

### Element Picker

مسار Human-in-the-loop لاختيار عنصر من الصفحة عندما لا تكفي refs أو selectors أو الإحداثيات.

## Virtual Mouse

`chrome_computer` يدير مؤشراً مرئياً خاصاً بـBrauzio وأحداث CDP الحقيقية.

عند `mouse_down` يبقى CDP session مملوكًا لحالة الضغط. `mouse_move` اللاحق يرسل الحركة مع زر مضغوط، ثم `mouse_up` يحرر الزر والجلسة. هذا مختلف عن drag التقليدي السريع ويتيح التعامل مع الألعاب والـCanvas.

## Security

لا يطبع Logging الأسرار. القيم التالية حساسة:

- `BROWSER_SHARED_SECRET` / Device Token.
- OAuth access tokens وrefresh tokens.
- Pairing Code أثناء مدة صلاحيته القصيرة.

لا يوجد `MCP_SHARED_SECRET` في مسار 2.1، ولا يوجد fallback من MCP auth إلى Browser secret، ولا تقبل `/mcp` مصادقة `?key=`.

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
