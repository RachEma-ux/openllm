/**
 * Node.js-compatible web server for OpenLLM.
 * Used on platforms where Bun is unavailable (e.g., Android/Termux).
 *
 * Serves the static UI + WebSocket bridge to the headless QueryEngine.
 *
 * Launch: npx tsx --import ./src/web/bun-shim.ts src/web/node-server.ts
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'http'
import { readFileSync, existsSync } from 'fs'
import { join, extname, resolve } from 'path'
import { WebSocketServer, WebSocket } from 'ws'

const PUBLIC_DIR = resolve(import.meta.dirname || __dirname, 'public')
const PORT = parseInt(process.env.OPENLLM_WEB_PORT || '5000', 10)

const MIME: Record<string, string> = {
  '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.ico': 'image/x-icon', '.txt': 'text/plain',
}

// ── Static file server ──
function serveStatic(req: IncomingMessage, res: ServerResponse): boolean {
  let pathname = new URL(req.url || '/', `http://localhost`).pathname
  if (pathname === '/') pathname = '/index.html'

  const filePath = join(PUBLIC_DIR, pathname.replace(/\.\./g, ''))
  if (!filePath.startsWith(PUBLIC_DIR) || !existsSync(filePath)) return false

  const ext = extname(filePath).toLowerCase()
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' })
  res.end(readFileSync(filePath))
  return true
}

// ── API routes ──
function handleAPI(req: IncomingMessage, res: ServerResponse): boolean {
  const url = new URL(req.url || '/', `http://localhost`).pathname

  if (url === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ status: 'ok', version: '1.0.0', provider: process.env.OPENLLM_PROVIDER || 'ollama' }))
    return true
  }
  if (url === '/api/config') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({
      provider: { name: process.env.OPENLLM_PROVIDER || 'ollama', model: process.env.OPENAI_MODEL || 'default', baseUrl: process.env.OPENAI_BASE_URL || '' },
    }))
    return true
  }
  if (url === '/api/sessions') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end('[]')
    return true
  }
  return false
}

// ── LLM Provider (direct Ollama/OpenAI-compatible call) ──
const LLM_BASE = process.env.OPENAI_BASE_URL || 'http://localhost:11434/v1'
const LLM_KEY = process.env.OPENAI_API_KEY || 'ollama'
const LLM_MODEL = process.env.OPENAI_MODEL || 'tinyllama'
const messages: Array<{role: string, content: string}> = []

async function streamLLM(prompt: string, broadcast: (msg: any) => void): Promise<void> {
  messages.push({ role: 'user', content: prompt })
  const usage = { input_tokens: 0, output_tokens: 0, cost_usd: 0 }
  let fullReply = ''

  try {
    const res = await fetch(`${LLM_BASE}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${LLM_KEY}` },
      body: JSON.stringify({ model: LLM_MODEL, messages, stream: true }),
    })

    if (!res.ok) {
      const err = await res.text()
      broadcast({ type: 'error', message: `LLM error ${res.status}: ${err.slice(0, 200)}` })
      broadcast({ type: 'done', usage })
      return
    }

    const reader = res.body?.getReader()
    if (!reader) { broadcast({ type: 'error', message: 'No response stream' }); return }

    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })

      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        const data = line.slice(6).trim()
        if (data === '[DONE]') continue

        try {
          const chunk = JSON.parse(data)
          const delta = chunk.choices?.[0]?.delta
          if (delta?.content) {
            broadcast({ type: 'token', content: delta.content })
            fullReply += delta.content
          }
          if (chunk.usage) {
            usage.input_tokens = chunk.usage.prompt_tokens || 0
            usage.output_tokens = chunk.usage.completion_tokens || 0
          }
        } catch {}
      }
    }

    messages.push({ role: 'assistant', content: fullReply })
  } catch (e: any) {
    broadcast({ type: 'error', message: `Connection failed: ${e.message}` })
  }

  broadcast({ type: 'done', usage })
}

// ── Main ──
async function main() {
  console.log(`[openllm] LLM: ${LLM_BASE} model=${LLM_MODEL}`)

  const server = createServer((req, res) => {
    if (handleAPI(req, res)) return
    if (serveStatic(req, res)) return
    res.writeHead(404, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Not found' }))
  })

  // WebSocket
  const wss = new WebSocketServer({ server, path: '/ws' })
  const clients = new Set<WebSocket>()

  function broadcast(msg: any) {
    const data = JSON.stringify(msg)
    for (const ws of clients) {
      try { ws.send(data) } catch { clients.delete(ws) }
    }
  }

  wss.on('connection', (ws) => {
    clients.add(ws)
    console.log(`[ws] Connected (${clients.size} total)`)

    ws.on('message', async (raw) => {
      try {
        const msg = JSON.parse(raw.toString())
        if (msg.type === 'message' && msg.content) {
          await streamLLM(msg.content, broadcast)
        }
      } catch (e: any) {
        try { ws.send(JSON.stringify({ type: 'error', message: e.message })) } catch {}
      }
    })

    ws.on('close', () => {
      clients.delete(ws)
      console.log(`[ws] Disconnected (${clients.size} remaining)`)
    })
  })

  server.listen(PORT, '127.0.0.1', () => {
    console.log(`\x1b[36m[openllm] Server running on http://127.0.0.1:${PORT}/\x1b[0m`)
    console.log(`[openllm] WebSocket: ws://127.0.0.1:${PORT}/ws`)
    console.log(`[openllm] Engine: streaming via ${LLM_BASE} (${LLM_MODEL})`)
  })
}

main().catch(console.error)
