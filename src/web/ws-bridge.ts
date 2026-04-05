/**
 * WebSocket bridge that translates between the browser client and the
 * OpenLLM backend (QueryEngine).
 *
 * The bridge maintains a set of active connections and broadcasts
 * server-side events (tokens, tool calls, errors, etc.) to every
 * connected client. Client messages are forwarded to the `onMessage`
 * callback provided at construction time.
 *
 * Concurrency: only one generation runs at a time. If a "message"
 * arrives while a generation is in progress it is rejected with an
 * error frame. Clients can send "cancel" to abort the active
 * generation.
 */

import type {
  BridgeMessage,
  ClientMessage,
  ServerMessage,
  WebServerOptions,
} from './types.js'

// Re-export the message union for convenience
export type { BridgeMessage }

// ---------------------------------------------------------------------------
// Types used by Bun's WebSocket handler (generic data attached to each ws)
// ---------------------------------------------------------------------------

export type WSData = {
  /** Unique connection identifier. */
  id: string
  /** Timestamp of the upgrade request. */
  connectedAt: number
}

// ---------------------------------------------------------------------------
// Bridge implementation
// ---------------------------------------------------------------------------

export class WebSocketBridge {
  /** All live WebSocket connections. */
  private connections = new Set<{ send(data: string): void; data: WSData }>()

  /** The callback that routes user messages to the QueryEngine. */
  private onMessage: WebServerOptions['onMessage']

  /** AbortController for the currently-running generation (if any). */
  private activeAbort: AbortController | null = null

  /** True while a generation is being processed. */
  private generating = false

  /** Pending permission-response resolvers keyed by connection id. */
  private permissionResolvers = new Map<
    string,
    (allowed: boolean) => void
  >()

  constructor(onMessage: WebServerOptions['onMessage']) {
    this.onMessage = onMessage
  }

  // -----------------------------------------------------------------------
  // Connection lifecycle
  // -----------------------------------------------------------------------

  addConnection(ws: { send(data: string): void; data: WSData }): void {
    this.connections.add(ws)
  }

  removeConnection(ws: { send(data: string): void; data: WSData }): void {
    this.connections.delete(ws)
    // Clean up any pending permission resolver for this connection
    this.permissionResolvers.delete(ws.data.id)
  }

  get connectionCount(): number {
    return this.connections.size
  }

  // -----------------------------------------------------------------------
  // Broadcasting
  // -----------------------------------------------------------------------

  /** Send a message to every connected client. */
  broadcast(msg: ServerMessage): void {
    const payload = JSON.stringify(msg)
    for (const ws of this.connections) {
      try {
        ws.send(payload)
      } catch {
        // Connection may have dropped between iteration start and send.
        this.connections.delete(ws)
      }
    }
  }

  /** Send a message to a single client. */
  private sendTo(
    ws: { send(data: string): void },
    msg: ServerMessage,
  ): void {
    try {
      ws.send(JSON.stringify(msg))
    } catch {
      // swallow — the close handler will clean up
    }
  }

  // -----------------------------------------------------------------------
  // Client message handling
  // -----------------------------------------------------------------------

  async handleClientMessage(
    ws: { send(data: string): void; data: WSData },
    raw: string,
  ): Promise<void> {
    let parsed: ClientMessage
    try {
      parsed = JSON.parse(raw) as ClientMessage
    } catch {
      this.sendTo(ws, { type: 'error', message: 'Invalid JSON' })
      return
    }

    switch (parsed.type) {
      case 'message':
        await this.handleUserMessage(ws, parsed.content)
        break

      case 'cancel':
        this.handleCancel()
        break

      case 'permission_response':
        this.handlePermissionResponse(ws, parsed.allowed)
        break

      default:
        this.sendTo(ws, {
          type: 'error',
          message: `Unknown message type: ${(parsed as { type: string }).type}`,
        })
    }
  }

  // -----------------------------------------------------------------------
  // Internal handlers
  // -----------------------------------------------------------------------

