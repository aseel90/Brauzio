import { computed, onMounted, onUnmounted, ref } from 'vue';
import type { AgentEngineInfo, RealtimeEvent } from 'chrome-mcp-shared';

interface ServerStatus {
  isRunning: boolean;
  lastUpdated: number;
}

interface RelayStatus {
  state: 'disabled' | 'connecting' | 'connected' | 'disconnected' | 'error';
  authenticated: boolean;
  lastUpdated: number;
  lastError?: string;
}

export interface UseAgentServerOptions {
  getSessionId?: () => string;
  onMessage?: (event: RealtimeEvent) => void;
  onError?: (error: string) => void;
}

/**
 * Compatibility composable for UI originally built around the upstream local Agent Server.
 * Brauzio Cloud has no localhost/native Agent process; this adapter reports Cloudflare relay
 * readiness so existing UI components can degrade cleanly without reconnecting to localhost.
 */
export function useAgentServer(options: UseAgentServerOptions = {}) {
  const serverPort = ref<number | null>(null);
  const nativeConnected = ref(false);
  const serverStatus = ref<ServerStatus | null>(null);
  const connecting = ref(false);
  const engines = ref<AgentEngineInfo[]>([]);
  const eventSource = ref<EventSource | null>(null);
  const lastError = ref<string | null>(null);

  const isServerReady = computed(
    () => nativeConnected.value && serverStatus.value?.isRunning === true,
  );

  function applyRelayStatus(status?: Partial<RelayStatus>) {
    if (!status) return;
    const ready = status.state === 'connected' && status.authenticated === true;
    nativeConnected.value = ready;
    serverStatus.value = {
      isRunning: ready,
      lastUpdated: status.lastUpdated || Date.now(),
    };
    lastError.value = status.lastError || null;
  }

  async function refreshRelayStatus(): Promise<boolean> {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'brauzio_relay_get_status' });
      if (response?.success) {
        applyRelayStatus(response.status);
        return isServerReady.value;
      }
      return false;
    } catch (error) {
      nativeConnected.value = false;
      serverStatus.value = { isRunning: false, lastUpdated: Date.now() };
      lastError.value = error instanceof Error ? error.message : String(error);
      options.onError?.(lastError.value);
      return false;
    }
  }

  /**
   * Legacy method name retained for component compatibility.
   * It now ensures the Brauzio Cloud relay is connected.
   */
  async function ensureNativeServer(_opts: { forceConnect?: boolean } = {}): Promise<boolean> {
    connecting.value = true;
    try {
      const current = await refreshRelayStatus();
      if (current) return true;

      const response = await chrome.runtime.sendMessage({ type: 'brauzio_relay_connect' });
      if (response?.success) {
        applyRelayStatus(response.status);
      }
      return isServerReady.value;
    } catch (error) {
      lastError.value = error instanceof Error ? error.message : String(error);
      options.onError?.(lastError.value);
      return false;
    } finally {
      connecting.value = false;
    }
  }

  /**
   * Embedded AI engines belonged to the removed local Agent Server.
   * Browser automation is now driven by ChatGPT through Remote MCP.
   */
  async function fetchEngines(): Promise<void> {
    engines.value = [];
  }

  function isEventSourceConnected(): boolean {
    return false;
  }

  function openEventSource(): void {
    // No localhost SSE stream exists in the cloud-only Brauzio build.
  }

  function closeEventSource(): void {
    if (eventSource.value) {
      eventSource.value.close();
      eventSource.value = null;
    }
  }

  async function reconnect(): Promise<void> {
    connecting.value = true;
    try {
      const response = await chrome.runtime.sendMessage({ type: 'brauzio_relay_connect' });
      if (response?.success) applyRelayStatus(response.status);
    } catch (error) {
      lastError.value = error instanceof Error ? error.message : String(error);
      options.onError?.(lastError.value);
    } finally {
      connecting.value = false;
    }
  }

  async function initialize(): Promise<void> {
    await refreshRelayStatus();
  }

  const relayListener = (message: any) => {
    if (message?.type === 'brauzio_relay_status_changed') {
      applyRelayStatus(message.status);
    }
  };

  onMounted(() => {
    chrome.runtime.onMessage.addListener(relayListener);
  });

  onUnmounted(() => {
    chrome.runtime.onMessage.removeListener(relayListener);
    closeEventSource();
  });

  return {
    serverPort,
    nativeConnected,
    serverStatus,
    connecting,
    engines,
    eventSource,
    lastError,
    isServerReady,
    ensureNativeServer,
    fetchEngines,
    openEventSource,
    closeEventSource,
    isEventSourceConnected,
    reconnect,
    initialize,
  };
}
