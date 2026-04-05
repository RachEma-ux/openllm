/**
 * OpenLLM Web Server
 *
 * Bun.serve()-based HTTP + WebSocket server that bridges the browser
 * UI to the OpenLLM QueryEngine backend.
 *
 * Endpoints:
 *   GET  /              → serves index.html from src/web/public/
 *   GET  /api/health    → {"status":"ok","version":"...","provider":"..."}
 *   GET  /api/config    → current provider / model info
 *   GET  /api/sessions  → session list (stub)
 *   WS   /ws            → WebSocket bridge to QueryEngine
 *   GET  /*             → static file serving from src/web/public/
 */

import { existsSync, readFileSync } from 'fs'
import { join, extname, resolve } from 'path'
import { WebSocketBridge, type WSData } from './ws-bridge.js'
import type {
  ProviderInfo,
  SessionInfo,
  WebServerOptions,
} from './types.js'

// ---------------------------------------------------------------------------
// MIME map for static file serving
// ---------------------------------------------------------------------------

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.map': 'application/json',
  '.wasm': 'application/wasm',
  '.txt': 'text/plain; charset=utf-8',
}

function getMimeType(filePath: string): string {
  const ext = extname(filePath).toLowerCase()
  return MIME_TYPES[ext] ?? 'application/octet-stream'
}

// ---------------------------------------------------------------------------
// Version / provider detection helpers
// ---------------------------------------------------------------------------

let cachedVersion: string | null = null

function getVersion(): string {
  if (cachedVersion) return cachedVersion
  try {
    const pkgPath = resolve(import.meta.dir, '../../package.json')
    const pkg = JSON.parse(
      readFileSync(pkgPath, 'utf-8'),
    ) as { version?: string }
    cachedVersion = pkg.version ?? '0.0.0'
  } catch {
    cachedVersion = '0.0.0'
  }
  return cachedVersion!
}

function getProviderInfo(): ProviderInfo {
  // Read from env vars that the provider profile system sets
  return {
    name: process.env.OPENLLM_PROVIDER ?? process.env.CLAUDE_CODE_PROVIDER ?? 'unknown',
    model: process.env.OPENLLM_MODEL ?? process.env.CLAUDE_CODE_MODEL ?? 'unknown',
    baseUrl: process.env.OPENLLM_BASE_URL ?? process.env.CLAUDE_CODE_BASE_URL ?? '',
  }
}

// ---------------------------------------------------------------------------
// JSON response helper
// ---------------------------------------------------------------------------

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  })
}

// ---------------------------------------------------------------------------
// Static file resolution
// ---------------------------------------------------------------------------

/** Resolve the public directory (src/web/public relative to this file). */
const PUBLIC_DIR = resolve(import.meta.dir, 'public')

function serveStaticFile(pathname: string): Response | null {
  // Prevent path traversal
  const safePath = pathname.replace(/\.\./g, '').replace(/\/+/g, '/')
  const filePath = join(PUBLIC_DIR, safePath)

  // Ensure the resolved path is still within PUBLIC_DIR
  if (!filePath.startsWith(PUBLIC_DIR)) {
    return null
  }

  const file = Bun.file(filePath)
  // Bun.file() doesn't throw on missing files; check existence
  if (!existsSync(filePath)) {
    return null
  }

  return new Response(file, {
    headers: {
      'Content-Type': getMimeType(filePath),
      'Cache-Control': 'public, max-age=3600',
    },
  })
}

// ---------------------------------------------------------------------------
// Connection ID generator
// ---------------------------------------------------------------------------

let nextConnectionId = 0

function generateConnectionId(): string {
  return `ws-${Date.now()}-${++nextConnectionId}`
}

// ---------------------------------------------------------------------------
// Server entry point
// ---------------------------------------------------------------------------

/**
 * Start the OpenLLM web server.
 *
 * @param options.port    - TCP port (default: env OPENLLM_WEB_PORT or 3000)
 * @param options.onMessage - Callback that receives user messages and returns
 *                            the assistant reply. This is the integration
 *                            point with the QueryEngine.
 */
