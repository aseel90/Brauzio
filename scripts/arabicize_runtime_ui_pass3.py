#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
files = {
    'app/chrome-extension/entrypoints/popup/components/builder/components/properties/PropertySetAttribute.vue': {
        'قيمة الخاصية（留فارغ并勾选حذف则移除）': 'قيمة الخاصية (اتركها فارغة وحدد حذف لإزالتها)',
    },
    'app/chrome-extension/entrypoints/popup/components/builder/components/properties/PropertySwitchFrame.vue': {
        '按 URL يحتويمطابقة（优先）': 'المطابقة باحتواء URL (أولوية)',
        '同源/可注入 frame 可用；留فارغ则回到顶级الصفحة': 'يعمل مع الإطارات من نفس المصدر أو القابلة للحقن؛ اتركه فارغًا للعودة إلى الصفحة الرئيسية',
    },
    'app/chrome-extension/entrypoints/popup/components/builder/components/properties/PropertyDrag.vue': {
        'ملاحظة: المسار（path）通常在录制时自动生成，يدويإنشاء时可留فارغ。': 'ملاحظة: يُنشأ المسار (path) تلقائيًا عادةً أثناء التسجيل ويمكن تركه فارغًا عند الإنشاء اليدوي.',
    },
    'app/chrome-extension/entrypoints/sidepanel/App.vue': {
        'هل تريد حذف التحديد "${marker.name}" 吗?': 'هل تريد حذف التحديد "${marker.name}"؟',
    },
    'app/chrome-extension/entrypoints/sidepanel/components/SidepanelNavigator.vue': {
        'تبديل الصفحة（可سحب وإفلات移动，نقر مزدوج重置位置）': 'تبديل الصفحة (يمكن سحبها لتحريكها، وانقر مرتين لإعادة موضعها)',
    },
    'app/chrome-extension/entrypoints/builder/App.vue': {
        'العقدة ${n.id} 的جدولة #${i + 1}: V3 暂不支持مرة واحدة性جدولة（once），تم التخطي': 'جدولة العقدة ${n.id} رقم ${i + 1}: لا يدعم V3 الجدولة لمرة واحدة (once) حاليًا، وتم تجاوزها',
        'العقدة ${n.id} 的جدولة #${i + 1}: تعذر التحويل إلى cron（type=${scheduleType}），تم التخطي': 'جدولة العقدة ${n.id} رقم ${i + 1}: تعذر تحويلها إلى cron (type=${scheduleType})، وتم تجاوزها',
    },
    'packages/shared/src/node-specs-builtin.ts': {
        '文件名يحتوي': 'اسم الملف يتضمن',
        '一次': 'مرة واحدة',
    },
}

changed = []
for rel, replacements in files.items():
    path = ROOT / rel
    text = path.read_text(encoding='utf-8')
    original = text
    for source, target in replacements.items():
        text = text.replace(source, target)
    if text != original:
        path.write_text(text, encoding='utf-8')
        changed.append(rel)

print(f'Final Arabic UI cleanup changed {len(changed)} files')
for rel in changed:
    print(rel)
