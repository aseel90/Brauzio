<template>
  <div class="brauzio-shell" dir="rtl">
    <header class="app-header">
      <div class="brand-row">
        <div class="brand-icon-wrap" aria-hidden="true">
          <img src="/brand/brauzio-mark.svg" class="brand-icon" alt="" />
        </div>
        <div class="brand-copy">
          <div class="brand-title-row">
            <h1>Brauzio</h1>
            <span class="version-badge">v{{ version }}</span>
          </div>
          <p>بوابة ChatGPT الآمنة إلى Chrome</p>
        </div>
      </div>

      <div class="connection-pill" :class="`connection-pill--${relayStatus.state}`">
        <span class="status-dot"></span>
        <span>{{ relayStatusLabel }}</span>
      </div>
    </header>

    <main class="app-content">
      <section class="hero-card" :class="{ 'hero-card--online': relayStatus.state === 'connected' }">
        <div class="hero-symbol" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
            <path d="M8 12h8M12 8v8" stroke-linecap="round" />
            <rect x="3" y="4" width="18" height="16" rx="4" />
          </svg>
        </div>
        <div>
          <p class="eyebrow">BRAUZIO CORE</p>
          <h2>{{ relayStatus.state === 'connected' ? 'جاهز للتحكم بالمتصفح' : 'اربط المتصفح للبدء' }}</h2>
          <p>
            {{ relayStatus.state === 'connected'
              ? 'ChatGPT يستطيع الآن استخدام أدوات Brauzio للتحكم في Chrome عبر Cloudflare.'
              : 'أكمل إعداد الاتصال مرة واحدة، وبعدها يعمل Brauzio تلقائيًا عند تشغيل Chrome.' }}
          </p>
        </div>
      </section>

      <RemoteConnectionCard @status-change="applyRelayStatus" />

      <section class="capabilities-card">
        <div class="section-heading">
          <div>
            <p class="eyebrow">CORE CAPABILITIES</p>
            <h2>ما الذي يستطيع Brauzio فعله؟</h2>
          </div>
        </div>

        <div class="capability-grid">
          <div class="capability-item">
            <span class="capability-icon">01</span>
            <div><strong>تصفح وقراءة الصفحات</strong><small>Tabs · DOM · Accessibility</small></div>
          </div>
          <div class="capability-item">
            <span class="capability-icon">02</span>
            <div><strong>تحكم دقيق</strong><small>Mouse · Keyboard · Forms</small></div>
          </div>
          <div class="capability-item">
            <span class="capability-icon">03</span>
            <div><strong>فحص المطور</strong><small>Console · Network · Performance</small></div>
          </div>
          <div class="capability-item">
            <span class="capability-icon">04</span>
            <div><strong>QA بصري</strong><small>Screenshots · Element Picker</small></div>
          </div>
        </div>
      </section>

      <section class="diagnostics-card">
        <div class="diagnostics-copy">
          <p class="eyebrow">DIAGNOSTICS</p>
          <h2>تشخيص سريع</h2>
          <p>انسخ حالة الاتصال بشكل آمن بدون رمز الربط السري.</p>
        </div>
        <button class="secondary-button" type="button" @click="copyDiagnostics">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <rect x="9" y="9" width="11" height="11" rx="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
          {{ diagnosticsCopyLabel }}
        </button>
      </section>
    </main>

    <footer class="app-footer">
      <span>الاتصال مشفّر عبر Cloudflare</span>
      <span class="footer-separator">•</span>
      <span>لا يحتاج Node أو cloudflared</span>
    </footer>
  </div>
</template>

<script lang="ts" setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import RemoteConnectionCard from './components/RemoteConnectionCard.vue';

type RelayState = 'disabled' | 'connecting' | 'connected' | 'disconnected' | 'error';

interface RelayStatus {
  state: RelayState;
  authenticated: boolean;
  lastUpdated: number;
  lastError?: string;
}

const version = chrome.runtime.getManifest().version;
const diagnosticsCopyLabel = ref('نسخ التشخيص');
const relayStatus = reactive<RelayStatus>({
  state: 'disconnected',
  authenticated: false,
  lastUpdated: Date.now(),
});

const relayStatusLabel = computed(() => {
  switch (relayStatus.state) {
    case 'connected':
      return relayStatus.authenticated ? 'متصل وآمن' : 'متصل';
    case 'connecting':
      return 'جارٍ الاتصال';
    case 'error':
      return 'يوجد خطأ';
    case 'disabled':
      return 'الاتصال التلقائي متوقف';
    default:
      return 'غير متصل';
  }
});

function applyRelayStatus(next?: Partial<RelayStatus>) {
  if (!next) return;
  Object.assign(relayStatus, next);
}

async function refreshRelayStatus() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'brauzio_relay_get_status' });
    if (response?.success && response.status) applyRelayStatus(response.status);
  } catch {
    // The connection card will expose the actionable error state.
  }
}

async function copyDiagnostics() {
  try {
    const [statusResponse, configResponse] = await Promise.all([
      chrome.runtime.sendMessage({ type: 'brauzio_relay_get_status' }),
      chrome.runtime.sendMessage({ type: 'brauzio_relay_get_config' }),
    ]);

    const config = configResponse?.config || {};
    let relayOrigin = '';
    try {
      relayOrigin = config.relayUrl ? new URL(config.relayUrl).origin : '';
    } catch {
      relayOrigin = config.relayUrl || '';
    }

    const safeDiagnostics = {
      product: 'Brauzio',
      extensionVersion: version,
      state: statusResponse?.status?.state || relayStatus.state,
      authenticated: Boolean(statusResponse?.status?.authenticated),
      deviceId: config.deviceId || 'default',
      relayOrigin,
      autoConnect: config.autoConnect !== false,
      lastUpdated: statusResponse?.status?.lastUpdated || relayStatus.lastUpdated,
      lastError: statusResponse?.status?.lastError || null,
    };

    await navigator.clipboard.writeText(JSON.stringify(safeDiagnostics, null, 2));
    diagnosticsCopyLabel.value = 'تم النسخ';
  } catch {
    diagnosticsCopyLabel.value = 'تعذر النسخ';
  }

  window.setTimeout(() => {
    diagnosticsCopyLabel.value = 'نسخ التشخيص';
  }, 1600);
}

const runtimeListener = (message: any) => {
  if (message?.type === 'brauzio_relay_status_changed' && message.status) {
    applyRelayStatus(message.status);
  }
};

onMounted(() => {
  chrome.runtime.onMessage.addListener(runtimeListener);
  void refreshRelayStatus();
});

onBeforeUnmount(() => {
  chrome.runtime.onMessage.removeListener(runtimeListener);
});
</script>
