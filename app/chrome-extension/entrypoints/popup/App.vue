<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';

type RelayState = 'disabled' | 'connecting' | 'connected' | 'disconnected' | 'error';
type StreamPreset = 'economy' | 'balanced' | 'smooth' | 'custom';

interface RelayConfig { relayUrl: string; deviceId: string; deviceToken: string; autoConnect: boolean }
interface RelayStatus { state: RelayState; authenticated: boolean; lastUpdated: number; lastError?: string }
interface PairingCode { code: string; expiresAt: number; deviceId: string }
interface ControlState { paused: boolean; reason: string; source: 'human' | 'manual' | 'cloud' | 'safety' | 'none'; since: number | null; lastUpdated: number }
interface DiagnosticCheck { key: string; label: string; state: 'ok' | 'warn' | 'error'; detail: string; latencyMs?: number }
interface DiagnosticReport { generatedAt: number; overall: 'ok' | 'warn' | 'error'; extensionVersion: string; serverVersion?: string; schemaVersion?: string; toolCount?: number; checks: DiagnosticCheck[] }
interface LiveViewStatus { running: boolean; intervalMs?: number; quality?: number; scale?: number; maxFrames?: number; bufferedFrames?: number; captured?: number; droppedDuplicates?: number; lastError?: string | null }

const STREAM_CONFIG_KEY = 'brauzioLiveViewUiConfig';
const config = reactive<RelayConfig>({ relayUrl: '', deviceId: 'default', deviceToken: '', autoConnect: true });
const status = reactive<RelayStatus>({ state: 'disconnected', authenticated: false, lastUpdated: Date.now() });
const control = reactive<ControlState>({ paused: false, reason: '', source: 'none', since: null, lastUpdated: Date.now() });
const stream = reactive<LiveViewStatus>({ running: false });
const streamConfig = reactive({ intervalMs: 1200, quality: 0.72, scale: 0.65, maxFrames: 2 });
const streamPreset = ref<StreamPreset>('balanced');
const pairing = ref<PairingCode | null>(null);
const diagnostics = ref<DiagnosticReport | null>(null);
const busy = ref(false);
const controlBusy = ref(false);
const streamBusy = ref(false);
const diagnosticsBusy = ref(false);
const pairingBusy = ref(false);
const showToken = ref(false);
const copied = ref(false);
const streamError = ref('');
const version = chrome.runtime.getManifest().version;
let livePollTimer: ReturnType<typeof setInterval> | null = null;

