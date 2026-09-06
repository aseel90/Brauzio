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

const config = reactive<RelayConfig>({ relayUrl: '', deviceId: 'default', deviceToken: '', autoConnect: true });
const status = reactive<RelayStatus>({ state: 'disconnected', authenticated: false, lastUpdated: Date.now() });
const busy = ref(false);
const showSetup = ref(false);
const showToken = ref(false);
const copied = ref(false);
const version = chrome.runtime.getManifest().version;

const isConnected = computed(() => status.state === 'connected' && status.authenticated);
const canSave = computed(() => config.relayUrl.trim().length > 0 && config.deviceToken.trim().length >= 16);
const statusLabel = computed(() => isConnected.value ? 'جاهز للتحكم' : status.state === 'connecting' ? 'جارٍ الاتصال' : status.state === 'error' ? 'يحتاج مراجعة' : status.state === 'disabled' ? 'الاتصال التلقائي متوقف' : 'غير متصل');
const statusHint = computed(() => isConnected.value ? 'ChatGPT متصل بهذا المتصفح عبر Brauzio Cloud.' : status.state === 'connecting' ? 'يتم إنشاء قناة آمنة مع Cloudflare.' : status.lastError || 'أدخل إعدادات Cloudflare للبدء.');
const workerHost = computed(() => { try { const raw = /^https?:\/\//i.test(config.relayUrl) ? config.relayUrl : `https://${config.relayUrl}`; return new URL(raw).host || 'غير محدد'; } catch { return 'غير محدد'; } });
const mcpUrl = computed(() => { if (!config.relayUrl || !config.deviceToken) return ''; try { const raw = /^https?:\/\//i.test(config.relayUrl) ? config.relayUrl : `https://${config.relayUrl}`; const url = new URL(raw); url.protocol = url.protocol === 'http:' ? 'http:' : 'https:'; if (!url.pathname || url.pathname === '/' || url.pathname.endsWith('/ws')) url.pathname = '/mcp'; url.searchParams.set('device', config.deviceId || 'default'); url.searchParams.set('key', config.deviceToken); return url.toString(); } catch { return ''; } });
const lastUpdated = computed(() => !status.lastUpdated ? '—' : new Intl.DateTimeFormat('ar', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(status.lastUpdated)));
function applyStatus(next?: Partial<RelayStatus>) { if (next) Object.assign(status, next); }
async function loadState() { const [configResponse, statusResponse] = await Promise.all([chrome.runtime.sendMessage({ type: 'brauzio_relay_get_config' }), chrome.runtime.sendMessage({ type: 'brauzio_relay_get_status' })]); if (configResponse?.success && configResponse.config) Object.assign(config, configResponse.config); if (statusResponse?.success && statusResponse.status) applyStatus(statusResponse.status); }
async function saveAndConnect() { if (!canSave.value || busy.value) return; busy.value = true; try { const response = await chrome.runtime.sendMessage({ type: 'brauzio_relay_save_config', config: { relayUrl: config.relayUrl.trim(), deviceId: config.deviceId.trim() || 'default', deviceToken: config.deviceToken.trim(), autoConnect: config.autoConnect } }); if (!response?.success) throw new Error(response?.error || 'تعذر حفظ إعدادات الاتصال'); if (response.status) applyStatus(response.status); showSetup.value = false; } catch (error) { applyStatus({ state: 'error', authenticated: false, lastError: error instanceof Error ? error.message : String(error) }); } finally { busy.value = false; } }
async function reconnect() { if (busy.value) return; busy.value = true; try { const response = await chrome.runtime.sendMessage({ type: 'brauzio_relay_connect' }); if (response?.status) applyStatus(response.status); } finally { busy.value = false; } }
async function disconnect() { if (busy.value) return; busy.value = true; try { const response = await chrome.runtime.sendMessage({ type: 'brauzio_relay_disconnect' }); if (response?.status) applyStatus(response.status); } finally { busy.value = false; } }
async function copyMcpUrl() { if (!mcpUrl.value) return; await navigator.clipboard.writeText(mcpUrl.value); copied.value = true; window.setTimeout(() => (copied.value = false), 1400); }
const runtimeListener = (message: any) => { if (message?.type === 'brauzio_relay_status_changed' && message.status) applyStatus(message.status); };
onMounted(async () => { chrome.runtime.onMessage.addListener(runtimeListener); try { await loadState(); } catch (error) { applyStatus({ state: 'error', authenticated: false, lastError: error instanceof Error ? error.message : String(error) }); } });
onBeforeUnmount(() => chrome.runtime.onMessage.removeListener(runtimeListener));
</script>

<template>
  <div class="brauzio" dir="rtl">
    <header class="topbar"><div class="brand"><img src="/brand/brauzio-mark.svg" alt="" class="brand-mark" aria-hidden="true" /><div class="brand-copy"><h1>Brauzio</h1><p>تحكم ذكي في Chrome</p></div></div><span class="version">v{{ version }}</span></header>
    <main class="main">
      <section class="status-card" :class="{ online: isConnected }"><div class="status-row"><span class="status-dot" :class="`state-${status.state}`"></span><div class="status-copy"><span class="label">الحالة</span><h2>{{ statusLabel }}</h2><p>{{ statusHint }}</p></div></div><div class="facts"><div><span>الجهاز</span><strong dir="ltr">{{ config.deviceId || 'default' }}</strong></div><div><span>الخدمة</span><strong dir="ltr">{{ workerHost }}</strong></div><div><span>آخر تحديث</span><strong>{{ lastUpdated }}</strong></div></div><div class="actions"><button v-if="isConnected" class="button secondary" :disabled="busy" @click="disconnect">قطع الاتصال</button><button v-else class="button primary" :disabled="busy || !canSave" @click="saveAndConnect">{{ busy ? 'جارٍ الاتصال…' : 'اتصال' }}</button><button v-if="!isConnected && canSave" class="button quiet" :disabled="busy" @click="reconnect">إعادة المحاولة</button></div></section>
      <section class="feature-strip"><div class="cursor-preview" aria-hidden="true"><span class="cursor-arrow">↖</span><span class="cursor-badge">B</span></div><div><strong>مؤشر Brauzio المرئي</strong><p>يظهر داخل الصفحة أثناء الحركة والنقر والسحب حتى ترى ما ينفذه الذكاء الاصطناعي.</p></div><span class="feature-state">تلقائي</span></section>
      <section class="mcp-card"><div class="section-title"><div><span class="label">ChatGPT</span><h3>رابط MCP</h3></div><span class="private-pill">خاص</span></div><div class="masked-url" dir="ltr">{{ mcpUrl ? `${workerHost}/mcp?device=${config.deviceId || 'default'}&key=••••••••` : 'لم يتم إنشاء الرابط بعد' }}</div><button class="button primary full" :disabled="!mcpUrl" @click="copyMcpUrl">{{ copied ? 'تم النسخ' : 'نسخ رابط MCP' }}</button></section>
      <section class="setup-card"><button class="setup-toggle" type="button" @click="showSetup = !showSetup"><div><span class="label">الإعداد</span><strong>Cloudflare & الجهاز</strong></div><span class="chevron" :class="{ open: showSetup }">⌄</span></button><div v-if="showSetup" class="setup-body"><label class="field"><span>رابط Cloudflare Worker</span><input v-model.trim="config.relayUrl" type="url" dir="ltr" placeholder="https://…workers.dev" /></label><label class="field"><span>معرف الجهاز</span><input v-model.trim="config.deviceId" type="text" dir="ltr" placeholder="default" /></label><label class="field"><span>رمز الربط</span><div class="token-row"><input v-model="config.deviceToken" :type="showToken ? 'text' : 'password'" dir="ltr" autocomplete="new-password" placeholder="••••••••••••••••" /><button type="button" @click="showToken = !showToken">{{ showToken ? 'إخفاء' : 'إظهار' }}</button></div></label><label class="switch-row"><div><strong>اتصال تلقائي</strong><span>الاتصال بـ Brauzio Cloud عند تشغيل Chrome</span></div><input v-model="config.autoConnect" type="checkbox" /></label><button class="button primary full" :disabled="busy || !canSave" @click="saveAndConnect">حفظ واتصال</button></div></section>
    </main>
    <footer class="footer"><span>Brauzio Cloud</span><span>MCP • Cloudflare • Chrome</span></footer>
  </div>
</template>
