/**
 * Headless QueryEngine — bridges WebSocket to the real LLM backend.
 *
 * This module extracts QueryEngine from the terminal UI so it can run
 * headlessly behind the web server. No React, no Ink, no REPL.
 *
 * Usage:
 *   await initEngine()
 *   const handler = createMessageHandler()
 *   startWebServer({ port, onMessage: handler.onMessage, onBridgeReady: handler.onBridgeReady })
 */

import type { WebSocketBridge } from './ws-bridge.js'

// ---------------------------------------------------------------------------
// Module state (initialized once, reused across requests)
// ---------------------------------------------------------------------------

let initialized = false
let engine: any = null // QueryEngine instance
let appStateStore: any = null

// ---------------------------------------------------------------------------
// One-time initialization
// ---------------------------------------------------------------------------

/**
 * Initialize the engine: load configs, auth, network, tools.
 * Safe to call multiple times (memoized).
 */
export async function initEngine(): Promise<void> {
  if (initialized) return

  // Phase 1: Global config + auth + network (same as CLI startup)
  try {
    const { enableConfigs } = await import('../utils/config.js')
    enableConfigs()
  } catch (e) {
    console.warn('[headless] enableConfigs failed:', e)
  }

  try {
    const { applySafeConfigEnvironmentVariables } = await import(
      '../utils/managedEnv.js'
    )
    applySafeConfigEnvironmentVariables()
  } catch (e) {
    console.warn('[headless] applySafeConfigEnvironmentVariables failed:', e)
  }

  // Hydrate provider credentials from secure storage
  try {
    const { hydrateGeminiAccessTokenFromSecureStorage } = await import(
      '../utils/geminiCredentials.js'
    )
    hydrateGeminiAccessTokenFromSecureStorage()
  } catch {}

  try {
    const { hydrateGithubModelsTokenFromSecureStorage } = await import(
      '../utils/githubModelsCredentials.js'
    )
    hydrateGithubModelsTokenFromSecureStorage()
  } catch {}

  // Provider profile (saved env vars)
  try {
    const {
      buildStartupEnvFromProfile,
      applyProfileEnvToProcessEnv,
    } = await import('../utils/providerProfile.js')
    const { getProviderValidationError } = await import(
      '../utils/providerValidation.js'
    )
    const startupEnv = await buildStartupEnvFromProfile({
      processEnv: process.env,
    })
    if (startupEnv !== process.env) {
      const err = await getProviderValidationError(startupEnv)
      if (!err) applyProfileEnvToProcessEnv(process.env, startupEnv)
    }
  } catch (e) {
    console.warn('[headless] provider profile load failed:', e)
  }

  initialized = true
  console.log('[headless] Engine initialized')
}

// ---------------------------------------------------------------------------
// Create the message handler that wires bridge <-> QueryEngine
// ---------------------------------------------------------------------------

export function createMessageHandler(): {
  onMessage: (msg: string) => Promise<string | null>
  onBridgeReady: (bridge: WebSocketBridge) => void
} {
  let bridge: WebSocketBridge | null = null

  return {
    onBridgeReady(b: WebSocketBridge) {
      bridge = b
      console.log('[headless] Bridge connected')
    },

    async onMessage(msg: string): Promise<string | null> {
      if (!bridge) {
        return `Error: bridge not initialized`
      }

      try {
        return await handleMessage(msg, bridge)
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : 'Unknown engine error'
        bridge.emitError(message)
        return null
      }
    },
  }
}

// ---------------------------------------------------------------------------
// Core message handler: prompt -> QueryEngine -> bridge streaming
// ---------------------------------------------------------------------------

