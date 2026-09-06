# Contributing to Brauzio

Brauzio V2 مشروع Cloud MCP + Chrome browser control.

## قبل أي تغيير

1. لا تعيد إضافة الجسر المحلي أو Record/Replay أو Agent Chat أو Local AI أو Web Editor بدون قرار منتج صريح.
2. لا تطبع أو ترفع secrets.
3. حافظ على واجهة عربية RTL واضحة.
4. أي أداة متصفح جديدة يجب تعريف اسمها ومخططها في `packages/shared/src/tools.ts` وتنفيذها داخل extension.
5. شغّل البناء قبل الدمج.

## Build

```bash
pnpm install
pnpm build:shared
pnpm --filter brauzio-cloud-mcp check
pnpm build:cloud
pnpm --filter brauzio-extension exec wxt prepare
pnpm --filter brauzio-extension compile
pnpm build:extension
```

## QA

بعد نجاح CI اختبر على الأقل:

1. `get_windows_and_tabs`
2. `chrome_read_page`
3. `chrome_navigate`
4. `chrome_console`
5. `chrome_computer`

وعند تعديل الماوس اختبر حالة `mouse_down → mouse_move → mouse_up` على عنصر يحتاج ضغطًا مستمرًا.
