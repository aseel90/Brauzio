/**
 * Brauzio i18n helper.
 * Chrome i18n is the primary source; Arabic is the safe fallback outside extension APIs.
 */
const fallbackMessages: Record<string, string> = {
  "extensionName": "Brauzio",
  "extensionDescription": "تحكم بمتصفح Chrome وأدواته عبر Brauzio",
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
  "mcpServerConfigLabel": "إعداد خادم MCP",
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
  "placeholderDomainHint": "example.com"
};

function applyFallbackSubstitutions(message: string, substitutions?: string[]): string {
  if (!substitutions?.length) return message;

  let index = 0;
  let output = message.replace(/\$[A-Z0-9_]+\$/gi, (token) => {
    if (token === '$$') return '$';
    const value = substitutions[index];
    index += 1;
    return value ?? token;
  });

  substitutions.forEach((value, position) => {
    output = output.replace(`{${position}}`, value);
  });

  return output;
}

/**
 * Safe localized message getter with Arabic fallback support.
 */
export function getMessage(key: string, substitutions?: string[]): string {
  try {
    if (typeof chrome !== 'undefined' && chrome.i18n && chrome.i18n.getMessage) {
      const message = chrome.i18n.getMessage(key, substitutions);
      if (message) return message;
    }
  } catch (error) {
    console.warn(`Brauzio i18n fallback for key "${key}":`, error);
  }

  return applyFallbackSubstitutions(fallbackMessages[key] || key, substitutions);
}

/**
 * Check if Chrome extension i18n APIs are available.
 */
export function isI18nAvailable(): boolean {
  try {
    return (
      typeof chrome !== 'undefined' && chrome.i18n && typeof chrome.i18n.getMessage === 'function'
    );
  } catch {
    return false;
  }
}
