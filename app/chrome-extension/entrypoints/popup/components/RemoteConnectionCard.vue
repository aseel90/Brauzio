<template>
  <section class="cloud-card" dir="rtl">
    <div class="cloud-card__header">
      <div>
        <p class="cloud-card__eyebrow">BRAUZIO CLOUD</p>
        <h2>اتصال ChatGPT عبر Cloudflare</h2>
      </div>
      <div class="cloud-status" :class="`cloud-status--${status.state}`">
        <span class="cloud-status__dot"></span>
        <span>{{ statusLabel }}</span>
      </div>
    </div>

    <p class="cloud-card__hint">
      لا يحتاج هذا الاتصال إلى cloudflared أو خادم Node محلي. الإضافة تتصل مباشرة بخدمة Brauzio السحابية.
    </p>

    <div class="cloud-field">
      <label for="brauzio-relay-url">رابط Cloudflare Worker</label>
      <input
        id="brauzio-relay-url"
        v-model.trim="form.relayUrl"
        type="url"
        autocomplete="off"
        spellcheck="false"
        placeholder="https://brauzio-mcp.example.workers.dev"
      />
      <small>يمكنك لصق رابط Worker أو رابط /mcp وسيتم ضبط WebSocket تلقائيًا.</small>
    </div>

    <div class="cloud-grid">
      <div class="cloud-field">
        <label for="brauzio-device-id">معرف الجهاز</label>
        <input
          id="brauzio-device-id"
          v-model.trim="form.deviceId"
          type="text"
          autocomplete="off"
          placeholder="default"
        />
      </div>

      <div class="cloud-field">
        <label for="brauzio-device-token">رمز ربط المتصفح</label>
        <div class="secret-input">
          <input
            id="brauzio-device-token"
            v-model="form.deviceToken"
            :type="showToken ? 'text' : 'password'"
            autocomplete="new-password"
            placeholder="رمز سري طويل"
          />
          <button type="button" class="secret-toggle" @click="showToken = !showToken">
            {{ showToken ? 'إخفاء' : 'إظهار' }}
          </button>
        </div>
      </div>
    </div>

    <label class="auto-connect">
      <input v-model="form.autoConnect" type="checkbox" />
      <span>الاتصال تلقائيًا عند فتح Chrome</span>
    </label>

    <div v-if="mcpUrl" class="mcp-url-box">
      <div>
        <span class="mcp-url-box__label">رابط MCP الخاص لـ ChatGPT</span>
        <code>{{ mcpUrl }}</code>
      </div>
      <button type="button" @click="copyMcpUrl">{{ copyText }}</button>
    </div>
    <p v-if="mcpUrl" class="mcp-secret-note">احتفظ بهذا الرابط سريًا لأنه يحتوي رمز الوصول.</p>

    <p v-if="status.lastError" class="cloud-error">{{ status.lastError }}</p>

    <div class="cloud-actions">
      <button
        type="button"
        class="cloud-button cloud-button--primary"
        :disabled="busy || !canSave"
        @click="saveAndConnect"
      >
        {{ busy ? 'جارٍ الاتصال...' : 'حفظ واتصال' }}
      </button>
      <button
        v-if="status.state === 'connected' || status.state === 'connecting'"
        type="button"
        class="cloud-button cloud-button--secondary"
        :disabled="busy"
        @click="disconnect"
      >
        قطع الاتصال
      </button>
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
const copyText = ref('نسخ');

const canSave = computed(() => form.relayUrl.length > 0 && form.deviceToken.length >= 16);

const statusLabel = computed(() => {
  switch (status.state) {
    case 'connected':
      return status.authenticated ? 'متصل وآمن' : 'متصل';
    case 'connecting':
      return 'جارٍ الاتصال';
    case 'disabled':
      return 'الاتصال التلقائي متوقف';
    case 'error':
      return 'خطأ في الاتصال';
    default:
      return 'غير متصل';
  }
});

const mcpUrl = computed(() => {
  if (!form.relayUrl) return '';
  try {
    const raw = /^https?:\/\//i.test(form.relayUrl)
      ? form.relayUrl
      : `https://${form.relayUrl}`;
    const url = new URL(raw);
    url.protocol = url.protocol === 'http:' ? 'http:' : 'https:';
    if (!url.pathname || url.pathname === '/' || url.pathname.endsWith('/ws')) {
      url.pathname = '/mcp';
    }
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
}

async function loadState() {
  const [configResponse, statusResponse] = await Promise.all([
    chrome.runtime.sendMessage({ type: 'brauzio_relay_get_config' }),
    chrome.runtime.sendMessage({ type: 'brauzio_relay_get_status' }),
  ]);

  if (configResponse?.success && configResponse.config) {
    Object.assign(form, configResponse.config);
  }
  if (statusResponse?.success && statusResponse.status) {
    applyStatus(statusResponse.status);
  }
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
    if (!response?.success) {
      throw new Error(response?.error || 'تعذر حفظ إعدادات Brauzio Cloud');
    }
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
    copyText.value = 'نسخ';
  }, 1600);
}

