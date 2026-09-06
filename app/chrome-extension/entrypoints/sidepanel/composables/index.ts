// Brauzio Cloud connection compatibility adapter.
export { useAgentServer } from './useAgentServer';
export type { UseAgentServerOptions } from './useAgentServer';

// Shared theme used by popup, welcome screen, and sidepanel.
export { useAgentTheme, preloadAgentTheme, THEME_LABELS } from './useAgentTheme';
export type { AgentThemeId, UseAgentTheme } from './useAgentTheme';

// Web Editor state remains browser-local and does not require a native server.
export { useWebEditorTxState, WEB_EDITOR_TX_STATE_INJECTION_KEY } from './useWebEditorTxState';
export type { UseWebEditorTxStateOptions, WebEditorTxStateReturn } from './useWebEditorTxState';

// RR V3 composables.
export { useRRV3Rpc } from './useRRV3Rpc';
export { useRRV3Debugger } from './useRRV3Debugger';
export type { UseRRV3Rpc, UseRRV3RpcOptions, RpcRequestOptions } from './useRRV3Rpc';
export type { UseRRV3Debugger, UseRRV3DebuggerOptions } from './useRRV3Debugger';

// UI helpers retained for non-native surfaces.
export { useTextareaAutoResize } from './useTextareaAutoResize';
export type {
  UseTextareaAutoResizeOptions,
  UseTextareaAutoResizeReturn,
} from './useTextareaAutoResize';

export { useFakeCaret } from './useFakeCaret';
export type { UseFakeCaretOptions, UseFakeCaretReturn, FakeCaretTrailPoint } from './useFakeCaret';

export { useAgentInputPreferences } from './useAgentInputPreferences';
export type { UseAgentInputPreferences } from './useAgentInputPreferences';
