<template>
  <div class="cloud-agent-page" dir="rtl">
    <section class="cloud-agent-card">
      <div class="cloud-agent-header">
        <div class="brand-mark">B</div>
        <div class="brand-copy">
          <p>BRAUZIO CLOUD</p>
          <h2>ChatGPT هو وكيل المتصفح</h2>
        </div>
        <span class="status" :class="`status--${status.state}`">{{ statusLabel }}</span>
      </div>

      <p class="description">
        أزيل AgentChat المحلي الذي كان يحتاج إلى Node.js وخادم على الجهاز. في Brauzio، تتولى
        محادثة ChatGPT المتصلة عبر MCP تنفيذ مهام المتصفح مباشرة من خلال Cloudflare.
      </p>

      <div class="steps">
        <div class="step">
          <span>1</span>
          <div>
            <strong>اربط Brauzio Cloud</strong>
            <p>اضبط رابط Worker ورمز ربط المتصفح من نافذة الإضافة.</p>
          </div>
        </div>
        <div class="step">
          <span>2</span>
          <div>
            <strong>أضف رابط MCP إلى ChatGPT</strong>
            <p>استخدم رابط MCP الخاص الذي تعرضه الإضافة.</p>
          </div>
        </div>
        <div class="step">
          <span>3</span>
          <div>
            <strong>أعطِ ChatGPT المهمة</strong>
            <p>ستصل أوامر الأدوات إلى Chrome عبر اتصال Brauzio المشفّر.</p>
          </div>
        </div>
      </div>

      <div v-if="status.lastError" class="error-box">{{ status.lastError }}</div>

      <div class="actions">
        <button type="button" class="primary" :disabled="busy" @click="connect">
          {{ busy ? 'جارٍ الاتصال…' : status.authenticated ? 'إعادة الاتصال' : 'الاتصال بـ Brauzio Cloud' }}
        </button>
        <button type="button" class="secondary" @click="openPopup">فتح إعدادات الاتصال</button>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';

type RelayState = 'disabled' | 'connecting' | 'connected' | 'disconnected' | 'error';

interface RelayStatus {
  state: RelayState;
  authenticated: boolean;
  lastUpdated: number;
  lastError?: string;
}

const status = reactive<RelayStatus>({
  state: 'disconnected',
  authenticated: false,
  lastUpdated: Date.now(),
});
const busy = ref(false);

const statusLabel = computed(() => {
  if (status.state === 'connected' && status.authenticated) return 'متصل وآمن';
  if (status.state === 'connecting') return 'جارٍ الاتصال';
  if (status.state === 'error') return 'خطأ';
  if (status.state === 'disabled') return 'متوقف';
  return 'غير متصل';
});

function applyStatus(next?: Partial<RelayStatus>) {
  if (next) Object.assign(status, next);
}

async function refreshStatus() {
  const response = await chrome.runtime.sendMessage({ type: 'brauzio_relay_get_status' });
  if (response?.success) applyStatus(response.status);
}

async function connect() {
  if (busy.value) return;
  busy.value = true;
  try {
    const response = await chrome.runtime.sendMessage({ type: 'brauzio_relay_connect' });
    if (response?.success) applyStatus(response.status);
    else if (response?.error) {
      applyStatus({ state: 'error', authenticated: false, lastError: String(response.error) });
    }
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

async function openPopup() {
  try {
    await chrome.action.openPopup();
  } catch {
    await chrome.tabs.create({ url: chrome.runtime.getURL('popup.html') });
  }
}

const relayListener = (message: any) => {
  if (message?.type === 'brauzio_relay_status_changed') applyStatus(message.status);
};

onMounted(() => {
  chrome.runtime.onMessage.addListener(relayListener);
  void refreshStatus();
});

onBeforeUnmount(() => {
  chrome.runtime.onMessage.removeListener(relayListener);
});
</script>

<style scoped>
.cloud-agent-page {
  height: 100%;
  box-sizing: border-box;
  padding: 20px;
  display: grid;
  place-items: start center;
  overflow: auto;
  background: var(--ac-bg);
  color: var(--ac-text);
}

.cloud-agent-card {
  width: min(100%, 720px);
  box-sizing: border-box;
  padding: 22px;
  border: var(--ac-border-width) solid var(--ac-border);
  border-radius: var(--ac-radius-card);
  background: var(--ac-surface);
  box-shadow: var(--ac-shadow-card);
}

.cloud-agent-header {
  display: flex;
  align-items: center;
  gap: 12px;
}

.brand-mark {
  width: 42px;
  height: 42px;
  display: grid;
  place-items: center;
  flex: 0 0 auto;
  border-radius: 12px;
  background: var(--ac-accent);
  color: #fff;
  font-size: 20px;
  font-weight: 800;
}

.brand-copy p {
  margin: 0 0 2px;
  color: var(--ac-text-subtle);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.08em;
}

.brand-copy h2 {
  margin: 0;
  font-family: var(--ac-font-heading);
  font-size: 18px;
}

.status {
  margin-inline-start: auto;
  padding: 6px 9px;
  border-radius: 999px;
  background: var(--ac-surface-muted);
  color: var(--ac-text-muted);
  font-size: 10px;
  font-weight: 800;
  white-space: nowrap;
}

.status--connected {
  background: #ecfdf5;
  color: #047857;
}
.status--connecting {
  background: #fffbeb;
  color: #b45309;
}
.status--error {
  background: #fef2f2;
  color: #b91c1c;
}

.description {
  margin: 18px 0;
  color: var(--ac-text-muted);
  font-size: 13px;
  line-height: 1.9;
}

.steps {
  display: grid;
  gap: 12px;
  margin: 18px 0;
}

.step {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  padding: 12px;
  border: var(--ac-border-width) solid var(--ac-border);
  border-radius: var(--ac-radius-inner);
  background: var(--ac-surface-muted);
}

.step > span {
  width: 25px;
  height: 25px;
  display: grid;
  place-items: center;
  flex: 0 0 auto;
  border-radius: 50%;
  background: var(--ac-accent);
  color: white;
  font-size: 11px;
  font-weight: 800;
}

.step strong {
  display: block;
  font-size: 12px;
}
.step p {
  margin: 3px 0 0;
  color: var(--ac-text-muted);
  font-size: 11px;
  line-height: 1.7;
}

.error-box {
  margin-top: 12px;
  padding: 10px;
  border-radius: var(--ac-radius-inner);
  background: #fef2f2;
  color: #b91c1c;
  font-size: 11px;
}

.actions {
  display: flex;
  gap: 9px;
  margin-top: 18px;
}

.actions button {
  border-radius: var(--ac-radius-button);
  padding: 10px 13px;
  font-family: inherit;
  font-size: 11px;
  font-weight: 800;
  cursor: pointer;
}

.primary {
  flex: 1;
  border: 1px solid var(--ac-accent);
  background: var(--ac-accent);
  color: #fff;
}

.secondary {
  border: var(--ac-border-width) solid var(--ac-border);
  background: var(--ac-surface);
  color: var(--ac-text-muted);
}

button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

@media (max-width: 480px) {
  .cloud-agent-page { padding: 10px; }
  .cloud-agent-card { padding: 16px; }
  .cloud-agent-header, .actions { align-items: stretch; flex-direction: column; }
  .status { align-self: flex-start; margin-inline-start: 0; }
}
</style>
