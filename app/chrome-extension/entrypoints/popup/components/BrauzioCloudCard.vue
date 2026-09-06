<template>
  <section class="cloud-card" dir="rtl">
    <div class="cloud-head">
      <div>
        <h2>اتصال Brauzio Cloud</h2>
        <p>اربط الإضافة مباشرةً بخادم Cloudflare ليتمكن ChatGPT من استخدام أدوات المتصفح.</p>
      </div>
      <span :class="['status-pill', statusClass]">{{ statusText }}</span>
    </div>

    <label class="field">
      <span>رابط Cloudflare</span>
      <input
        v-model.trim="form.relayUrl"
        type="url"
        inputmode="url"
        autocomplete="off"
        placeholder="https://brauzio-mcp.example.workers.dev"
        dir="ltr"
      />
    </label>

    <div class="grid-two">
      <label class="field">
        <span>معرّف الجهاز</span>
        <input v-model.trim="form.deviceId" type="text" autocomplete="off" placeholder="default" dir="ltr" />
      </label>

      <label class="field">
        <span>رمز الاتصال</span>
        <input
          v-model="form.deviceToken"
          type="password"
          autocomplete="new-password"
          placeholder="••••••••••••••••"
          dir="ltr"
        />
      </label>
    </div>

    <label class="auto-connect">
      <input v-model="form.autoConnect" type="checkbox" />
      <span>إعادة الاتصال تلقائيًا عند تشغيل Chrome</span>
    </label>

    <div v-if="status.lastError" class="error-box">{{ translatedError }}</div>

    <div class="actions">
      <button class="primary" :disabled="busy" @click="saveAndConnect">
        {{ busy ? 'جارٍ الحفظ...' : 'حفظ واتصال' }}
      </button>
      <button class="secondary" :disabled="busy || status.state !== 'connected'" @click="disconnect">
        قطع الاتصال
      </button>
    </div>

    <div v-if="mcpUrl" class="mcp-box">
      <div class="mcp-title-row">
        <div>
          <strong>رابط ChatGPT Custom MCP</strong>
          <small>استخدم هذا الرابط في إعداد Custom MCP بعد نشر Worker.</small>
        </div>
        <button class="copy" @click="copyMcpUrl">{{ copied ? 'تم النسخ' : 'نسخ الرابط' }}</button>
      </div>
      <code dir="ltr">{{ maskedMcpUrl }}</code>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue';

type RelayState = 'disabled' | 'connecting' | 'connected' | 'disconnected' | 'error';

interface RelayStatus {
  state: RelayState;
  authenticated: boolean;
  lastUpdated: number;
  lastError?: string;
}

interface RelayConfig {
  relayUrl: string;
  deviceId: string;
  deviceToken: string;
  autoConnect: boolean;
}

const form = reactive<RelayConfig>({
  relayUrl: '',
  deviceId: 'default',
  deviceToken: '',
  autoConnect: true,
});

const status = reactive<RelayStatus>({
  state: 'disconnected',
  authenticated: false,
  lastUpdated: Date.now(),
});

const busy = ref(false);
const copied = ref(false);

const statusText = computed(() => {
  if (status.state === 'connected' && status.authenticated) return 'متصل';
  if (status.state === 'connecting') return 'جارٍ الاتصال';
  if (status.state === 'disabled') return 'الاتصال التلقائي متوقف';
  if (status.state === 'error') return 'خطأ في الاتصال';
  return 'غير متصل';
});

const statusClass = computed(() => {
  if (status.state === 'connected' && status.authenticated) return 'ok';
  if (status.state === 'connecting') return 'wait';
  if (status.state === 'error') return 'bad';
  return 'off';
});

const translatedError = computed(() => {
  const value = status.lastError || '';
  const known: Record<string, string> = {
    'Authentication failed': 'فشل التحقق من رمز الاتصال.',
    'WebSocket connection error': 'تعذر فتح اتصال WebSocket مع Cloudflare.',
    'Relay URL is not configured': 'أدخل رابط Cloudflare أولًا.',
    'Device token is not configured': 'أدخل رمز الاتصال أولًا.',
  };
  return known[value] || value;
});

function toMcpBase(value: string): string {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const withScheme = /^https?:\/\//i.test(raw) || /^wss?:\/\//i.test(raw) ? raw : `https://${raw}`;
    const url = new URL(withScheme);
    url.protocol = url.protocol === 'ws:' || url.protocol === 'http:' ? 'http:' : 'https:';
    if (url.pathname.endsWith('/ws')) url.pathname = url.pathname.slice(0, -3);
    if (url.pathname.endsWith('/mcp')) url.pathname = url.pathname.slice(0, -4);
    url.pathname = `${url.pathname.replace(/\/$/, '')}/mcp`;
    url.search = '';
    url.hash = '';
    return url.toString();
  } catch {
    return '';
  }
}

