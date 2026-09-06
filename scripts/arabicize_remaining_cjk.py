#!/usr/bin/env python3
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
CJK = re.compile(r'[\u3400-\u4dbf\u4e00-\u9fff]')

FILE_MAPS = {
    'app/chrome-extension/utils/semantic-similarity-engine.ts': {
        '这是一个包含多个句子的较长文本。它有助于为各种文本长度预热模型。': 'هذا نص أطول يحتوي على عدة جمل. يساعد على تهيئة النموذج لأطوال نصية متنوعة.',
        '你好世界，这是一个测试。': 'مرحبًا بالعالم، هذا اختبار.',
        '输入文本可能过长，将由分词器截断。': 'قد يكون نص الإدخال طويلًا جدًا وسيتم اقتطاعه بواسطة محلل الرموز.',
        '输入必须是字符串': 'يجب أن يكون الإدخال نصًا',
        '输入文本不能为空': 'لا يمكن أن يكون نص الإدخال فارغًا',
        '你好': 'مرحبًا',
    },
    'app/chrome-extension/inject-scripts/element-marker.js': {
        '列表模式 - 批量标注相似元素 (仅支持CSS)': 'وضع القائمة - تحديد عناصر متشابهة دفعة واحدة (CSS فقط)',
        '✓ 验证成功 (匹配 ${filteredMatches.length} 个元素)': '✓ تم التحقق بنجاح (تمت مطابقة ${filteredMatches.length} عنصرًا)',
        '✓ 已复制到剪贴板': '✓ تم النسخ إلى الحافظة',
        '元素标注': 'تحديد العناصر',
        '验证失败': 'فشل التحقق',
        '错误:': 'خطأ:',
    },
    'app/chrome-extension/inject-scripts/recorder.js': {
        '隐藏输入值': 'إخفاء قيم الإدخال',
        '已录制步骤': 'الخطوات المسجلة',
        '未命名录制': 'تسجيل بلا اسم',
        '未知步骤': 'خطوة غير معروفة',
        '打开标签页': 'فتح علامة تبويب',
        '切换标签页': 'تبديل علامة التبويب',
        '切换Frame': 'تبديل Frame',
        '已暂停': 'متوقف مؤقتًا',
        '录制中': 'جارٍ التسجيل',
        '双击': 'نقر مزدوج',
        '高亮': 'تمييز',
        '折叠': 'طي',
        '展开': 'توسيع',
        '暂停': 'إيقاف مؤقت',
        '继续': 'متابعة',
        '停止': 'إيقاف',
        '点击': 'نقر',
        '输入': 'إدخال',
        '容器': 'الحاوية',
        '页面': 'الصفحة',
        '滚动': 'تمرير',
        '包含': 'يتضمن',
        '等待': 'انتظار',
        '步骤': 'خطوة',
    },
    'app/chrome-extension/inject-scripts/accessibility-tree-helper.js': {
        'Record-Replay 运行日志': 'سجل تشغيل Record-Replay',
        '点击选取元素（Esc 取消）': 'انقر لاختيار عنصر (Esc للإلغاء)',
        '请输入回放参数': 'أدخل معاملات إعادة التشغيل',
        '请输入参数 ': 'أدخل المعامل ',
        ' (敏感)': ' (حساس)',
        '确定': 'تأكيد',
        '取消': 'إلغاء',
    },
    'app/chrome-extension/inject-scripts/web-fetcher-helper.js': {
        '|广告': '',
        '|正在加载': '',
    },
    'app/chrome-extension/entrypoints/background/record-replay/index.ts': {
        '运行工作流': 'تشغيل سير العمل',
    },
    'app/chrome-extension/entrypoints/background/web-editor/index.ts': {
        '切换网页编辑模式': 'تبديل وضع تحرير الويب',
        '智能助手': 'المساعد الذكي',
    },
    'app/chrome-extension/entrypoints/background/element-marker/index.ts': {
        '标注元素': 'تحديد عنصر',
    },
    'app/chrome-extension/entrypoints/background/record-replay/nodes/fill.ts': {
        '缺少目标选择器候选或输入值': 'محدد الهدف أو قيمة الإدخال مفقودة',
    },
    'app/chrome-extension/entrypoints/background/record-replay/nodes/click.ts': {
        '缺少目标选择器候选': 'محدد الهدف مفقود',
    },
    'app/chrome-extension/entrypoints/background/record-replay/nodes/download-screenshot-attr-event-frame-loop.ts': {
        '缺少目标选择器或事件类型': 'محدد الهدف أو نوع الحدث مفقود',
        '需提供目标选择器与属性名': 'يجب توفير محدد الهدف واسم الخاصية',
        '需提供 selector 与 subflowId': 'يجب توفير selector و subflowId',
    },
    'app/chrome-extension/entrypoints/background/record-replay/nodes/conditional.ts': {
        '缺少条件或分支': 'الشرط أو الفرع مفقود',
    },
    'app/chrome-extension/entrypoints/background/record-replay/nodes/assert.ts': {
        'assert.attribute: 需提供 selector 与 name': 'assert.attribute: يجب توفير selector و name',
        '缺少断言条件': 'شرط التحقق مفقود',
    },
    'app/chrome-extension/entrypoints/background/record-replay/nodes/loops.ts': {
        'foreach: 需提供 listVar 与 subflowId': 'foreach: يجب توفير listVar و subflowId',
        'while: 需提供 condition 与 subflowId': 'while: يجب توفير condition و subflowId',
    },
    'app/chrome-extension/entrypoints/background/record-replay/nodes/navigate.ts': {
        '缺少 URL': 'رابط URL مفقود',
    },
    'app/chrome-extension/entrypoints/background/record-replay/nodes/execute-flow.ts': {
        '需提供 flowId': 'يجب توفير flowId',
    },
    'app/chrome-extension/entrypoints/background/record-replay/nodes/wait.ts': {
        '缺少等待条件': 'شرط الانتظار مفقود',
    },
}