async function handleMessage(
  prompt: string,
  bridge: WebSocketBridge,
): Promise<string | null> {
  // Lazy-load QueryEngine on first message (avoids import cost at startup)
  if (!engine) {
    engine = await createEngine(bridge)
  }

  let finalText = ''
  let totalUsage = { input_tokens: 0, output_tokens: 0, cost_usd: 0 }

  try {
    const generator = engine.submitMessage(prompt)

    for await (const msg of generator) {
      // Check abort
      if (bridge.abortSignal?.aborted) break

      switch (msg.type) {
        case 'assistant': {
          // Assistant message contains content blocks
          const content = msg.message?.content
          if (!Array.isArray(content)) break
          for (const block of content) {
            if (block.type === 'text' && block.text) {
              bridge.emitToken(block.text)
              finalText += block.text
            } else if (block.type === 'tool_use') {
              bridge.emitToolUse(
                block.id || 'tool_' + Date.now(),
                block.name || 'unknown',
                (block.input as Record<string, unknown>) || {},
              )
            }
          }
          // Capture usage
          if (msg.message?.usage) {
            totalUsage.input_tokens += msg.message.usage.input_tokens || 0
            totalUsage.output_tokens += msg.message.usage.output_tokens || 0
          }
          break
        }

        case 'user': {
          // User messages with tool_result blocks
          const content = msg.message?.content
          if (!Array.isArray(content)) break
          for (const block of content) {
            if (block.type === 'tool_result') {
              const output =
                typeof block.content === 'string'
                  ? block.content
                  : Array.isArray(block.content)
                    ? block.content
                        .filter((c: any) => c.type === 'text')
                        .map((c: any) => c.text)
                        .join('\n')
                    : JSON.stringify(block.content)
              bridge.emitToolResult(
                block.tool_use_id || 'unknown',
                'tool',
                output.slice(0, 5000), // cap output size
              )
            }
          }
          break
        }

        case 'result': {
          // Final result with usage/cost
          if (msg.usage) {
            totalUsage.input_tokens = msg.usage.input_tokens || totalUsage.input_tokens
            totalUsage.output_tokens = msg.usage.output_tokens || totalUsage.output_tokens
          }
          if (msg.total_cost_usd != null) {
            totalUsage.cost_usd = msg.total_cost_usd
          }
          if (msg.result) {
            finalText = msg.result
          }
          break
        }

        case 'system': {
          // System messages: retries, errors, etc.
          if (msg.subtype === 'api_error' || msg.subtype === 'error') {
            bridge.emitError(msg.error || msg.message || 'API error')
          }
          break
        }

        default:
          // Ignore other message types (progress, compact_boundary, etc.)
          break
      }
    }
  } catch (err: unknown) {
    if (!bridge.abortSignal?.aborted) {
      const message =
        err instanceof Error ? err.message : 'Generation failed'
      bridge.emitError(message)
    }
  }

  // Emit done with real usage
  bridge.emitDone(totalUsage)
  return null // signal bridge: we handled all streaming
}

// ---------------------------------------------------------------------------
// QueryEngine factory (lazy, one instance per server)
// ---------------------------------------------------------------------------

async function createEngine(bridge: WebSocketBridge): Promise<any> {
  const { QueryEngine } = await import('../QueryEngine.js')
  const { getTools } = await import('../tools.js')
  const { getDefaultAppState } = await import('../state/AppStateStore.js')
  const { createStore } = await import('../state/store.js')

  // Minimal AppState — no React, no Ink
  const store = createStore(getDefaultAppState())
  appStateStore = store

  const getAppState = () => store.getState()
  const setAppState = (f: (prev: any) => any) => store.setState(f)

  // Load tools
  const tools = getTools(getAppState().toolPermissionContext)

  // Permission callback — auto-allow for now, with bridge permission for risky ops
  const canUseTool = async (
    _tool: any,
    input: any,
    _context: any,
    _assistantMsg: any,
    _toolUseId: any,
    forceDecision: any,
  ) => {
    if (forceDecision) return forceDecision

    // For web mode: auto-allow read-only tools, ask for write tools
    const toolName = _tool?.name || ''
    const readOnlyTools = [
      'Read', 'Glob', 'Grep', 'WebSearch', 'WebFetch',
      'LS', 'FileRead', 'GlobTool', 'GrepTool',
    ]

    if (readOnlyTools.some((t) => toolName.includes(t))) {
      return { behavior: 'allow' as const, updatedInput: input }
    }

    // Ask the browser user for write operations
    const ws = bridge.getFirstConnection()
    if (ws) {
      const id = 'perm_' + Date.now()
      const allowed = await bridge.requestPermission(ws, toolName, input as Record<string, unknown>)
      if (allowed) {
        return { behavior: 'allow' as const, updatedInput: input }
      }
      return { behavior: 'deny' as const, reason: 'User denied via web UI' }
    }

    // No browser connected — deny write ops
    return { behavior: 'deny' as const, reason: 'No browser client connected' }
  }

  // File cache
  let readFileCache: any = {}
  try {
    const { createFileStateCacheWithSizeLimit, READ_FILE_STATE_CACHE_SIZE } =
      await import('../utils/fileStateCache.js')
    readFileCache = createFileStateCacheWithSizeLimit(READ_FILE_STATE_CACHE_SIZE)
  } catch {
    readFileCache = { get: () => undefined, set: () => {}, delete: () => {} }
  }

  const cwd = process.cwd()

  const config = {
    cwd,
    tools,
    commands: [],
    mcpClients: [],
    agents: [],
    canUseTool,
    getAppState,
    setAppState,
    readFileCache,
    verbose: false,
    maxTurns: 20,
  }

  console.log(`[headless] QueryEngine created (cwd: ${cwd}, tools: ${tools.length})`)
  return new QueryEngine(config)
}
