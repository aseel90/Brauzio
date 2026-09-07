# Brauzio Changelog

## 2026-09-07 — Extension/Cloud V2.9.1 Smart Wait + Device Mode

- إصلاح Smart Wait للـ DOM بحيث يحترم `timeoutMs` فعليًا عبر polling آمن من طبقة الإضافة بدل Promise طويل داخل `chrome.scripting.executeScript`.
- إصلاح Verify للنصوص والـ selectors لأنه يعتمد على نفس Smart Wait.
- إضافة `chrome_device_mode` مع presets للهواتف والتابلت واللابتوب/الديسكتوب.
- دعم portrait/landscape وDPR وmobile metrics وtouch emulation وcustom viewport وstatus/reset.
- يبقى Device Mode فعالًا أثناء التنقل في نفس التبويب حتى `reset` أو إغلاق التبويب.
- رفع Extension/Cloud runtime/schema إلى `2.9.1` / `v2.9.1-2026-09-07`.
