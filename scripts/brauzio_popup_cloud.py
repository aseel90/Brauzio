#!/usr/bin/env python3
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
P = ROOT / 'app/chrome-extension/entrypoints/popup/App.vue'
CARD = ROOT / 'app/chrome-extension/entrypoints/popup/components/RemoteConnectionCard.vue'
WXT = ROOT / 'app/chrome-extension/wxt.config.ts'

text = P.read_text(encoding='utf-8')

# Brand header.
text = text.replace('<h1 class="header-title">Chrome MCP Server</h1>', '<h1 class="header-title">Brauzio</h1>')
text = text.replace('<p class="footer-text">chrome mcp server for ai</p>', '<p class="footer-text">Brauzio — تحكم ذكي بالمتصفح عبر MCP</p>')

# Replace the native-server card with the Cloudflare relay card.
start_marker = '        <!-- 服务配置卡片 -->'
end_marker = '        <!-- 快捷工具卡片 -->'
if start_marker in text and end_marker in text:
    start = text.index(start_marker)
    end = text.index(end_marker)
    replacement = '''        <!-- اتصال Brauzio Cloud -->\n        <div class="section">\n          <RemoteConnectionCard />\n        </div>\n\n        <!-- الأدوات السريعة -->\n'''
    text = text[:start] + replacement + text[end + len(end_marker):]

# User-visible hardcoded strings.
replacements = {
    '<h2 class="section-title">快捷工具</h2>': '<h2 class="section-title">الأدوات السريعة</h2>',
    'data-tooltip="录制功能开发中"': 'data-tooltip="ميزة التسجيل قيد التطوير"',
    'data-tooltip="开启页面编辑模式"': 'data-tooltip="تشغيل وضع تحرير الصفحة"',
    'data-tooltip="开启元素标注"': 'data-tooltip="تشغيل تحديد العناصر"',
    '<h2 class="section-title">管理入口</h2>': '<h2 class="section-title">الإدارة</h2>',
    '<span class="entry-title">智能助手</span>': '<span class="entry-title">المساعد الذكي</span>',
    '<span class="entry-desc">AI Agent 对话与任务</span>': '<span class="entry-desc">محادثات ومهام وكيل الذكاء الاصطناعي</span>',
    '工作流管理\n                  <span class="coming-soon-badge">Coming Soon</span>': 'إدارة سير العمل\n                  <span class="coming-soon-badge">قريبًا</span>',
    '<span class="entry-desc">录制与回放自动化流程</span>': '<span class="entry-desc">تسجيل وتشغيل مهام الأتمتة</span>',
    '<span class="entry-title">元素标注管理</span>': '<span class="entry-title">إدارة تحديد العناصر</span>',
    '<span class="entry-desc">管理页面元素标注</span>': '<span class="entry-desc">إدارة العناصر المحددة داخل الصفحات</span>',
    '<span class="entry-title">本地模型</span>': '<span class="entry-title">النموذج المحلي</span>',
    '<span class="entry-desc">语义引擎与模型管理</span>': '<span class="entry-desc">إدارة المحرك الدلالي والنماذج</span>',
    '<span>{{ comingSoonToast.feature }} 功能开发中，敬请期待</span>': '<span>{{ comingSoonToast.feature }} — الميزة قيد التطوير وستتوفر قريبًا</span>',
    "'未知错误'": "'خطأ غير معروف'",
}
for old, new in replacements.items():
    text = text.replace(old, new)

text = text.replace('            Guide\n', '            دليل الاستخدام\n')
text = text.replace('            Docs\n', '            المساعدة\n')
text = text.replace('title="View installation guide"', 'title="دليل التثبيت"')
text = text.replace('title="Troubleshooting"', 'title="استكشاف الأخطاء"')

# Arabic values passed to the coming-soon toast.
text = text.replace("showComingSoonToast('录制回放')", "showComingSoonToast('التسجيل وإعادة التشغيل')")
text = text.replace("showComingSoonToast('工作流管理')", "showComingSoonToast('إدارة سير العمل')")

# Add cloud component import once.
import_anchor = "import LocalModelPage from './components/LocalModelPage.vue';"
if "RemoteConnectionCard from './components/RemoteConnectionCard.vue'" not in text:
    text = text.replace(
        import_anchor,
        import_anchor + "\nimport RemoteConnectionCard from './components/RemoteConnectionCard.vue';",
    )

# Native connection is no longer part of popup initialization.
for line in (
    '  await loadPortPreference();\n',
    '  await checkNativeConnection();\n',
    '  await checkServerStatus();\n',
):
    text = text.replace(line, '')

# Remove Chinese-only comments from the popup. They do not affect runtime behavior.
text = re.sub(r'<!--(?:(?!-->).)*[\u3400-\u9fff](?:(?!-->).)*-->', '', text, flags=re.S)
text = re.sub(r'(?m)^\s*//[^\n]*[\u3400-\u9fff][^\n]*\n?', '', text)

# Translate remaining Chinese console-only text in this file without changing logic.
for line in text.splitlines():
    if 'console.' in line and re.search(r'[\u3400-\u9fff]', line):
        cleaned = re.sub(r'[\u3400-\u9fff]+', 'Brauzio', line)
        text = text.replace(line, cleaned)

P.write_text(text, encoding='utf-8')

# The same private token can bootstrap both the browser WebSocket and the MCP URL.
card = CARD.read_text(encoding='utf-8')
needle = "    url.searchParams.set('device', form.deviceId || 'default');\n"
if "url.searchParams.set('key', form.deviceToken);" not in card:
    card = card.replace(
        needle,
        needle + "    url.searchParams.set('key', form.deviceToken);\n",
    )
card = card.replace('رابط MCP لـ ChatGPT', 'رابط MCP الخاص لـ ChatGPT')
if 'احتفظ بهذا الرابط سريًا' not in card:
    card = card.replace(
        '    </div>\n\n    <p v-if="status.lastError" class="cloud-error">',
        '    </div>\n    <p v-if="mcpUrl" class="mcp-secret-note">احتفظ بهذا الرابط سريًا لأنه يحتوي رمز الوصول.</p>\n\n    <p v-if="status.lastError" class="cloud-error">',
        1,
    )
    card = card.replace(
        '.cloud-error {\n',
        '.mcp-secret-note {\n  margin: 6px 2px 0;\n  color: #64748b;\n  font-size: 9px;\n  line-height: 1.5;\n}\n\n.cloud-error {\n',
        1,
    )
CARD.write_text(card, encoding='utf-8')

# Brauzio Cloud does not require Chrome Native Messaging permission.
wxt = WXT.read_text(encoding='utf-8')
wxt = wxt.replace("      'nativeMessaging',\n", '')
WXT.write_text(wxt, encoding='utf-8')

print('Brauzio popup and Cloud connection finalized')
