#!/usr/bin/env python3
from __future__ import annotations

import json
import re
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EXT = ROOT / "app" / "chrome-extension"
LOCALES = EXT / "_locales"

AR = {
    "extensionName": "Brauzio",
    "extensionDescription": "تحكم بمتصفح Chrome وأدواته عبر Brauzio",
    "nativeServerConfigLabel": "إعداد اتصال Brauzio",
    "semanticEngineLabel": "المحرك الدلالي",
    "embeddingModelLabel": "نموذج التضمين",
    "indexDataManagementLabel": "إدارة بيانات الفهرسة",
    "modelCacheManagementLabel": "إدارة ذاكرة النماذج",
    "statusLabel": "الحالة",
    "runningStatusLabel": "حالة التشغيل",
    "connectionStatusLabel": "حالة الاتصال",
    "lastUpdatedLabel": "آخر تحديث:",
    "connectButton": "اتصال",
    "disconnectButton": "قطع الاتصال",
    "connectingStatus": "جارٍ الاتصال...",
    "connectedStatus": "متصل",
    "disconnectedStatus": "غير متصل",
    "detectingStatus": "جارٍ التحقق...",
    "serviceRunningStatus": "الخدمة تعمل (المنفذ: $PORT$)",
    "serviceNotConnectedStatus": "الخدمة غير متصلة",
    "connectedServiceNotStartedStatus": "متصل، لكن الخدمة لم تبدأ",
    "mcpServerConfigLabel": "إعداد خادم MCP",
    "connectionPortLabel": "منفذ الاتصال",
    "refreshStatusButton": "تحديث الحالة",
    "copyConfigButton": "نسخ الإعدادات",
    "retryButton": "إعادة المحاولة",
    "cancelButton": "إلغاء",
    "confirmButton": "تأكيد",
    "saveButton": "حفظ",
    "closeButton": "إغلاق",
    "resetButton": "إعادة الضبط",
    "initializingStatus": "جارٍ التهيئة...",
    "processingStatus": "جارٍ المعالجة...",
    "loadingStatus": "جارٍ التحميل...",
    "clearingStatus": "جارٍ المسح...",
    "cleaningStatus": "جارٍ التنظيف...",
    "downloadingStatus": "جارٍ التنزيل...",
    "semanticEngineReadyStatus": "المحرك الدلالي جاهز",
    "semanticEngineInitializingStatus": "جارٍ تهيئة المحرك الدلالي...",
    "semanticEngineInitFailedStatus": "فشلت تهيئة المحرك الدلالي",
    "semanticEngineNotInitStatus": "المحرك الدلالي غير مهيأ",
    "initSemanticEngineButton": "تهيئة المحرك الدلالي",
    "reinitializeButton": "إعادة التهيئة",
    "downloadingModelStatus": "جارٍ تنزيل النموذج... $PROGRESS$%",
    "switchingModelStatus": "جارٍ تبديل النموذج...",
    "modelLoadedStatus": "تم تحميل النموذج",
    "modelFailedStatus": "فشل تحميل النموذج",
    "lightweightModelDescription": "نموذج خفيف متعدد اللغات",
    "betterThanSmallDescription": "أكبر قليلًا من e5-small مع أداء أفضل",
    "multilingualModelDescription": "نموذج دلالي متعدد اللغات",
    "fastPerformance": "سريع",
    "balancedPerformance": "متوازن",
    "accuratePerformance": "دقيق",
    "networkErrorMessage": "خطأ في اتصال الشبكة، تحقق من الاتصال ثم أعد المحاولة",
    "modelCorruptedErrorMessage": "ملف النموذج تالف أو غير مكتمل، أعد التنزيل",
    "unknownErrorMessage": "حدث خطأ غير معروف، تحقق من إمكانية الوصول إلى HuggingFace",
    "permissionDeniedErrorMessage": "تم رفض الإذن",
    "timeoutErrorMessage": "انتهت مهلة العملية",
    "indexedPagesLabel": "الصفحات المفهرسة",
    "indexSizeLabel": "حجم الفهرس",
    "activeTabsLabel": "علامات التبويب النشطة",
    "vectorDocumentsLabel": "المستندات المتجهية",
    "cacheSizeLabel": "حجم الذاكرة المؤقتة",
    "cacheEntriesLabel": "عناصر الذاكرة المؤقتة",
    "clearAllDataButton": "مسح جميع البيانات",
    "clearAllCacheButton": "مسح الذاكرة المؤقتة بالكامل",
    "cleanExpiredCacheButton": "تنظيف العناصر المنتهية",
    "exportDataButton": "تصدير البيانات",
    "importDataButton": "استيراد البيانات",
    "confirmClearDataTitle": "تأكيد مسح البيانات",
    "settingsTitle": "الإعدادات",
    "aboutTitle": "حول Brauzio",
    "helpTitle": "المساعدة",
    "clearDataWarningMessage": "ستؤدي هذه العملية إلى مسح جميع محتويات الصفحات المفهرسة والبيانات المتجهية، بما في ذلك:",
    "clearDataList1": "فهرس النصوص لجميع صفحات الويب",
    "clearDataList2": "بيانات التضمين المتجهي",
    "clearDataList3": "سجل البحث والذاكرة المؤقتة",
    "clearDataIrreversibleWarning": "لا يمكن التراجع عن هذه العملية. بعد المسح ستحتاج إلى تصفح الصفحات مجددًا لإعادة بناء الفهرس.",
    "confirmClearButton": "تأكيد المسح",
    "cacheDetailsLabel": "تفاصيل الذاكرة المؤقتة",
    "noCacheDataMessage": "لا توجد بيانات مؤقتة",
    "loadingCacheInfoStatus": "جارٍ تحميل معلومات الذاكرة المؤقتة...",
    "processingCacheStatus": "جارٍ معالجة الذاكرة المؤقتة...",
    "expiredLabel": "منتهي",
    "bookmarksBarLabel": "شريط الإشارات المرجعية",
    "newTabLabel": "علامة تبويب جديدة",
    "currentPageLabel": "الصفحة الحالية",
    "menuLabel": "القائمة",
    "navigationLabel": "التنقل",
    "mainContentLabel": "المحتوى الرئيسي",
    "languageSelectorLabel": "اللغة",
    "themeLabel": "المظهر",
    "lightTheme": "فاتح",
    "darkTheme": "داكن",
    "autoTheme": "تلقائي",
    "advancedSettingsLabel": "الإعدادات المتقدمة",
    "debugModeLabel": "وضع تصحيح الأخطاء",
    "verboseLoggingLabel": "سجل تفصيلي",
    "successNotification": "اكتملت العملية بنجاح",
    "warningNotification": "تنبيه: راجع التفاصيل قبل المتابعة",
    "infoNotification": "معلومات",
    "configCopiedNotification": "تم نسخ الإعدادات",
    "dataClearedNotification": "تم مسح البيانات بنجاح",
    "bytesUnit": "بايت",
    "kilobytesUnit": "ك.ب",
    "megabytesUnit": "م.ب",
    "gigabytesUnit": "ج.ب",
    "itemsUnit": "عنصر",
    "pagesUnit": "صفحة",
    "userscriptsManagerTitle": "إدارة سكربتات المستخدم",
    "emergencySwitchLabel": "مفتاح الإيقاف الطارئ",
    "createRunSectionTitle": "إنشاء / تشغيل",
    "nameLabel": "الاسم",
    "runAtLabel": "وقت التشغيل",
    "runAtAuto": "تلقائي",
    "runAtDocumentStart": "عند بدء المستند",
    "runAtDocumentEnd": "عند نهاية المستند",
    "runAtDocumentIdle": "عند خمول المستند",
    "worldLabel": "السياق",
    "worldAuto": "تلقائي",
    "worldIsolated": "معزول (ISOLATED)",
    "worldMain": "الرئيسي (MAIN)",
    "modeLabel": "الوضع",
    "modeAuto": "تلقائي",
    "modePersistent": "مستمر",
    "modeCss": "CSS",
    "modeOnce": "مرة واحدة",
    "allFramesLabel": "كل الإطارات",
    "persistLabel": "حفظ دائم",
    "dnrFallbackLabel": "بديل DNR",
    "matchesInputLabel": "عناوين المطابقة (مفصولة بفواصل)",
    "excludesInputLabel": "عناوين الاستثناء (مفصولة بفواصل)",
    "tagsInputLabel": "الوسوم (مفصولة بفواصل)",
    "scriptLabel": "السكربت",
    "applyButton": "تطبيق",
    "runOnceButton": "تشغيل مرة واحدة (CDP)",
    "listSectionTitle": "القائمة",
    "queryLabel": "البحث",
    "statusAll": "الكل",
    "statusEnabled": "مفعّل",
    "statusDisabled": "معطّل",
    "domainLabel": "النطاق",
    "exportAllButton": "تصدير الكل",
    "tableHeaderName": "الاسم",
    "tableHeaderWorld": "السياق",
    "tableHeaderRunAt": "وقت التشغيل",
    "tableHeaderUpdated": "آخر تحديث",
    "deleteButton": "حذف",
    "placeholderOptional": "اختياري",
    "placeholderMatchesExample": "مثال: https://*.example.com/*",
    "placeholderScriptHint": "ألصق JavaScript أو CSS أو TM هنا",
    "placeholderDomainHint": "example.com",
}