const isConnected = computed(() => status.state === 'connected' && status.authenticated);
const canSave = computed(() => config.relayUrl.trim().length > 0 && config.deviceToken.trim().length >= 16);
const statusLabel = computed(() => isConnected.value ? 'متصل وجاهز' : status.state === 'connecting' ? 'جارٍ الاتصال' : status.state === 'error' ? 'مشكلة اتصال' : 'غير متصل');
const controlLabel = computed(() => control.paused ? 'Agent متوقف' : 'Agent مفعّل');
const diagnosticsLabel = computed(() => !diagnostics.value ? 'لم يُفحص' : diagnostics.value.overall === 'ok' ? 'سليم' : diagnostics.value.overall === 'warn' ? 'ملاحظات' : 'مشكلة');
const streamLabel = computed(() => stream.running ? 'البث يعمل' : 'البث متوقف');
const streamRateLabel = computed(() => `${((stream.intervalMs || streamConfig.intervalMs) / 1000).toFixed(1)} ث`);
const streamQualityLabel = computed(() => `${Math.round((stream.quality || streamConfig.quality) * 100)}%`);
const lastUpdated = computed(() => new Intl.DateTimeFormat('ar', { hour: '2-digit', minute: '2-digit' }).format(new Date(status.lastUpdated)));
const workerHost = computed(() => { try { const raw = /^https?:\/\//i.test(config.relayUrl) ? config.relayUrl : `https://${config.relayUrl}`; return new URL(raw).host || 'غير محدد'; } catch { return 'غير محدد'; } });
const mcpUrl = computed(() => { if (!config.relayUrl) return ''; try { const raw = /^https?:\/\//i.test(config.relayUrl) ? config.relayUrl : `https://${config.relayUrl}`; const url = new URL(raw); url.protocol = url.protocol === 'http:' ? 'http:' : 'https:'; url.pathname = '/mcp'; url.search = ''; url.hash = ''; return url.toString(); } catch { return ''; } });
const pairingRemaining = computed(() => { if (!pairing.value) return ''; const seconds = Math.max(0, Math.ceil((pairing.value.expiresAt - Date.now()) / 1000)); return seconds > 0 ? `صالح ${Math.ceil(seconds / 60)} دقائق` : 'انتهت الصلاحية'; });

function applyStatus(next?: Partial<RelayStatus>) { if (next) Object.assign(status, next); }
function applyLiveStatus(next?: Partial<LiveViewStatus>) { Object.assign(stream, { running: false, lastError: null }, next || {}); if (stream.running) Object.assign(streamConfig, { intervalMs: stream.intervalMs ?? streamConfig.intervalMs, quality: stream.quality ?? streamConfig.quality, scale: stream.scale ?? streamConfig.scale, maxFrames: stream.maxFrames ?? streamConfig.maxFrames }); }
function diagnosticIcon(state: DiagnosticCheck['state']) { return state === 'ok' ? '✓' : state === 'warn' ? '!' : '×'; }

async function loadStreamConfig() { const stored = await chrome.storage.local.get(STREAM_CONFIG_KEY); const saved = stored?.[STREAM_CONFIG_KEY]; if (saved && typeof saved === 'object') Object.assign(streamConfig, saved); }
async function saveStreamConfig() { await chrome.storage.local.set({ [STREAM_CONFIG_KEY]: { ...streamConfig } }); }
async function refreshLiveView() { try { const response = await chrome.runtime.sendMessage({ type: 'brauzio_live_view_get_status' }); if (response?.success) { applyLiveStatus(response.status); streamError.value = ''; } } catch {} }
async function loadState() {
  const [configResponse, statusResponse, pairingResponse, controlResponse] = await Promise.all([
    chrome.runtime.sendMessage({ type: 'brauzio_relay_get_config' }),
    chrome.runtime.sendMessage({ type: 'brauzio_relay_get_status' }),
    chrome.runtime.sendMessage({ type: 'brauzio_pairing_get' }),
    chrome.runtime.sendMessage({ type: 'brauzio_control_get_state' }),
  ]);
  if (configResponse?.success && configResponse.config) Object.assign(config, configResponse.config);
  if (statusResponse?.success && statusResponse.status) applyStatus(statusResponse.status);
  if (pairingResponse?.success) pairing.value = pairingResponse.pairing || null;
  if (controlResponse?.success && controlResponse.state) Object.assign(control, controlResponse.state);
  await refreshLiveView();
}
async function saveAndConnect() { if (!canSave.value || busy.value) return; busy.value = true; try { const response = await chrome.runtime.sendMessage({ type: 'brauzio_relay_save_config', config: { relayUrl: config.relayUrl.trim(), deviceId: config.deviceId.trim() || 'default', deviceToken: config.deviceToken.trim(), autoConnect: config.autoConnect } }); if (!response?.success) throw new Error(response?.error || 'تعذر حفظ الإعدادات'); if (response.status) applyStatus(response.status); } finally { busy.value = false; } }
async function reconnect() { if (busy.value) return; busy.value = true; try { const response = await chrome.runtime.sendMessage({ type: 'brauzio_relay_connect' }); if (response?.status) applyStatus(response.status); } finally { busy.value = false; } }
async function disconnect() { if (busy.value) return; busy.value = true; try { const response = await chrome.runtime.sendMessage({ type: 'brauzio_relay_disconnect' }); if (response?.status) applyStatus(response.status); } finally { busy.value = false; } }
async function emergencyStop() { if (controlBusy.value) return; controlBusy.value = true; try { const response = await chrome.runtime.sendMessage({ type: 'brauzio_control_pause', reason: 'emergency_stop' }); if (response?.state) Object.assign(control, response.state); } finally { controlBusy.value = false; } }
async function resumeControl() { if (controlBusy.value) return; controlBusy.value = true; try { const response = await chrome.runtime.sendMessage({ type: 'brauzio_control_resume' }); if (response?.state) Object.assign(control, response.state); } finally { controlBusy.value = false; } }
function applyStreamPreset(preset: StreamPreset) { streamPreset.value = preset; if (preset === 'economy') Object.assign(streamConfig, { intervalMs: 2500, quality: 0.55, scale: 0.5, maxFrames: 1 }); if (preset === 'balanced') Object.assign(streamConfig, { intervalMs: 1200, quality: 0.72, scale: 0.65, maxFrames: 2 }); if (preset === 'smooth') Object.assign(streamConfig, { intervalMs: 700, quality: 0.82, scale: 0.75, maxFrames: 3 }); void saveStreamConfig(); }
async function startLiveView() { if (streamBusy.value) return; streamBusy.value = true; streamError.value = ''; try { await saveStreamConfig(); const response = await chrome.runtime.sendMessage({ type: 'brauzio_live_view_start', options: { ...streamConfig } }); if (!response?.success) throw new Error(response?.error || 'تعذر تشغيل البث'); applyLiveStatus(response.status); } catch (error) { streamError.value = error instanceof Error ? error.message : String(error); } finally { streamBusy.value = false; } }
async function stopLiveView() { if (streamBusy.value) return; streamBusy.value = true; streamError.value = ''; try { const response = await chrome.runtime.sendMessage({ type: 'brauzio_live_view_stop' }); if (!response?.success) throw new Error(response?.error || 'تعذر إيقاف البث'); applyLiveStatus(response.status); } catch (error) { streamError.value = error instanceof Error ? error.message : String(error); } finally { streamBusy.value = false; } }
async function runDiagnostics() { if (diagnosticsBusy.value) return; diagnosticsBusy.value = true; try { const response = await chrome.runtime.sendMessage({ type: 'brauzio_diagnostics_run' }); if (response?.success && response.report) diagnostics.value = response.report; } finally { diagnosticsBusy.value = false; } }
async function copyMcpUrl() { if (!mcpUrl.value) return; await navigator.clipboard.writeText(mcpUrl.value); copied.value = true; setTimeout(() => copied.value = false, 1400); }
async function createPairingCode() { if (!isConnected.value || pairingBusy.value) return; pairingBusy.value = true; pairing.value = null; try { await chrome.runtime.sendMessage({ type: 'brauzio_pairing_create' }); } finally { pairingBusy.value = false; } }

const runtimeListener = (message: any) => { if (message?.type === 'brauzio_relay_status_changed' && message.status) applyStatus(message.status); if (message?.type === 'brauzio_pairing_code_changed') pairing.value = message.pairing || null; if (message?.type === 'brauzio_control_state_changed' && message.state) Object.assign(control, message.state); };
onMounted(async () => { chrome.runtime.onMessage.addListener(runtimeListener); await loadStreamConfig(); await loadState(); livePollTimer = setInterval(() => void refreshLiveView(), 1500); });
onBeforeUnmount(() => { chrome.runtime.onMessage.removeListener(runtimeListener); if (livePollTimer) clearInterval(livePollTimer); });
</script>

<template>
  <div class="brauzio" dir="rtl">
    <header class="topbar"><div class="brand"><img src="/brand/brauzio-mark.svg" alt="" class="brand-mark" /><div><h1>Brauzio</h1><p>Chrome MCP Control Center</p></div></div><span class="version">v{{ version }}</span></header>
    <main class="main">
      <section class="overview-card" :class="{ online: isConnected }">
        <div class="overview-head"><div><span class="label">Brauzio Cloud</span><h2>{{ statusLabel }}</h2></div><span class="status-dot" :class="`state-${status.state}`"></span></div>
        <div class="facts"><span><small>الجهاز</small><strong dir="ltr">{{ config.deviceId || 'default' }}</strong></span><span><small>الخدمة</small><strong dir="ltr">{{ workerHost }}</strong></span><span><small>آخر تحديث</small><strong>{{ lastUpdated }}</strong></span></div>
        <div class="actions"><button v-if="isConnected" class="button secondary" :disabled="busy" @click="disconnect">قطع الاتصال</button><button v-else class="button primary" :disabled="busy || !canSave" @click="saveAndConnect">اتصال</button><button v-if="!isConnected && canSave" class="button quiet" :disabled="busy" @click="reconnect">إعادة المحاولة</button></div>
      </section>

      <div class="dashboard-grid">
        <section class="mini-card" :class="{ paused: control.paused }"><div class="mini-head"><span class="mini-icon">{{ control.paused ? '■' : '●' }}</span><div><span class="label">Agent</span><h3>{{ controlLabel }}</h3></div></div><p>{{ control.paused ? 'لن تنفذ أدوات التغيير حتى تستأنف.' : 'الماوس والكيبورد والتمرير لا توقف Agent. الإيقاف والاستئناف من هنا فقط.' }}</p><button v-if="control.paused" class="button resume full" :disabled="controlBusy" @click="resumeControl">استئناف</button><button v-else class="button danger full" :disabled="controlBusy" @click="emergencyStop">إيقاف فوري</button></section>
        <section class="mini-card"><div class="mini-head"><span class="mini-icon neutral">✓</span><div><span class="label">Diagnostics</span><h3>{{ diagnosticsLabel }}</h3></div></div><p>فحص الاتصال وCDP والأدوات بدون تغيير الصفحة.</p><button class="button secondary full" :disabled="diagnosticsBusy" @click="runDiagnostics">{{ diagnosticsBusy ? 'جارٍ الفحص…' : 'فحص الآن' }}</button></section>
      </div>

      <section class="stream-card" :class="{ active: stream.running }">
        <div class="section-title"><div><span class="label">Live View</span><h3>البث المباشر للـAgent</h3></div><span class="stream-state" :class="{ active: stream.running }"><i></i>{{ streamLabel }}</span></div>
        <p class="intro">Memory-only بدون حفظ الصور على القرص. يمكنك تخفيف عدد اللقطات أو إيقاف البث من هنا.</p>
        <div class="stream-stats"><span><small>الفاصل</small><strong>{{ streamRateLabel }}</strong></span><span><small>الجودة</small><strong>{{ streamQualityLabel }}</strong></span><span><small>الذاكرة</small><strong>{{ stream.bufferedFrames || 0 }}/{{ stream.maxFrames || streamConfig.maxFrames }}</strong></span><span><small>الملتقط</small><strong>{{ stream.captured || 0 }}</strong></span></div>
        <div class="preset-row"><button :class="{ selected: streamPreset === 'economy' }" @click="applyStreamPreset('economy')">اقتصادي</button><button :class="{ selected: streamPreset === 'balanced' }" @click="applyStreamPreset('balanced')">متوازن</button><button :class="{ selected: streamPreset === 'smooth' }" @click="applyStreamPreset('smooth')">سلس</button></div>
        <div class="stream-controls"><label><span>سرعة اللقطات</span><select v-model.number="streamConfig.intervalMs" @change="streamPreset='custom'; saveStreamConfig()"><option :value="700">0.7 ثانية</option><option :value="1200">1.2 ثانية</option><option :value="2000">2 ثانية</option><option :value="3000">3 ثوانٍ</option><option :value="5000">5 ثوانٍ</option></select></label><label><span>صور في الذاكرة</span><select v-model.number="streamConfig.maxFrames" @change="streamPreset='custom'; saveStreamConfig()"><option :value="1">صورة واحدة</option><option :value="2">صورتان</option><option :value="3">3 صور</option></select></label><label><span>الجودة</span><select v-model.number="streamConfig.quality" @change="streamPreset='custom'; saveStreamConfig()"><option :value="0.55">55%</option><option :value="0.72">72%</option><option :value="0.82">82%</option></select></label></div>
        <p v-if="stream.lastError || streamError" class="inline-error">{{ streamError || stream.lastError }}</p>
        <button v-if="stream.running" class="button danger full stream-action" :disabled="streamBusy" @click="stopLiveView">إيقاف البث الآن</button><button v-else class="button primary full stream-action" :disabled="streamBusy" @click="startLiveView">تشغيل البث على الصفحة الحالية</button>
      </section>

      <details class="fold-card"><summary><div><span class="label">ChatGPT</span><strong>ربط MCP و OAuth</strong></div><span>+</span></summary><div class="fold-body"><div class="masked-url" dir="ltr">{{ mcpUrl || 'لم يتم إنشاء الرابط بعد' }}</div><button class="button primary full" :disabled="!mcpUrl" @click="copyMcpUrl">{{ copied ? 'تم النسخ' : 'نسخ رابط MCP' }}</button><div class="pairing-box"><strong>رمز ربط مؤقت</strong><p>أنشئ الرمز ثم أدخله في صفحة التفويض.</p><button class="button quiet full" :disabled="!isConnected || pairingBusy" @click="createPairingCode">{{ pairingBusy ? 'جارٍ الإنشاء…' : 'إنشاء رمز الربط' }}</button><div v-if="pairing" class="pairing-code"><strong dir="ltr">{{ pairing.code }}</strong><span>{{ pairingRemaining }}</span></div></div></div></details>

      <details v-if="diagnostics" class="fold-card"><summary><div><span class="label">Diagnostics</span><strong>نتائج الفحص</strong></div><span>+</span></summary><div class="fold-body diagnostics-results"><div v-for="check in diagnostics.checks" :key="check.key" class="diagnostic-row"><span class="diag-icon" :class="`state-${check.state}`">{{ diagnosticIcon(check.state) }}</span><div><strong>{{ check.label }}</strong><p>{{ check.detail }}</p></div></div></div></details>

      <details class="fold-card"><summary><div><span class="label">Settings</span><strong>Cloudflare والجهاز</strong></div><span>+</span></summary><div class="fold-body"><label class="field"><span>رابط Cloudflare Worker</span><input v-model.trim="config.relayUrl" type="url" dir="ltr" placeholder="https://…workers.dev" /></label><label class="field"><span>معرف الجهاز</span><input v-model.trim="config.deviceId" type="text" dir="ltr" /></label><label class="field"><span>رمز الجهاز</span><div class="token-row"><input v-model="config.deviceToken" :type="showToken ? 'text' : 'password'" dir="ltr" /><button type="button" @click="showToken=!showToken">{{ showToken ? 'إخفاء' : 'إظهار' }}</button></div></label><label class="switch-row"><div><strong>اتصال تلقائي</strong><span>الاتصال عند تشغيل Chrome</span></div><input v-model="config.autoConnect" type="checkbox" /></label><button class="button primary full" :disabled="busy || !canSave" @click="saveAndConnect">حفظ واتصال</button></div></details>
    </main>
    <footer class="footer"><span>Brauzio Cloud</span><span>MCP • OAuth • Chrome</span></footer>
  </div>
</template>
