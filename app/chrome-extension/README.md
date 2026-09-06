# Brauzio Chrome Extension

امتداد Chrome الخاص بـ Brauzio.

مسؤوليته الأساسية هي الحفاظ على اتصال WebSocket آمن مع Brauzio Cloud Relay وتنفيذ أدوات MCP المسموح بها داخل جلسة Chrome الحالية.

## مبادئ v2

- Cloud-first؛ لا Native Host ولا خادم localhost للمستخدم النهائي.
- واجهة عربية RTL ومركزة على حالة الاتصال والتشخيص.
- أقل عدد ممكن من الخدمات الخلفية والـentrypoints.
- أقل صلاحيات Chrome ممكنة بعد اكتمال تدقيق الأدوات.
- لا Local AI ولا Workflow Builder ولا Agent Chat داخلي.

راجع `../../docs/BRAUZIO_V2.md` لخطة التنظيف وإعادة البناء.
