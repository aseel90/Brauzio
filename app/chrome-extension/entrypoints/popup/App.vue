<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';

type RelayState = 'disabled' | 'connecting' | 'connected' | 'disconnected' | 'error';

interface RelayConfig {
  relayUrl: string;
  deviceId: string;
  deviceToken: string;
  autoConnect: boolean;
}

interface RelayStatus {
  state: RelayState;
  authenticated: boolean;
  lastUpdated: number;
  lastError?: string;
}

const config = reactive<RelayConfig>({
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
const showAdvanced = ref(false);
const showToken = ref(false);
const copied = ref(false);
const version = chrome.runtime.getManifest().version;

const isConnected = computed(() => status.state === 'connected' && status.authenticated);
const canSave = computed(() => config.relayUrl.trim().length > 0 && config.deviceToken.length >= 16);

const statusLabel = computed(() => {
  if (isConnected.value) return 'متصل وآمن';
  if (status.state === 'connecting') return 'جارٍ الاتصال';
  if (status.state === 'error') return 'خطأ في الاتصال';
  if (status.state === 'disabled') return 'الاتصال التلقائي متوقف';
  return 'غير متصل';
});

const workerHost = computed(() => {
  try {
    const raw = /^https?:\/\//i.test(config.relayUrl) ? config.relayUrl : `https://${config.relayUrl}`;
    return new URL(raw).host || '—';
  } catch {
    return '—';
  }
});

const mcpUrl = computed(() => {
  if (!config.relayUrl || !config.deviceToken) return '';
  try {
    const raw = /^https?:\/\//i.test(config.relayUrl) ? config.relayUrl : `https://${config.relayUrl}`;
    const url = new URL(raw);
    url.protocol = url.protocol === 'http:' ? 'http:' : 'https:';
    if (!url.pathname || url.pathname === '/' || url.pathname.endsWith('/ws')) url.pathname = '/mcp';
    url.searchParams.set('device', config.deviceId || 'default');
    url.searchParams.set('key', config.deviceToken);
    return url.toString();
  } catch {
    return '';
  }
});

const maskedMcpUrl = computed(() => {
  if (!mcpUrl.value) return 'أكمل إعداد الاتصال أولًا';
  try {
    const url = new URL(mcpUrl.value);
    url.searchParams.set('key', '••••••••••••');
    return url.toString();
  } catch {
    return 'الرابط جاهز للنسخ';
  }
});

const lastUpdated = computed(() => {
  if (!status.lastUpdated) return '—';
  return new Intl.DateTimeFormat('ar', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(status.lastUpdated));
});

function applyStatus(next?: Partial<RelayStatus>) {
  if (next) Object.assign(status, next);
}

async function loadState() {
  const [configResponse, statusResponse] = await Promise.all([
    chrome.runtime.sendMessage({ type: 'brauzio_relay_get_config' }),
    chrome.runtime.sendMessage({ type: 'brauzio_relay_get_status' }),
  ]);

  if (configResponse?.success && configResponse.config) Object.assign(config, configResponse.config);
  if (statusResponse?.success && statusResponse.status) applyStatus(statusResponse.status);
}

async function saveAndConnect() {
  if (!canSave.value || busy.value) return;
  busy.value = true;
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'brauzio_relay_save_config',
      config: {
        relayUrl: config.relayUrl.trim(),
        deviceId: config.deviceId.trim() || 'default',
        deviceToken: config.deviceToken,
        autoConnect: config.autoConnect,
      },
    });
    if (!response?.success) throw new Error(response?.error || 'تعذر حفظ إعدادات الاتصال');
    if (response.status) applyStatus(response.status);
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

async function reconnect() {
  if (busy.value) return;
  busy.value = true;
  try {
    const response = await chrome.runtime.sendMessage({ type: 'brauzio_relay_connect' });
    if (response?.status) applyStatus(response.status);
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
  window.setTimeout(() => (copied.value = false), 1500);
}

async function openWelcome() {
  await chrome.tabs.create({ url: chrome.runtime.getURL('welcome.html') });
  window.close();
}

const runtimeListener = (message: any) => {
  if (message?.type === 'brauzio_relay_status_changed' && message.status) applyStatus(message.status);
};

onMounted(async () => {
  chrome.runtime.onMessage.addListener(runtimeListener);
  try {
    await loadState();
  } catch (error) {
    applyStatus({
      state: 'error',
      authenticated: false,
      lastError: error instanceof Error ? error.message : String(error),
    });
  }
});

onBeforeUnmount(() => chrome.runtime.onMessage.removeListener(runtimeListener));
</script>

<template>
  <div class="brauzio-popup" dir="rtl">
    <header class="topbar">
      <div class="brand">
        <img src="/brand/brauzio-mark.svg" alt="" class="brand-mark" aria-hidden="true" />
        <div>
          <h1>Brauzio</h1>
          <p>Chrome MCP Bridge</p>
        </div>
      </div>
      <span class="version">v{{ version }}</span>
    </header>

    <main class="content">
      <section class="hero" :class="{ 'hero--online': isConnected }">
        <div class="hero-head">
          <div class="status-icon" :class="`status-icon--${status.state}`">
            <span></span>
          </div>
          <div class="hero-copy">
            <span class="eyebrow">حالة Brauzio</span>
            <h2>{{ statusLabel }}</h2>
            <p v-if="isConnected">المتصفح جاهز لاستقبال أوامر ChatGPT عبر Cloudflare.</p>
            <p v-else>أكمل بيانات الاتصال ثم اتصل بخدمة Brauzio السحابية.</p>
          </div>
        </div>

        <div class="meta-grid">
          <div class="meta-item">
            <span>الجهاز</span>
            <strong>{{ config.deviceId || 'default' }}</strong>
          </div>
          <div class="meta-item">
            <span>Cloudflare</span>
            <strong dir="ltr">{{ workerHost }}</strong>
          </div>
          <div class="meta-item">
            <span>آخر تحديث</span>
            <strong>{{ lastUpdated }}</strong>
          </div>
        </div>

        <p v-if="status.lastError" class="error-box">{{ status.lastError }}</p>

        <div class="hero-actions">
          <button v-if="isConnected" class="btn btn-secondary" :disabled="busy" @click="disconnect">
            قطع الاتصال
          </button>
          <button v-else class="btn btn-primary" :disabled="busy || !canSave" @click="saveAndConnect">
            {{ busy ? 'جارٍ الاتصال…' : 'حفظ واتصال' }}
          </button>
          <button v-if="!isConnected && canSave" class="btn btn-ghost" :disabled="busy" @click="reconnect">
            إعادة الاتصال
          </button>
        </div>
      </section>

      <section class="mcp-card">
        <div class="section-heading">
          <div>
            <span class="eyebrow">CHATGPT</span>
            <h3>رابط MCP</h3>
          </div>
          <span class="secure-badge">خاص</span>
        </div>
        <div class="mcp-value" dir="ltr">{{ maskedMcpUrl }}</div>
        <div class="mcp-actions">
          <button class="btn btn-primary btn-wide" :disabled="!mcpUrl" @click="copyMcpUrl">
            {{ copied ? 'تم النسخ' : 'نسخ رابط MCP' }}
          </button>
        </div>
        <p class="security-note">رمز الوصول مخفي هنا. لا تشارك رابط MCP الكامل مع أي شخص.</p>
      </section>

      <section class="settings-card">
        <button class="settings-toggle" type="button" @click="showAdvanced = !showAdvanced">
          <div>
            <span class="eyebrow">الإعدادات</span>
            <strong>اتصال Cloudflare</strong>
          </div>
          <span class="chevron" :class="{ 'chevron--open': showAdvanced }">⌄</span>
        </button>

        <div v-if="showAdvanced" class="settings-body">
          <label class="field">
            <span>رابط Worker</span>
            <input v-model.trim="config.relayUrl" type="url" dir="ltr" placeholder="https://…workers.dev" />
          </label>

          <label class="field">
            <span>معرف الجهاز</span>
            <input v-model.trim="config.deviceId" type="text" dir="ltr" placeholder="default" />
          </label>

          <label class="field">
            <span>رمز الربط</span>
            <div class="token-field">
              <input
                v-model="config.deviceToken"
                :type="showToken ? 'text' : 'password'"
                dir="ltr"
                autocomplete="new-password"
                placeholder="••••••••••••••••"
              />
              <button type="button" @click="showToken = !showToken">{{ showToken ? 'إخفاء' : 'إظهار' }}</button>
            </div>
          </label>

          <label class="switch-row">
            <div>
              <strong>اتصال تلقائي</strong>
              <span>إعادة الاتصال عند تشغيل Chrome</span>
            </div>
            <input v-model="config.autoConnect" type="checkbox" />
          </label>

          <button class="btn btn-primary btn-wide" :disabled="busy || !canSave" @click="saveAndConnect">
            حفظ الإعدادات
          </button>
        </div>
      </section>
    </main>

    <footer class="footer">
      <button type="button" @click="openWelcome">دليل الإعداد</button>
      <span>Brauzio Cloud • MCP only</span>
    </footer>
  </div>
</template>
