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

interface PairingCode {
  code: string;
  expiresAt: number;
  deviceId: string;
}

interface ControlState {
  paused: boolean;
  reason: string;
  source: 'human' | 'manual' | 'cloud' | 'safety' | 'none';
  since: number | null;
  lastUpdated: number;
  lastHumanInputAt?: number;
  lastHumanInputType?: string;
}

const config = reactive<RelayConfig>({ relayUrl: '', deviceId: 'default', deviceToken: '', autoConnect: true });
const status = reactive<RelayStatus>({ state: 'disconnected', authenticated: false, lastUpdated: Date.now() });
const busy = ref(false);
const showSetup = ref(false);
const showToken = ref(false);
const copied = ref(false);
const pairing = ref<PairingCode | null>(null);
const pairingBusy = ref(false);
const controlBusy = ref(false);
const control = reactive<ControlState>({ paused: false, reason: '', source: 'none', since: null, lastUpdated: Date.now() });
const version = chrome.runtime.getManifest().version;

const isConnected = computed(() => status.state === 'connected' && status.authenticated);
const canSave = computed(() => config.relayUrl.trim().length > 0 && config.deviceToken.trim().length >= 16);
const statusLabel = computed(() => isConnected.value ? 'جاهز للتحكم' : status.state === 'connecting' ? 'جارٍ الاتصال' : status.state === 'error' ? 'يحتاج مراجعة' : status.state === 'disabled' ? 'الاتصال التلقائي متوقف' : 'غير متصل');
const statusHint = computed(() => isConnected.value ? 'Brauzio Cloud متصل بهذا المتصفح وجاهز لاستقبال جلسات MCP المصرح بها.' : status.state === 'connecting' ? 'يتم إنشاء قناة آمنة مع Cloudflare.' : status.lastError || 'أدخل إعدادات Cloudflare للبدء.');
const workerHost = computed(() => { try { const raw = /^https?:\/\//i.test(config.relayUrl) ? config.relayUrl : `https://${config.relayUrl}`; return new URL(raw).host || 'غير محدد'; } catch { return 'غير محدد'; } });
const mcpUrl = computed(() => { if (!config.relayUrl) return ''; try { const raw = /^https?:\/\//i.test(config.relayUrl) ? config.relayUrl : `https://${config.relayUrl}`; const url = new URL(raw); url.protocol = url.protocol === 'http:' ? 'http:' : 'https:'; url.pathname = '/mcp'; url.search = ''; url.hash = ''; return url.toString(); } catch { return ''; } });
const lastUpdated = computed(() => !status.lastUpdated ? '—' : new Intl.DateTimeFormat('ar', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(status.lastUpdated)));
const pairingRemaining = computed(() => { if (!pairing.value) return ''; const seconds = Math.max(0, Math.ceil((pairing.value.expiresAt - Date.now()) / 1000)); return seconds > 0 ? `صالح لمدة ${Math.ceil(seconds / 60)} دقائق` : 'انتهت صلاحية الرمز'; });
const controlLabel = computed(() => control.paused ? 'تحكم ChatGPT متوقف' : 'تحكم ChatGPT مفعّل');
const controlHint = computed(() => {
  if (!control.paused) return 'إذا بدأت استخدام الماوس أو لوحة المفاتيح أثناء عمل Brauzio، يتوقف التحكم الآلي لحمايتك من تعارض الأوامر.';
  if (control.source === 'human') return 'تم اكتشاف تدخل منك في المتصفح. أدوات التغيير متوقفة، بينما القراءة والتشخيص تبقى متاحة.';
  if (control.source === 'manual') return 'تم تفعيل الإيقاف الطارئ يدويًا. لن تنفذ أدوات التغيير حتى تضغط استئناف.';
  return `التحكم متوقف: ${control.reason || 'حالة أمان'}`;
});
function applyStatus(next?: Partial<RelayStatus>) { if (next) Object.assign(status, next); }
async function loadState() { const [configResponse, statusResponse, pairingResponse, controlResponse] = await Promise.all([chrome.runtime.sendMessage({ type: 'brauzio_relay_get_config' }), chrome.runtime.sendMessage({ type: 'brauzio_relay_get_status' }), chrome.runtime.sendMessage({ type: 'brauzio_pairing_get' }), chrome.runtime.sendMessage({ type: 'brauzio_control_get_state' })]); if (configResponse?.success && configResponse.config) Object.assign(config, configResponse.config); if (statusResponse?.success && statusResponse.status) applyStatus(statusResponse.status); if (pairingResponse?.success) pairing.value = pairingResponse.pairing || null; if (controlResponse?.success && controlResponse.state) Object.assign(control, controlResponse.state); }
async function saveAndConnect() { if (!canSave.value || busy.value) return; busy.value = true; try { const response = await chrome.runtime.sendMessage({ type: 'brauzio_relay_save_config', config: { relayUrl: config.relayUrl.trim(), deviceId: config.deviceId.trim() || 'default', deviceToken: config.deviceToken.trim(), autoConnect: config.autoConnect } }); if (!response?.success) throw new Error(response?.error || 'تعذر حفظ إعدادات الاتصال'); if (response.status) applyStatus(response.status); showSetup.value = false; } catch (error) { applyStatus({ state: 'error', authenticated: false, lastError: error instanceof Error ? error.message : String(error) }); } finally { busy.value = false; } }
async function reconnect() { if (busy.value) return; busy.value = true; try { const response = await chrome.runtime.sendMessage({ type: 'brauzio_relay_connect' }); if (response?.status) applyStatus(response.status); } finally { busy.value = false; } }
async function disconnect() { if (busy.value) return; busy.value = true; try { const response = await chrome.runtime.sendMessage({ type: 'brauzio_relay_disconnect' }); if (response?.status) applyStatus(response.status); } finally { busy.value = false; } }
async function emergencyStop() { if (controlBusy.value) return; controlBusy.value = true; try { const response = await chrome.runtime.sendMessage({ type: 'brauzio_control_pause', reason: 'emergency_stop' }); if (!response?.success) throw new Error(response?.error || 'تعذر إيقاف تحكم ChatGPT'); if (response.state) Object.assign(control, response.state); } finally { controlBusy.value = false; } }
async function resumeControl() { if (controlBusy.value) return; controlBusy.value = true; try { const response = await chrome.runtime.sendMessage({ type: 'brauzio_control_resume' }); if (!response?.success) throw new Error(response?.error || 'تعذر استئناف تحكم ChatGPT'); if (response.state) Object.assign(control, response.state); } finally { controlBusy.value = false; } }
async function copyMcpUrl() { if (!mcpUrl.value) return; await navigator.clipboard.writeText(mcpUrl.value); copied.value = true; window.setTimeout(() => (copied.value = false), 1400); }
async function createPairingCode() { if (!isConnected.value || pairingBusy.value) return; pairingBusy.value = true; pairing.value = null; try { const response = await chrome.runtime.sendMessage({ type: 'brauzio_pairing_create' }); if (!response?.success) throw new Error(response?.error || 'تعذر إنشاء رمز الربط'); } catch (error) { applyStatus({ state: 'error', authenticated: false, lastError: error instanceof Error ? error.message : String(error) }); } finally { pairingBusy.value = false; } }
const runtimeListener = (message: any) => { if (message?.type === 'brauzio_relay_status_changed' && message.status) applyStatus(message.status); if (message?.type === 'brauzio_pairing_code_changed' && message.pairing) pairing.value = message.pairing; if (message?.type === 'brauzio_control_state_changed' && message.state) Object.assign(control, message.state); };
onMounted(async () => { chrome.runtime.onMessage.addListener(runtimeListener); try { await loadState(); } catch (error) { applyStatus({ state: 'error', authenticated: false, lastError: error instanceof Error ? error.message : String(error) }); } });
onBeforeUnmount(() => chrome.runtime.onMessage.removeListener(runtimeListener));
</script>

<template>
  <div class="brauzio" dir="rtl">
    <header class="topbar"><div class="brand"><img src="/brand/brauzio-mark.svg" alt="" class="brand-mark" aria-hidden="true" /><div class="brand-copy"><h1>Brauzio</h1><p>تحكم ذكي في Chrome</p></div></div><span class="version">v{{ version }}</span></header>
    <main class="main">
      <section class="status-card" :class="{ online: isConnected }"><div class="status-row"><span class="status-dot" :class="`state-${status.state}`"></span><div class="status-copy"><span class="label">الحالة</span><h2>{{ statusLabel }}</h2><p>{{ statusHint }}</p></div></div><div class="facts"><div><span>الجهاز</span><strong dir="ltr">{{ config.deviceId || 'default' }}</strong></div><div><span>الخدمة</span><strong dir="ltr">{{ workerHost }}</strong></div><div><span>آخر تحديث</span><strong>{{ lastUpdated }}</strong></div></div><div class="actions"><button v-if="isConnected" class="button secondary" :disabled="busy" @click="disconnect">قطع الاتصال</button><button v-else class="button primary" :disabled="busy || !canSave" @click="saveAndConnect">{{ busy ? 'جارٍ الاتصال…' : 'اتصال' }}</button><button v-if="!isConnected && canSave" class="button quiet" :disabled="busy" @click="reconnect">إعادة المحاولة</button></div></section>
      <section class="control-card" :class="{ paused: control.paused }"><div class="control-head"><div class="control-state-icon" aria-hidden="true">{{ control.paused ? "■" : "●" }}</div><div><span class="label">Human Takeover</span><h3>{{ controlLabel }}</h3><p>{{ controlHint }}</p></div></div><button v-if="control.paused" class="button resume full" :disabled="controlBusy" @click="resumeControl">{{ controlBusy ? "جارٍ الاستئناف…" : "استئناف تحكم ChatGPT" }}</button><button v-else class="button danger full" :disabled="controlBusy" @click="emergencyStop">{{ controlBusy ? "جارٍ الإيقاف…" : "إيقاف طارئ" }}</button></section>
      <section class="feature-strip"><div class="cursor-preview" aria-hidden="true"><span class="cursor-arrow">↖</span><span class="cursor-badge">B</span></div><div><strong>مؤشر Brauzio المرئي</strong><p>يظهر داخل الصفحة أثناء الحركة والنقر والسحب حتى ترى ما ينفذه الذكاء الاصطناعي.</p></div><span class="feature-state">تلقائي</span></section>
      <section class="mcp-card"><div class="section-title"><div><span class="label">ChatGPT</span><h3>ربط MCP الآمن</h3></div><span class="private-pill">OAuth 2.1</span></div><div class="masked-url" dir="ltr">{{ mcpUrl || 'لم يتم إنشاء الرابط بعد' }}</div><button class="button primary full" :disabled="!mcpUrl" @click="copyMcpUrl">{{ copied ? 'تم النسخ' : 'نسخ رابط MCP' }}</button><div class="pairing-box"><div><strong>رمز ربط مؤقت</strong><p>بعد إضافة رابط MCP إلى ChatGPT، أنشئ رمزًا وأدخله في صفحة التفويض. لا تُرسل كلمة سر الجهاز إلى ChatGPT.</p></div><button class="button quiet full" :disabled="!isConnected || pairingBusy" @click="createPairingCode">{{ pairingBusy ? 'جارٍ الإنشاء…' : 'إنشاء رمز ربط ChatGPT' }}</button><div v-if="pairing" class="pairing-code"><strong dir="ltr">{{ pairing.code }}</strong><span>{{ pairingRemaining }}</span></div></div></section>
      <section class="setup-card"><button class="setup-toggle" type="button" @click="showSetup = !showSetup"><div><span class="label">الإعداد</span><strong>Cloudflare & الجهاز</strong></div><span class="chevron" :class="{ open: showSetup }">⌄</span></button><div v-if="showSetup" class="setup-body"><label class="field"><span>رابط Cloudflare Worker</span><input v-model.trim="config.relayUrl" type="url" dir="ltr" placeholder="https://…workers.dev" /></label><label class="field"><span>معرف الجهاز</span><input v-model.trim="config.deviceId" type="text" dir="ltr" placeholder="default" /></label><label class="field"><span>رمز الجهاز</span><div class="token-row"><input v-model="config.deviceToken" :type="showToken ? 'text' : 'password'" dir="ltr" autocomplete="new-password" placeholder="••••••••••••••••" /><button type="button" @click="showToken = !showToken">{{ showToken ? 'إخفاء' : 'إظهار' }}</button></div></label><label class="switch-row"><div><strong>اتصال تلقائي</strong><span>الاتصال بـ Brauzio Cloud عند تشغيل Chrome</span></div><input v-model="config.autoConnect" type="checkbox" /></label><button class="button primary full" :disabled="busy || !canSave" @click="saveAndConnect">حفظ واتصال</button></div></section>
    </main>
    <footer class="footer"><span>Brauzio Cloud</span><span>MCP • OAuth • Chrome</span></footer>
  </div>
</template>
