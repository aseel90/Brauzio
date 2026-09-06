<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';

type RelayState = 'disabled' | 'connecting' | 'connected' | 'disconnected' | 'error';

const config = reactive({ relayUrl: '', deviceId: 'default', deviceToken: '' });
const status = reactive({
  state: 'disconnected' as RelayState,
  authenticated: false,
  lastError: '',
});
const copied = ref(false);
const version = chrome.runtime.getManifest().version;

const connected = computed(() => status.state === 'connected' && status.authenticated);
const statusLabel = computed(() => {
  if (connected.value) return 'متصل وآمن';
  if (status.state === 'connecting') return 'جارٍ الاتصال';
  if (status.state === 'error') return 'خطأ في الاتصال';
  return 'بانتظار الإعداد';
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

const maskedUrl = computed(() => {
  if (!mcpUrl.value) return 'سيظهر رابط MCP هنا بعد حفظ إعدادات Cloudflare.';
  const url = new URL(mcpUrl.value);
  url.searchParams.set('key', '••••••••••••');
  return url.toString();
});

async function loadState() {
  const [configResponse, statusResponse] = await Promise.all([
    chrome.runtime.sendMessage({ type: 'brauzio_relay_get_config' }),
    chrome.runtime.sendMessage({ type: 'brauzio_relay_get_status' }),
  ]);
  if (configResponse?.success && configResponse.config) Object.assign(config, configResponse.config);
  if (statusResponse?.success && statusResponse.status) Object.assign(status, statusResponse.status);
}

async function copyMcp() {
  if (!mcpUrl.value) return;
  await navigator.clipboard.writeText(mcpUrl.value);
  copied.value = true;
  window.setTimeout(() => (copied.value = false), 1500);
}

function closePage() {
  window.close();
}

const listener = (message: any) => {
  if (message?.type === 'brauzio_relay_status_changed' && message.status) {
    Object.assign(status, message.status);
  }
};

onMounted(async () => {
  chrome.runtime.onMessage.addListener(listener);
  await loadState().catch(() => {});
});

onBeforeUnmount(() => chrome.runtime.onMessage.removeListener(listener));
</script>

<template>
  <div class="welcome" dir="rtl">
    <main class="shell">
      <section class="hero">
        <div class="brand-row">
          <img src="/brand/brauzio-mark.svg" class="logo" alt="Brauzio" />
          <div>
            <span class="eyebrow">BRAUZIO CLOUD</span>
            <h1>أهلًا بك في Brauzio</h1>
          </div>
          <span class="status" :class="{ online: connected, error: status.state === 'error' }">
            <i></i>{{ statusLabel }}
          </span>
        </div>
        <p>
          Brauzio يربط ChatGPT بمتصفح Chrome مباشرة عبر Cloudflare وMCP، بدون خادم Node محلي وبدون cloudflared.
        </p>
      </section>

      <section class="card">
        <div class="title-row">
          <div>
            <span class="eyebrow">3 خطوات</span>
            <h2>إعداد Brauzio</h2>
          </div>
        </div>

        <div class="steps">
          <article>
            <span class="number">1</span>
            <div>
              <strong>افتح نافذة الإضافة</strong>
              <p>أدخل رابط Cloudflare Worker، معرف الجهاز، ورمز الربط السري.</p>
            </div>
          </article>
          <article>
            <span class="number">2</span>
            <div>
              <strong>اتصل بالسحابة</strong>
              <p>عندما تصبح الحالة «متصل وآمن» يكون Chrome جاهزًا لاستقبال أدوات MCP.</p>
            </div>
          </article>
          <article>
            <span class="number">3</span>
            <div>
              <strong>أضف رابط MCP إلى ChatGPT</strong>
              <p>انسخ الرابط من Brauzio وأضفه إلى Custom MCP في ChatGPT.</p>
            </div>
          </article>
        </div>
      </section>

      <section class="card mcp-card">
        <div class="title-row">
          <div>
            <span class="eyebrow">CHATGPT</span>
            <h2>رابط MCP</h2>
          </div>
          <span class="private">خاص</span>
        </div>
        <code dir="ltr">{{ maskedUrl }}</code>
        <button :disabled="!mcpUrl" @click="copyMcp">{{ copied ? 'تم النسخ' : 'نسخ رابط MCP' }}</button>
        <small>رمز الوصول مخفي في العرض. لا تشارك الرابط الكامل مع أي شخص.</small>
      </section>

      <section v-if="status.lastError" class="error-card">{{ status.lastError }}</section>

      <footer>
        <span>Brauzio v{{ version }}</span>
        <button @click="closePage">إغلاق</button>
      </footer>
    </main>
  </div>
</template>

<style scoped>
* { box-sizing: border-box; }
.welcome { min-height: 100vh; padding: 42px 18px; background: radial-gradient(circle at 10% 0%, rgba(91,91,214,.14), transparent 28%), #f7f8fc; color: #101828; font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Tahoma, Arial, sans-serif; }
.shell { width: min(720px, 100%); margin: 0 auto; }
.hero, .card { margin-bottom: 14px; padding: 22px; border: 1px solid #e4e7ec; border-radius: 22px; background: rgba(255,255,255,.96); box-shadow: 0 14px 34px rgba(16,24,40,.06); }
.hero { padding: 26px; }
.brand-row { display: flex; align-items: center; gap: 13px; }
.logo { width: 46px; height: 46px; }
.eyebrow { display: block; color: #7f56d9; font-size: 10px; font-weight: 800; letter-spacing: .08em; }
h1, h2 { margin: 3px 0 0; }
h1 { font-size: 24px; }
h2 { font-size: 17px; }
.hero > p { margin: 18px 0 0; max-width: 610px; color: #667085; font-size: 14px; line-height: 1.9; }
.status { margin-inline-start: auto; display: inline-flex; align-items: center; gap: 7px; padding: 7px 10px; border-radius: 999px; background: #f2f4f7; color: #667085; font-size: 11px; font-weight: 800; }
.status i { width: 7px; height: 7px; border-radius: 50%; background: #98a2b3; }
.status.online { background: #ecfdf8; color: #087f79; }
.status.online i { background: #12b8b0; }
.status.error { background: #fef3f2; color: #b42318; }
.status.error i { background: #f04438; }
.title-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.steps { margin-top: 18px; display: grid; gap: 12px; }
.steps article { display: flex; align-items: flex-start; gap: 12px; padding: 13px; border-radius: 14px; background: #f8f9fc; }
.number { width: 30px; height: 30px; flex: 0 0 auto; display: grid; place-items: center; border-radius: 10px; background: #5b5bd6; color: #fff; font-size: 12px; font-weight: 800; }
.steps strong { font-size: 13px; }
.steps p { margin: 4px 0 0; color: #667085; font-size: 12px; line-height: 1.7; }
.private { padding: 5px 8px; border-radius: 999px; background: #ecfdf8; color: #087f79; font-size: 10px; font-weight: 800; }
.mcp-card code { display: block; margin: 15px 0 10px; padding: 12px; overflow: hidden; border: 1px solid #e4e7ec; border-radius: 12px; background: #f8f9fc; color: #667085; font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
.mcp-card button, footer button { border: 0; border-radius: 11px; padding: 10px 15px; background: #5b5bd6; color: #fff; font-size: 12px; font-weight: 800; cursor: pointer; }
.mcp-card button:disabled { opacity: .4; cursor: not-allowed; }
.mcp-card small { display: block; margin-top: 9px; color: #98a2b3; font-size: 10px; }
.error-card { margin-bottom: 14px; padding: 13px 16px; border: 1px solid #fecdca; border-radius: 14px; background: #fef3f2; color: #b42318; font-size: 12px; }
footer { padding: 6px 4px; display: flex; align-items: center; justify-content: space-between; color: #98a2b3; font-size: 11px; }
footer button { padding: 8px 13px; background: #eef2ff; color: #4f46e5; }
@media (max-width: 560px) { .welcome { padding: 18px 12px; } .hero, .card { padding: 17px; border-radius: 18px; } .brand-row { flex-wrap: wrap; } .status { margin-inline-start: 0; } }
</style>
