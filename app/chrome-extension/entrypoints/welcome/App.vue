<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { LINKS } from '@/common/constants';

import '../sidepanel/styles/agent-chat.css';

type RelayState = 'disabled' | 'connecting' | 'connected' | 'disconnected' | 'error';

const state = ref<RelayState>('disconnected');
const authenticated = ref(false);
const relayUrl = ref('');
const deviceId = ref('default');
const deviceToken = ref('');
const copied = ref(false);

const statusLabel = computed(() => {
  if (state.value === 'connected' && authenticated.value) return 'متصل وآمن';
  if (state.value === 'connecting') return 'جارٍ الاتصال';
  if (state.value === 'error') return 'يوجد خطأ في الاتصال';
  if (state.value === 'disabled') return 'الاتصال التلقائي متوقف';
  return 'غير متصل بعد';
});

const mcpUrl = computed(() => {
  if (!relayUrl.value || !deviceToken.value) return '';
  try {
    const raw = /^https?:\/\//i.test(relayUrl.value)
      ? relayUrl.value
      : `https://${relayUrl.value}`;
    const url = new URL(raw);
    url.protocol = url.protocol === 'http:' ? 'http:' : 'https:';
    if (!url.pathname || url.pathname === '/' || url.pathname.endsWith('/ws')) {
      url.pathname = '/mcp';
    }
    url.searchParams.set('device', deviceId.value || 'default');
    url.searchParams.set('key', deviceToken.value);
    return url.toString();
  } catch {
    return '';
  }
});

async function loadState() {
  const [configResponse, statusResponse] = await Promise.all([
    chrome.runtime.sendMessage({ type: 'brauzio_relay_get_config' }),
    chrome.runtime.sendMessage({ type: 'brauzio_relay_get_status' }),
  ]);

  if (configResponse?.success && configResponse.config) {
    relayUrl.value = String(configResponse.config.relayUrl || '');
    deviceId.value = String(configResponse.config.deviceId || 'default');
    deviceToken.value = String(configResponse.config.deviceToken || '');
  }

  if (statusResponse?.success && statusResponse.status) {
    state.value = statusResponse.status.state || 'disconnected';
    authenticated.value = Boolean(statusResponse.status.authenticated);
  }
}

async function copyMcpUrl() {
  if (!mcpUrl.value) return;
  await navigator.clipboard.writeText(mcpUrl.value);
  copied.value = true;
  window.setTimeout(() => (copied.value = false), 1600);
}

async function openDocs(): Promise<void> {
  try {
    await chrome.tabs.create({ url: LINKS.TROUBLESHOOTING });
  } catch {
    window.open(LINKS.TROUBLESHOOTING, '_blank', 'noopener,noreferrer');
  }
}

onMounted(() => {
  void loadState();
});
</script>

<template>
  <div class="agent-theme welcome-root" dir="rtl">
    <main class="welcome-shell">
      <section class="welcome-card hero-card">
        <div class="brand-row">
          <div class="brand-icon" aria-hidden="true">B</div>
          <div>
            <p class="eyebrow">BRAUZIO CLOUD</p>
            <h1>تم تثبيت Brauzio</h1>
          </div>
          <span class="status-pill" :class="`status-${state}`">{{ statusLabel }}</span>
        </div>

        <p class="lead">
          لا تحتاج إلى Node.js أو Native Messaging أو cloudflared. يتصل Brauzio مباشرة بخدمة
          Cloudflare الخاصة بك، ثم يستخدم ChatGPT رابط MCP للتحكم في Chrome.
        </p>
      </section>

      <section class="welcome-card steps-card">
        <h2>إعداد الاتصال</h2>
        <div class="steps">
          <div class="step">
            <span>1</span>
            <div>
              <strong>افتح نافذة إضافة Brauzio</strong>
              <p>أدخل رابط Cloudflare Worker ومعرف الجهاز ورمز الربط السري.</p>
            </div>
          </div>
          <div class="step">
            <span>2</span>
            <div>
              <strong>اضغط «حفظ واتصال»</strong>
              <p>عندما تظهر الحالة «متصل وآمن» يصبح متصفحك جاهزًا لاستقبال أدوات MCP.</p>
            </div>
          </div>
          <div class="step">
            <span>3</span>
            <div>
              <strong>أضف رابط MCP إلى ChatGPT</strong>
              <p>انسخ الرابط الخاص من نافذة Brauzio وأضفه كـ Custom MCP في ChatGPT.</p>
            </div>
          </div>
        </div>
      </section>

      <section v-if="mcpUrl" class="welcome-card mcp-card">
        <div>
          <p class="eyebrow">رابط MCP الحالي</p>
          <code>{{ mcpUrl }}</code>
          <small>هذا الرابط يحتوي رمز وصول. لا تشاركه مع أي شخص.</small>
        </div>
        <button type="button" @click="copyMcpUrl">{{ copied ? 'تم النسخ' : 'نسخ الرابط' }}</button>
      </section>

      <section v-else class="welcome-card note-card">
        لم يتم حفظ إعدادات Cloudflare بعد. افتح نافذة الإضافة وأكمل بيانات Brauzio Cloud أولًا.
      </section>

      <div class="footer-actions">
        <button type="button" class="secondary-button" @click="openDocs">دليل استكشاف الأخطاء</button>
      </div>
    </main>
  </div>
