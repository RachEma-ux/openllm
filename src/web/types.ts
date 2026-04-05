/**
 * Type definitions for the OpenLLM web layer.
 *
 * All message types flowing over the WebSocket are modeled as a
 * discriminated union on `type` so both server and client can
 * exhaustively switch on the tag.
 */

// ---------------------------------------------------------------------------
// Server options
// ---------------------------------------------------------------------------

export type WebServerOptions = {
  /** TCP port to listen on. Defaults to OPENLLM_WEB_PORT or 5000. Range: 5000–5999. */
  port?: number
  /**
   * Callback invoked when the client sends a user message.
   * Returns the assistant's full reply, or null if the engine handled
   * all streaming directly (bridge skips its own token+done emit).
   */
  onMessage: (msg: string) => Promise<string | null>
  /**
   * Called after the WebSocketBridge is created, allowing the engine
   * to register itself for direct streaming access.
   */
  onBridgeReady?: (bridge: import('./ws-bridge.js').WebSocketBridge) => void
}

// ---------------------------------------------------------------------------
// Provider / session metadata surfaced by REST endpoints
// ---------------------------------------------------------------------------

export type ProviderInfo = {
  name: string
  model: string
  baseUrl: string
}

export type SessionInfo = {
  id: string
  title: string
  working: boolean
  messageCount: number
}

// ---------------------------------------------------------------------------
// WebSocket protocol: client -> server
// ---------------------------------------------------------------------------

export type ClientMessage =
  | { type: 'message'; content: string }
  | { type: 'cancel' }
  | { type: 'permission_response'; id: string; allowed: boolean }

// ---------------------------------------------------------------------------
// WebSocket protocol: server -> client
// ---------------------------------------------------------------------------

export type ServerTokenMessage = {
  type: 'token'
  content: string
}

export type ServerToolUseMessage = {
  type: 'tool_use'
  id: string
  tool: string
  input: Record<string, unknown>
}

export type ServerToolResultMessage = {
  type: 'tool_result'
  id: string
  tool: string
  output: string
}

export type ServerDoneMessage = {
  type: 'done'
  usage: {
    input_tokens: number
    output_tokens: number
    cost_usd: number
  }
}

export type ServerErrorMessage = {
  type: 'error'
  message: string
}

export type ServerPermissionRequestMessage = {
  type: 'permission_request'
  id: string
  tool: string
  input: Record<string, unknown>
}

export type ServerMessage =
  | ServerTokenMessage
  | ServerToolUseMessage
  | ServerToolResultMessage
  | ServerDoneMessage
  | ServerErrorMessage
  | ServerPermissionRequestMessage

/** Union of every message the bridge can emit or receive. */
export type BridgeMessage = ClientMessage | ServerMessage
