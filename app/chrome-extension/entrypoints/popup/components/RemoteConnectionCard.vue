<template>
  <section class="connection-card" dir="rtl">
    <div class="connection-header">
      <div class="connection-title">
        <div class="connection-icon" :class="`connection-icon--${status.state}`" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
            <path d="M7.5 12a4.5 4.5 0 0 1 4.5-4.5h3a4.5 4.5 0 1 1 0 9h-3" />
            <path d="M16.5 12A4.5 4.5 0 0 1 12 16.5H9a4.5 4.5 0 1 1 0-9h3" />
          </svg>
        </div>
        <div>
          <p class="eyebrow">CLOUD CONNECTION</p>
          <h2>اتصال ChatGPT</h2>
          <p class="connection-subtitle">Cloudflare Relay → Brauzio → Chrome</p>
        </div>
      </div>

      <div class="status-badge" :class="`status-badge--${status.state}`">
        <span class="status-badge__dot"></span>
        {{ statusLabel }}
      </div>
    </div>

    <div v-if="status.state === 'connected'" class="connected-summary">
      <div class="connected-summary__main">
        <strong>المتصفح متصل</strong>
        <span>الجهاز: {{ form.deviceId || 'default' }}</span>
      </div>
      <button v-if="mcpUrl" type="button" class="copy-mcp-button" @click="copyMcpUrl">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <rect x="9" y="9" width="11" height="11" rx="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
        {{ copyText }}
      </button>
    </div>

    <div v-if="status.state !== 'connected'" class="connection-callout">
      <strong>{{ status.state === 'error' ? 'تعذر الاتصال' : 'لم يتم ربط المتصفح بعد' }}</strong>
      <span>افتح الإعدادات المتقدمة وأدخل رابط Worker ورمز الجهاز.</span>
    </div>

    <p v-if="status.lastError" class="connection-error">{{ status.lastError }}</p>

    <details class="advanced-settings" :open="status.state !== 'connected'">
      <summary>
        <span>إعدادات الاتصال المتقدمة</span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <path d="m9 18 6-6-6-6" />
        </svg>
      </summary>

      <div class="advanced-settings__body">
        <label class="field field--full">
          <span>رابط Cloudflare Worker</span>
          <input
            v-model.trim="form.relayUrl"
            type="url"
            autocomplete="off"
            spellcheck="false"
            placeholder="https://brauzio-mcp.example.workers.dev"
          />
          <small>يقبل رابط Worker أو رابط /mcp ويضبط WebSocket تلقائيًا.</small>
        </label>

        <div class="field-grid">
          <label class="field">
            <span>معرف الجهاز</span>
            <input v-model.trim="form.deviceId" type="text" autocomplete="off" placeholder="default" />
          </label>

          <label class="field">
            <span>رمز ربط المتصفح</span>
            <div class="secret-field">
              <input
                v-model="form.deviceToken"
                :type="showToken ? 'text' : 'password'"
                autocomplete="new-password"
                placeholder="رمز سري طويل"
              />
              <button type="button" @click="showToken = !showToken">{{ showToken ? 'إخفاء' : 'إظهار' }}</button>
            </div>
          </label>
        </div>

        <label class="toggle-row">
          <input v-model="form.autoConnect" type="checkbox" />
          <span>
            <strong>اتصال تلقائي</strong>
            <small>إعادة الاتصال بخدمة Brauzio عند تشغيل Chrome.</small>
          </span>
        </label>

        <div class="advanced-actions">
          <button
            type="button"
            class="primary-button"
            :disabled="busy || !canSave"
            @click="saveAndConnect"
          >
            {{ busy ? 'جارٍ الاتصال…' : status.state === 'connected' ? 'حفظ التعديلات' : 'حفظ واتصال' }}
          </button>

          <button
            v-if="status.state === 'connected' || status.state === 'connecting'"
            type="button"
            class="ghost-button"
            :disabled="busy"
            @click="disconnect"
          >
            قطع الاتصال
          </button>
        </div>
      </div>
    </details>

    <div class="privacy-note">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
        <rect x="5" y="10" width="14" height="10" rx="2" />
        <path d="M8 10V7a4 4 0 0 1 8 0v3" />
      </svg>
      <span>رمز الربط لا يظهر في واجهة الحالة ولا يدخل في بيانات التشخيص المنسوخة.</span>
    </div>
  </section>
</template>

<script lang="ts" setup>
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

const emit = defineEmits<{
  (event: 'status-change', status: RelayStatus): void;
}>();

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
const showToken = ref(false);
const copyText = ref('نسخ رابط MCP');

const canSave = computed(() => form.relayUrl.length > 0 && form.deviceToken.length >= 16);

const statusLabel = computed(() => {
  switch (status.state) {
    case 'connected':
      return status.authenticated ? 'متصل وآمن' : 'متصل';
    case 'connecting':
      return 'جارٍ الاتصال';
    case 'disabled':
      return 'متوقف';
    case 'error':
      return 'خطأ';
    default:
      return 'غير متصل';
  }
});

const mcpUrl = computed(() => {
  if (!form.relayUrl || !form.deviceToken) return '';
  try {
    const raw = /^https?:\/\//i.test(form.relayUrl) ? form.relayUrl : `https://${form.relayUrl}`;
    const url = new URL(raw);
    url.protocol = url.protocol === 'http:' ? 'http:' : 'https:';
    if (!url.pathname || url.pathname === '/' || url.pathname.endsWith('/ws')) url.pathname = '/mcp';
    url.searchParams.set('device', form.deviceId || 'default');
    url.searchParams.set('key', form.deviceToken);
    return url.toString();
  } catch {
    return '';
  }
});

function applyStatus(next?: Partial<RelayStatus>) {
  if (!next) return;
  Object.assign(status, next);
  emit('status-change', { ...status });
}

async function loadState() {
  const [configResponse, statusResponse] = await Promise.all([
    chrome.runtime.sendMessage({ type: 'brauzio_relay_get_config' }),
    chrome.runtime.sendMessage({ type: 'brauzio_relay_get_status' }),
  ]);

  if (configResponse?.success && configResponse.config) Object.assign(form, configResponse.config);
  if (statusResponse?.success && statusResponse.status) applyStatus(statusResponse.status);
}

async function saveAndConnect() {
  if (!canSave.value || busy.value) return;
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
    if (!response?.success) throw new Error(response?.error || 'تعذر حفظ إعدادات الاتصال');
    if (response.status) applyStatus(response.status);
  } catch (error) {
    applyStatus({
      state: 'error',
      authenticated: false,
      lastError: error instanceof Error ? error.message : String(error),
      lastUpdated: Date.now(),
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
  copyText.value = 'تم النسخ';
  window.setTimeout(() => {
    copyText.value = 'نسخ رابط MCP';
  }, 1600);
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
      lastUpdated: Date.now(),
    });
  }
});

onBeforeUnmount(() => {
  chrome.runtime.onMessage.removeListener(runtimeListener);
});
</script>