  private async handleUserMessage(
    ws: { send(data: string): void; data: WSData },
    content: string,
  ): Promise<void> {
    if (this.generating) {
      this.sendTo(ws, {
        type: 'error',
        message: 'A generation is already in progress. Send "cancel" first.',
      })
      return
    }

    if (!content.trim()) {
      this.sendTo(ws, { type: 'error', message: 'Empty message' })
      return
    }

    this.generating = true
    this.activeAbort = new AbortController()

    const startTime = Date.now()

    try {
      const reply = await this.onMessage(content)

      // If the generation was cancelled mid-flight, don't send done.
      if (this.activeAbort?.signal.aborted) {
        return
      }

      // If reply is null, the engine handled all streaming directly
      // (emitted tokens + done via bridge methods). Skip our own emit.
      if (reply !== null) {
        if (reply) {
          this.broadcast({ type: 'token', content: reply })
        }
        this.broadcast({
          type: 'done',
          usage: { input_tokens: 0, output_tokens: 0, cost_usd: 0 },
        })
      }
    } catch (err: unknown) {
      if (this.activeAbort?.signal.aborted) {
        // Cancelled — swallow
        return
      }
      const message =
        err instanceof Error ? err.message : 'Unknown error during generation'
      this.broadcast({ type: 'error', message })
    } finally {
      this.generating = false
      this.activeAbort = null
    }
  }

  private handleCancel(): void {
    if (this.activeAbort) {
      this.activeAbort.abort()
      this.activeAbort = null
      this.generating = false
      this.broadcast({
        type: 'error',
        message: 'Generation cancelled by user',
      })
    }
  }

  private handlePermissionResponse(
    ws: { send(data: string): void; data: WSData },
    allowed: boolean,
  ): void {
    const resolver = this.permissionResolvers.get(ws.data.id)
    if (resolver) {
      resolver(allowed)
      this.permissionResolvers.delete(ws.data.id)
    }
  }

  // -----------------------------------------------------------------------
  // Public helpers for the QueryEngine integration layer
  // -----------------------------------------------------------------------

  /** Emit a streaming token to all clients. */
  emitToken(content: string): void {
    this.broadcast({ type: 'token', content })
  }

  /** Emit a tool-use notification to all clients. */
  emitToolUse(id: string, tool: string, input: Record<string, unknown>): void {
    this.broadcast({ type: 'tool_use', id, tool, input })
  }

  /** Emit a tool-result notification to all clients. */
  emitToolResult(id: string, tool: string, output: string): void {
    this.broadcast({ type: 'tool_result', id, tool, output })
  }

  /** Get the first connected WebSocket client (for permission requests). */
  getFirstConnection(): { send(data: string): void; data: WSData } | null {
    const first = this.connections.values().next()
    return first.done ? null : first.value
  }

  /** Emit completion with usage stats. */
  emitDone(usage: {
    input_tokens: number
    output_tokens: number
    cost_usd: number
  }): void {
    this.broadcast({ type: 'done', usage })
  }

  /** Emit an error to all clients. */
  emitError(message: string): void {
    this.broadcast({ type: 'error', message })
  }

  /**
   * Request permission from the client and wait for a response.
   * Resolves with the client's decision (true = allowed).
   * Times out after 60 seconds, defaulting to denied.
   */
  requestPermission(
    ws: { send(data: string): void; data: WSData },
    tool: string,
    input: Record<string, unknown>,
  ): Promise<boolean> {
    this.sendTo(ws, { type: 'permission_request', tool, input })

    return new Promise<boolean>((resolve) => {
      const timeout = setTimeout(() => {
        this.permissionResolvers.delete(ws.data.id)
        resolve(false)
      }, 60_000)

      this.permissionResolvers.set(ws.data.id, (allowed: boolean) => {
        clearTimeout(timeout)
        resolve(allowed)
      })
    })
  }

  /** Whether a generation is currently active. */
  get isGenerating(): boolean {
    return this.generating
  }

  /** Get the abort signal for the current generation (if any). */
  get abortSignal(): AbortSignal | undefined {
    return this.activeAbort?.signal
  }
}