const runtimeListener = (message: any) => {
  if (message?.type === 'brauzio_relay_status_changed' && message.status) {
    applyStatus(message.status);
  }
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

onBeforeUnmount(() => {
  chrome.runtime.onMessage.removeListener(runtimeListener);
});
</script>

<style scoped>
.cloud-card {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 16px;
  padding: 16px;
  box-shadow: 0 8px 22px rgba(15, 23, 42, 0.06);
  color: #0f172a;
}

.cloud-card__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.cloud-card__header h2 {
  margin: 2px 0 0;
  font-size: 16px;
  font-weight: 700;
}

.cloud-card__eyebrow {
  margin: 0;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.11em;
  color: #5b5bd6;
}

.cloud-card__hint {
  margin: 12px 0 14px;
  color: #64748b;
  font-size: 12px;
  line-height: 1.7;
}

.cloud-status {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
  border-radius: 999px;
  padding: 6px 9px;
  background: #f1f5f9;
  color: #475569;
  font-size: 11px;
  font-weight: 700;
}

.cloud-status__dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #94a3b8;
}

.cloud-status--connected {
  background: #ecfdf5;
  color: #047857;
}
.cloud-status--connected .cloud-status__dot { background: #10b981; }
.cloud-status--connecting { background: #fffbeb; color: #b45309; }
.cloud-status--connecting .cloud-status__dot { background: #f59e0b; }
.cloud-status--error { background: #fef2f2; color: #b91c1c; }
.cloud-status--error .cloud-status__dot { background: #ef4444; }

.cloud-field {
  margin-top: 12px;
}

.cloud-field label {
  display: block;
  margin-bottom: 6px;
  font-size: 12px;
  font-weight: 700;
  color: #334155;
}

.cloud-field input {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid #cbd5e1;
  border-radius: 10px;
  padding: 9px 10px;
  background: #f8fafc;
  color: #0f172a;
  font-size: 12px;
  outline: none;
}

.cloud-field input:focus {
  border-color: #5b5bd6;
  box-shadow: 0 0 0 3px rgba(91, 91, 214, 0.12);
}

.cloud-field small {
  display: block;
  margin-top: 5px;
  color: #94a3b8;
  font-size: 10px;
  line-height: 1.5;
}

.cloud-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.secret-input {
  position: relative;
}

.secret-input input {
  padding-left: 54px;
}

.secret-toggle {
  position: absolute;
  top: 50%;
  left: 6px;
  transform: translateY(-50%);
  border: 0;
  background: transparent;
  color: #5b5bd6;
  font-size: 10px;
  font-weight: 700;
  cursor: pointer;
}

.auto-connect {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 13px;
  color: #475569;
  font-size: 11px;
  cursor: pointer;
}

.auto-connect input {
  accent-color: #5b5bd6;
}

.mcp-url-box {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-top: 14px;
  padding: 10px;
  border: 1px dashed #c7d2fe;
  border-radius: 10px;
  background: #eef2ff;
}

.mcp-url-box > div {
  min-width: 0;
}

.mcp-url-box__label {
  display: block;
  margin-bottom: 4px;
  color: #4f46e5;
  font-size: 10px;
  font-weight: 700;
}

.mcp-url-box code {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  direction: ltr;
  text-align: left;
  color: #334155;
  font-size: 10px;
}

.mcp-url-box button {
  border: 0;
  border-radius: 8px;
  padding: 7px 9px;
  background: #e0e7ff;
  color: #4f46e5;
  font-size: 10px;
  font-weight: 700;
  cursor: pointer;
}

.mcp-secret-note {
  margin: 6px 2px 0;
  color: #64748b;
  font-size: 9px;
  line-height: 1.5;
}

.cloud-error {
  margin: 10px 0 0;
  padding: 8px 10px;
  border-radius: 8px;
  background: #fef2f2;
  color: #b91c1c;
  font-size: 11px;
  line-height: 1.5;
}

.cloud-actions {
  display: flex;
  gap: 8px;
  margin-top: 14px;
}

.cloud-button {
  border: 0;
  border-radius: 10px;
  padding: 9px 13px;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}

.cloud-button:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.cloud-button--primary {
  flex: 1;
  background: #5b5bd6;
  color: white;
}

.cloud-button--primary:hover:not(:disabled) {
  background: #4f46e5;
}

.cloud-button--secondary {
  background: #f1f5f9;
  color: #475569;
}

@media (max-width: 420px) {
  .cloud-grid { grid-template-columns: 1fr; }
  .cloud-card__header { flex-direction: column; }
}
</style>