export async function startWebServer(
  options: WebServerOptions,
): Promise<void> {
  const port =
    options.port ??
    (process.env.OPENLLM_WEB_PORT
      ? parseInt(process.env.OPENLLM_WEB_PORT, 10)
      : 3000)

  const bridge = new WebSocketBridge(options.onMessage)

  const server = Bun.serve<WSData>({
    port,

    // -------------------------------------------------------------------
    // HTTP fetch handler (also handles WebSocket upgrade)
    // -------------------------------------------------------------------
    fetch(req, server) {
      const url = new URL(req.url)
      const pathname = url.pathname

      // -- WebSocket upgrade ------------------------------------------
      if (pathname === '/ws') {
        const wsData: WSData = {
          id: generateConnectionId(),
          connectedAt: Date.now(),
        }
        const upgraded = server.upgrade(req, { data: wsData })
        if (upgraded) {
          return undefined as unknown as Response
        }
        return new Response('WebSocket upgrade failed', { status: 400 })
      }

      // -- API routes -------------------------------------------------
      if (pathname === '/api/health') {
        const provider = getProviderInfo()
        return jsonResponse({
          status: 'ok',
          version: getVersion(),
          provider: provider.name,
        })
      }

      if (pathname === '/api/config') {
        return jsonResponse({
          provider: getProviderInfo(),
          model: getProviderInfo().model,
          version: getVersion(),
        })
      }

      if (pathname === '/api/sessions') {
        // Stub: return empty array for now
        const sessions: SessionInfo[] = []
        return jsonResponse(sessions)
      }

      // -- Static file serving ----------------------------------------

      // Root serves index.html
      if (pathname === '/' || pathname === '/index.html') {
        const indexResponse = serveStaticFile('index.html')
        if (indexResponse) return indexResponse
        // Fallback: return a minimal "no UI yet" page
        return new Response(
          [
            '<!DOCTYPE html>',
            '<html><head><meta charset="utf-8"><title>OpenLLM</title></head>',
            '<body style="background:#111;color:#eee;font-family:system-ui;',
            'display:flex;align-items:center;justify-content:center;height:100vh">',
            '<div style="text-align:center">',
            '<h1>OpenLLM</h1>',
            '<p>Web UI not installed yet. Place files in <code>src/web/public/</code>.</p>',
            '<p style="color:#888">WebSocket endpoint available at <code>/ws</code></p>',
            '</div></body></html>',
          ].join('\n'),
          {
            headers: { 'Content-Type': 'text/html; charset=utf-8' },
          },
        )
      }

      // Try serving the requested path as a static file
      const staticResponse = serveStaticFile(pathname)
      if (staticResponse) return staticResponse

      // 404
      return jsonResponse({ error: 'Not found', path: pathname }, 404)
    },

    // -------------------------------------------------------------------
    // WebSocket handlers
    // -------------------------------------------------------------------
    websocket: {
      open(ws) {
        bridge.addConnection(ws)
        console.log(
          `[openllm-web] WebSocket connected: ${ws.data.id} (${bridge.connectionCount} total)`,
        )
      },

      async message(ws, msg) {
        const data = typeof msg === 'string' ? msg : new TextDecoder().decode(msg)
        await bridge.handleClientMessage(ws, data)
      },

      close(ws, code, reason) {
        bridge.removeConnection(ws)
        console.log(
          `[openllm-web] WebSocket closed: ${ws.data.id} (code=${code}) (${bridge.connectionCount} remaining)`,
        )
      },
    },
  })

  console.log(
    `[openllm-web] Server listening on http://localhost:${server.port}`,
  )
  console.log(
    `[openllm-web] WebSocket endpoint: ws://localhost:${server.port}/ws`,
  )
  console.log(
    `[openllm-web] Provider: ${getProviderInfo().name} | Model: ${getProviderInfo().model}`,
  )

  // -------------------------------------------------------------------
  // Graceful shutdown
  // -------------------------------------------------------------------
  const shutdown = () => {
    console.log('\n[openllm-web] Shutting down...')
    server.stop(true) // true = close existing connections
    process.exit(0)
  }

  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)

  // Keep the process alive (Bun.serve is non-blocking)
  await new Promise<void>(() => {
    // This promise never resolves — the server runs until SIGINT/SIGTERM
  })
}

/**
 * Convenience: export the bridge class so the QueryEngine integration
 * layer can import it separately for advanced streaming use cases.
 */
export { WebSocketBridge } from './ws-bridge.js'
export type { WSData } from './ws-bridge.js'
export type { WebServerOptions, ProviderInfo, SessionInfo } from './types.js'
