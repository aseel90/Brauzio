#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
P = ROOT / 'app/chrome-extension/entrypoints/popup/App.vue'
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
    '>Guide\n          </button>': '>دليل الاستخدام\n          </button>',
    '>Docs\n          </button>': '>المساعدة\n          </button>',
    '<span>{{ comingSoonToast.feature }} 功能开发中，敬请期待</span>': '<span>{{ comingSoonToast.feature }} — الميزة قيد التطوير وستتوفر قريبًا</span>',
}
for old, new in replacements.items():
    text = text.replace(old, new)

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

P.write_text(text, encoding='utf-8')
print('Brauzio popup switched to Cloud connection UI')