changed = []
for rel, mapping in FILE_MAPS.items():
    path = ROOT / rel
    if not path.exists():
        print(f'SKIP missing: {rel}')
        continue
    text = path.read_text(encoding='utf-8')
    original = text
    for source, target in sorted(mapping.items(), key=lambda kv: len(kv[0]), reverse=True):
        text = text.replace(source, target)
    if text != original:
        path.write_text(text, encoding='utf-8')
        changed.append(rel)

print(f'Arabicized {len(changed)} runtime files')
for rel in changed:
    print(rel)

# Final repository-wide CJK gate, excluding Japanese/Korean locale files.
text_exts = {'.ts', '.tsx', '.js', '.mjs', '.cjs', '.vue', '.html', '.css', '.md', '.json', '.yaml', '.yml'}
skip_parts = {'.git', 'node_modules', '.output', 'dist'}
exclude = {
    Path('app/chrome-extension/_locales/ja/messages.json'),
    Path('app/chrome-extension/_locales/ko/messages.json'),
}
leftovers = []
for path in ROOT.rglob('*'):
    if not path.is_file() or path.suffix.lower() not in text_exts:
        continue
    rel = path.relative_to(ROOT)
    if any(part in skip_parts for part in rel.parts) or rel in exclude:
        continue
    if rel in {Path('scripts/arabicize_remaining_cjk.py'), Path('scripts/audit_chinese.py')}:
        continue
    try:
        for num, line in enumerate(path.read_text(encoding='utf-8').splitlines(), 1):
            if CJK.search(line):
                leftovers.append((str(rel), num, line.strip()))
    except UnicodeDecodeError:
        pass

if leftovers:
    print(f'REMAINING_CJK={len(leftovers)}')
    for rel, num, line in leftovers[:200]:
        print(f'{rel}:{num}: {line}')
    raise SystemExit(2)

print('REMAINING_CJK=0')