const mcpUrl = computed(() => {
  const base = toMcpBase(form.relayUrl);
  if (!base || !form.deviceToken) return '';
  const url = new URL(base);
  url.searchParams.set('device', form.deviceId || 'default');
  url.searchParams.set('key', form.deviceToken);
  return url.toString();
});

const maskedMcpUrl = computed(() => {
  if (!mcpUrl.value) return '';
  const url = new URL(mcpUrl.value);
  if (url.searchParams.has('key')) url.searchParams.set('key', '••••••••');
  return url.toString();
});

function applyStatus(next?: Partial<RelayStatus>) {
  if (!next) return;
  Object.assign(status, next);
}

async function load() {
  try {
    const configResponse = await chrome.runtime.sendMessage({ type: 'brauzio_relay_get_config' });
    if (configResponse?.success && configResponse.config) Object.assign(form, configResponse.config);
  } catch {}

  try {
    const statusResponse = await chrome.runtime.sendMessage({ type: 'brauzio_relay_get_status' });
    if (statusResponse?.success) applyStatus(statusResponse.status);
  } catch {}
}

async function saveAndConnect() {
  if (busy.value) return;
  busy.value = true;
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'brauzio_relay_save_config',
      config: {
        relayUrl: form.relayUrl,
        deviceId: form.deviceId || 'default',
        deviceToken: form.deviceToken,
        autoConnect: form.autoConnect,
      },
    });
    if (response?.status) applyStatus(response.status);
  } catch (error) {
    applyStatus({
      state: 'error',
      authenticated: false,
      lastError: error instanceof Error ? error.message : String(error),
    });
  } finally {
    busy.value = false;
  }
}

async function disconnect() {
  if (busy.value) return;
  busy.value = true;
  try {
    const response = await chrome.runtime.sendMessage({ type: 'brauzio_relay_disconnect' });
    if (response?.status) applyStatus(response.status);
  } finally {
    busy.value = false;
  }
}

async function copyMcpUrl() {
  if (!mcpUrl.value) return;
  await navigator.clipboard.writeText(mcpUrl.value);
  copied.value = true;
  window.setTimeout(() => (copied.value = false), 1800);
}

function onRuntimeMessage(message: any) {
  if (message?.type === 'brauzio_relay_status_changed') applyStatus(message.status);
}

onMounted(() => {
  chrome.runtime.onMessage.addListener(onRuntimeMessage);
  void load();
});

onUnmounted(() => {
  chrome.runtime.onMessage.removeListener(onRuntimeMessage);
});
</script>

<style scoped>
.cloud-card {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 16px;
  padding: 16px;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.06);
  color: #0f172a;
}
.cloud-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}
.cloud-head h2 { margin: 0 0 4px; font-size: 16px; font-weight: 700; }
.cloud-head p { margin: 0; color: #64748b; font-size: 12px; line-height: 1.6; }
.status-pill { flex: 0 0 auto; border-radius: 999px; padding: 5px 9px; font-size: 11px; font-weight: 700; }
.status-pill.ok { background: #dcfce7; color: #166534; }
.status-pill.wait { background: #fef3c7; color: #92400e; }
.status-pill.bad { background: #fee2e2; color: #991b1b; }
.status-pill.off { background: #e2e8f0; color: #475569; }
.field { display: flex; flex-direction: column; gap: 6px; margin-bottom: 10px; }
.field span { color: #475569; font-size: 12px; font-weight: 600; }
.field input {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid #cbd5e1;
  border-radius: 10px;
  padding: 9px 10px;
  background: #f8fafc;
  color: #0f172a;
  outline: none;
}
.field input:focus { border-color: #64748b; background: #fff; }
.grid-two { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.auto-connect { display: flex; gap: 8px; align-items: center; color: #475569; font-size: 12px; margin: 2px 0 12px; }
.actions { display: flex; gap: 8px; }
.actions button, .copy { border: 0; border-radius: 10px; cursor: pointer; font-weight: 700; }
.actions button { padding: 9px 12px; }
.primary { background: #0f172a; color: #fff; }
.secondary { background: #e2e8f0; color: #334155; }
button:disabled { opacity: .5; cursor: default; }
.error-box { margin: 8px 0 12px; padding: 9px 10px; border-radius: 10px; background: #fef2f2; color: #991b1b; font-size: 12px; }
.mcp-box { margin-top: 14px; padding-top: 12px; border-top: 1px solid #e2e8f0; }
.mcp-title-row { display: flex; justify-content: space-between; gap: 10px; align-items: center; }
.mcp-title-row strong { display: block; font-size: 12px; }
.mcp-title-row small { display: block; margin-top: 3px; color: #64748b; font-size: 10px; }
.copy { padding: 7px 9px; background: #e2e8f0; color: #334155; white-space: nowrap; }
.mcp-box code { display: block; margin-top: 8px; padding: 8px; border-radius: 8px; background: #0f172a; color: #e2e8f0; font-size: 10px; overflow-wrap: anywhere; }
@media (max-width: 420px) { .grid-two { grid-template-columns: 1fr; } }
</style>
