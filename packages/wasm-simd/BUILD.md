# دليل بناء WASM SIMD

## المتطلبات

```bash
# تثبيت Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# تثبيت wasm-pack
curl https://rustwasm.github.io/wasm-pack/installer/init.sh -sSf | sh
```

## أوامر البناء

من جذر المشروع:

```bash
npm run build:wasm
```

لبناء حزمة WASM فقط:

```bash
pnpm --filter @chrome-mcp/wasm-simd build
```

للبناء في وضع التطوير:

```bash
npm run build:dev
```

## نواتج البناء

يتم إنشاء الملفات التالية داخل `pkg/`:

- `simd_math.js` — ربط JavaScript.
- `simd_math_bg.wasm` — ملف WebAssembly.
- `simd_math.d.ts` — تعريفات TypeScript.
- `package.json` — معلومات الحزمة.

## دمجها مع إضافة Brauzio

تُنسخ ملفات WASM إلى `app/chrome-extension/workers/` ليتم تحميلها من الإضافة مباشرة:

```typescript
const wasmUrl = chrome.runtime.getURL('workers/simd_math.js');
const wasmModule = await import(wasmUrl);
```

## سير التطوير

1. عدّل `src/lib.rs`.
2. شغّل أمر البناء.
3. أعد بناء إضافة Brauzio لاستخدام ملفات WASM الجديدة.