def write_ar_locale() -> None:
    en_path = LOCALES / "en" / "messages.json"
    data = json.loads(en_path.read_text(encoding="utf-8"))
    missing = sorted(set(data) - set(AR))
    extra = sorted(set(AR) - set(data))
    if missing:
        raise RuntimeError(f"Missing Arabic translations: {missing}")
    if extra:
        print(f"Warning: translation keys not present upstream: {extra}")

    ar_data = {}
    for key, value in data.items():
        item = dict(value)
        item["message"] = AR[key]
        item["description"] = "ترجمة واجهة Brauzio العربية"
        ar_data[key] = item

    ar_dir = LOCALES / "ar"
    ar_dir.mkdir(parents=True, exist_ok=True)
    (ar_dir / "messages.json").write_text(
        json.dumps(ar_data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )

    data["extensionName"]["message"] = "Brauzio"
    data["extensionDescription"]["message"] = "Control Chrome and browser tools with Brauzio"
    en_path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def remove_chinese_locales_and_docs() -> None:
    for locale in ("zh_CN", "zh_TW"):
        path = LOCALES / locale
        if path.exists():
            shutil.rmtree(path)

    targets = [
        ROOT / "README_zh.md",
        ROOT / "docs" / "ARCHITECTURE_zh.md",
        ROOT / "docs" / "CONTRIBUTING_zh.md",
        ROOT / "docs" / "TOOLS_zh.md",
        ROOT / "docs" / "TROUBLESHOOTING_zh.md",
        ROOT / "docs" / "VisualEditor_zh.md",
        ROOT / "docs" / "WINDOWS_INSTALL_zh.md",
    ]
    for path in targets:
        if path.exists():
            path.unlink()


def brand_manifest() -> None:
    path = EXT / "wxt.config.ts"
    text = path.read_text(encoding="utf-8")
    text = text.replace("default_locale: 'zh_CN'", "default_locale: 'ar'")
    text = text.replace("default_title: 'Chrome MCP Server'", "default_title: 'Brauzio'")
    # Remove Chinese-only line comments from this config while keeping executable code untouched.
    text = "\n".join(
        line for line in text.splitlines()
        if not (line.lstrip().startswith("//") and re.search(r"[\u3400-\u9fff]", line))
    ) + "\n"
    path.write_text(text, encoding="utf-8")


def make_entry_pages_rtl() -> None:
    for path in EXT.glob("entrypoints/*/index.html"):
        text = path.read_text(encoding="utf-8")
        if "<html" not in text:
            continue
        text = re.sub(r"<html([^>]*)>", lambda m: _rtl_html_tag(m.group(0)), text, count=1)
        path.write_text(text, encoding="utf-8")


def _rtl_html_tag(tag: str) -> str:
    tag = re.sub(r'\s+lang="[^"]*"', "", tag)
    tag = re.sub(r'\s+dir="[^"]*"', "", tag)
    return tag[:-1] + ' lang="ar" dir="rtl">'


def audit_chinese() -> None:
    patterns = {".ts", ".tsx", ".js", ".vue", ".html", ".css", ".md", ".json", ".yaml", ".yml"}
    hits: list[str] = []
    for path in ROOT.rglob("*"):
        if not path.is_file() or path.suffix.lower() not in patterns:
            continue
        if ".git" in path.parts or "node_modules" in path.parts:
            continue
        try:
            lines = path.read_text(encoding="utf-8").splitlines()
        except UnicodeDecodeError:
            continue
        for n, line in enumerate(lines, 1):
            if re.search(r"[\u3400-\u9fff]", line):
                rel = path.relative_to(ROOT)
                hits.append(f"- `{rel}:{n}` — `{line.strip()[:180].replace('`', "'")}`")

    audit = ROOT / "docs" / "CHINESE_AUDIT.md"
    audit.parent.mkdir(parents=True, exist_ok=True)
    body = [
        "# Brauzio Chinese-language audit",
        "",
        "Generated automatically by `scripts/brauzio_phase1.py`.",
        "",
    ]
    if hits:
        body += [f"Remaining CJK-containing lines: **{len(hits)}**", "", *hits]
    else:
        body += ["No Chinese-language text remains in scanned source/document files."]
    audit.write_text("\n".join(body) + "\n", encoding="utf-8")


def main() -> None:
    write_ar_locale()
    remove_chinese_locales_and_docs()
    brand_manifest()
    make_entry_pages_rtl()
    audit_chinese()
    print("Brauzio phase 1 complete")


if __name__ == "__main__":
    main()