</template>

<style scoped>
.welcome-root {
  min-height: 100vh;
  background: var(--ac-bg);
  background-image: var(--ac-bg-pattern);
  background-size: var(--ac-bg-pattern-size);
  color: var(--ac-text);
  font-family: var(--ac-font-body);
}

.welcome-shell {
  width: min(760px, calc(100% - 32px));
  margin: 0 auto;
  padding: 42px 0;
}

.welcome-card {
  margin-bottom: 16px;
  padding: 22px;
  background: var(--ac-surface);
  border: var(--ac-border-width) solid var(--ac-border);
  border-radius: var(--ac-radius-card);
  box-shadow: var(--ac-shadow-card);
}

.hero-card {
  box-shadow: var(--ac-shadow-float);
}

.brand-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.brand-icon {
  width: 42px;
  height: 42px;
  display: grid;
  place-items: center;
  flex: 0 0 auto;
  border-radius: 12px;
  background: var(--ac-accent);
  color: white;
  font-family: var(--ac-font-heading);
  font-size: 20px;
  font-weight: 800;
}

.eyebrow {
  margin: 0 0 3px;
  color: var(--ac-text-subtle);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.08em;
}

h1,
h2 {
  margin: 0;
  color: var(--ac-text);
  font-family: var(--ac-font-heading);
}

h1 {
  font-size: 22px;
}

h2 {
  margin-bottom: 16px;
  font-size: 17px;
}

.lead {
  margin: 18px 0 0;
  color: var(--ac-text-muted);
  font-size: 14px;
  line-height: 1.9;
}

.status-pill {
  margin-inline-start: auto;
  padding: 7px 10px;
  border-radius: 999px;
  background: var(--ac-surface-muted);
  color: var(--ac-text-muted);
  font-size: 11px;
  font-weight: 700;
  white-space: nowrap;
}

.status-connected {
  background: #ecfdf5;
  color: #047857;
}

.status-connecting {
  background: #fffbeb;
  color: #b45309;
}

.status-error {
  background: #fef2f2;
  color: #b91c1c;
}

.steps {
  display: grid;
  gap: 14px;
}

.step {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.step > span {
  width: 27px;
  height: 27px;
  display: grid;
  place-items: center;
  flex: 0 0 auto;
  border-radius: 50%;
  background: var(--ac-accent);
  color: white;
  font-family: var(--ac-font-mono);
  font-size: 12px;
  font-weight: 700;
}

.step strong {
  display: block;
  font-size: 14px;
}

.step p {
  margin: 4px 0 0;
  color: var(--ac-text-muted);
  font-size: 12px;
  line-height: 1.7;
}

.mcp-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
}

.mcp-card > div {
  min-width: 0;
}

.mcp-card code {
  display: block;
  overflow: hidden;
  margin-top: 6px;
  direction: ltr;
  text-align: left;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--ac-text);
  font-family: var(--ac-font-code);
  font-size: 11px;
}

.mcp-card small {
  display: block;
  margin-top: 7px;
  color: var(--ac-text-subtle);
  font-size: 10px;
}

.mcp-card button,
.secondary-button {
  border: var(--ac-border-width) solid var(--ac-border);
  border-radius: var(--ac-radius-button);
  padding: 9px 13px;
  background: var(--ac-surface);
  color: var(--ac-text-muted);
  font-family: var(--ac-font-body);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}

.mcp-card button {
  flex: 0 0 auto;
  border-color: var(--ac-accent);
  background: var(--ac-accent);
  color: white;
}

.note-card {
  color: var(--ac-text-muted);
  font-size: 12px;
  line-height: 1.8;
}

.footer-actions {
  display: flex;
  justify-content: flex-start;
  padding-top: 2px;
}

@media (max-width: 560px) {
  .welcome-shell {
    width: min(100% - 20px, 760px);
    padding: 20px 0;
  }

  .brand-row,
  .mcp-card {
    align-items: stretch;
    flex-direction: column;
  }

  .status-pill {
    align-self: flex-start;
    margin-inline-start: 0;
  }
}
</style>
