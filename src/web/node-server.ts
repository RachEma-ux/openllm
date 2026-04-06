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

// ── Termux/Android detection ──
const IS_TERMUX = !!(process.env.PREFIX?.includes('com.termux') || process.cwd().includes('/data/data/com.termux'))
if (IS_TERMUX) {
  process.env.TMPDIR = process.env.TMPDIR || '/data/data/com.termux/files/usr/tmp'
  console.log('[openllm] Termux detected — mobile optimizations active')
}

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
async function handleAPI(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const url = new URL(req.url || '/', `http://localhost`).pathname

  if (url === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ status: 'ok', version: '1.0.0', provider: process.env.OPENLLM_PROVIDER || 'ollama' }))
    return true
  }
  if (url === '/api/status') {
    const mem = process.memoryUsage()
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({
      platform: IS_TERMUX ? 'termux' : process.platform,
      arch: process.arch,
      termux: IS_TERMUX,
      node: process.version,
      memory: { rss: Math.round(mem.rss / 1024 / 1024), heap: Math.round(mem.heapUsed / 1024 / 1024) },
      uptime: Math.round(process.uptime()),
      sessions: conversations.size,
      maxHistory: MAX_HISTORY,
    }))
    return true
  }
  if (url === '/api/config') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({
      provider: { name: process.env.OPENLLM_PROVIDER || 'ollama', model: process.env.OPENAI_MODEL || 'default', baseUrl: process.env.OPENAI_BASE_URL || '' },
    }))
    return true
  }
  if (url === '/api/ollama-models') {
    try {
      const ollamaBase = PROVIDER_REGISTRY.ollama.baseUrl.replace(/\/v1$/, '')
      const r = await fetch(`${ollamaBase}/api/tags`)
      if (r.ok) {
        const data = await r.json() as { models?: Array<{name: string}> }
        const names = (data.models || []).map((m: any) => m.name)
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(names))
        return true
      }
    } catch {}
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end('[]')
    return true
  }
  if (url === '/api/ollama-start' && req.method === 'POST') {
    try {
      const { execSync } = await import('child_process')
      execSync('pgrep ollama || nohup ollama serve > /dev/null 2>&1 &', { shell: '/bin/sh' })
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ started: true }))
    } catch {
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ started: false, error: 'Failed to start Ollama' }))
    }
    return true
  }
  if (url === '/api/providers') {
    const available: Record<string, {configured: boolean, defaultModel: string}> = {}
    for (const [name, cfg] of Object.entries(PROVIDER_REGISTRY)) {
      const noKeyNeeded = ['ollama', 'lmstudio', 'atomic-chat'].includes(name)
      available[name] = { configured: noKeyNeeded || !!cfg.apiKey, defaultModel: cfg.defaultModel }
    }
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(available))
    return true
  }
  if (url === '/api/clear') {
    conversations.clear()
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ cleared: true }))
    return true
  }
  if (url === '/api/sessions') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end('[]')
    return true
  }
  return false
}

// ── Provider Registry ──
interface ProviderConfig {
  baseUrl: string
  apiKey: string
  defaultModel: string
}

const PROVIDER_REGISTRY: Record<string, ProviderConfig> = {
  ollama:     { baseUrl: 'http://localhost:11434/v1', apiKey: 'ollama', defaultModel: 'tinyllama' },
  openai:     { baseUrl: 'https://api.openai.com/v1', apiKey: process.env.OPENAI_API_KEY || '', defaultModel: 'gpt-4o' },
  gemini:     { baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', apiKey: process.env.GEMINI_API_KEY || '', defaultModel: 'gemini-2.0-flash' },
  anthropic:  { baseUrl: 'https://api.anthropic.com/v1', apiKey: process.env.ANTHROPIC_API_KEY || '', defaultModel: 'claude-sonnet-4-5-20241022' },
  deepseek:   { baseUrl: 'https://api.deepseek.com/v1', apiKey: process.env.DEEPSEEK_API_KEY || '', defaultModel: 'deepseek-chat' },
  groq:       { baseUrl: 'https://api.groq.com/openai/v1', apiKey: process.env.GROQ_API_KEY || '', defaultModel: 'llama-3.3-70b-versatile' },
  together:   { baseUrl: 'https://api.together.xyz/v1', apiKey: process.env.TOGETHER_API_KEY || '', defaultModel: 'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo' },
  fireworks:  { baseUrl: 'https://api.fireworks.ai/inference/v1', apiKey: process.env.FIREWORKS_API_KEY || '', defaultModel: 'accounts/fireworks/models/llama-v3p1-70b-instruct' },
  mistral:    { baseUrl: 'https://api.mistral.ai/v1', apiKey: process.env.MISTRAL_API_KEY || '', defaultModel: 'mistral-large-latest' },
  lmstudio:   { baseUrl: 'http://localhost:1234/v1', apiKey: 'lm-studio', defaultModel: 'default' },
  openrouter: { baseUrl: 'https://openrouter.ai/api/v1', apiKey: process.env.OPENROUTER_API_KEY || '', defaultModel: 'openai/gpt-4o' },
  codex:      { baseUrl: 'https://api.openai.com/v1', apiKey: process.env.OPENAI_API_KEY || '', defaultModel: 'gpt-4o' },
  github:     { baseUrl: 'https://models.inference.ai.azure.com', apiKey: process.env.GITHUB_TOKEN || '', defaultModel: 'openai/gpt-4o' },
  bedrock:    { baseUrl: process.env.AWS_BEDROCK_URL || 'http://localhost:8000/v1', apiKey: process.env.AWS_ACCESS_KEY_ID || '', defaultModel: 'anthropic.claude-3-5-sonnet-20241022-v2:0' },
  vertex:     { baseUrl: process.env.VERTEX_URL || 'http://localhost:8000/v1', apiKey: process.env.VERTEX_API_KEY || '', defaultModel: 'claude-3-5-sonnet@20241022' },
  'atomic-chat': { baseUrl: 'http://localhost:11434/v1', apiKey: 'local', defaultModel: 'default' },
  alibaba:    { baseUrl: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1', apiKey: process.env.DASHSCOPE_API_KEY || process.env.ALIBABA_API_KEY || '', defaultModel: 'qwen-max' },
}

// Override defaults from env if set
if (process.env.OPENAI_BASE_URL) {
  PROVIDER_REGISTRY.ollama.baseUrl = process.env.OPENAI_BASE_URL
}
if (process.env.OPENAI_MODEL) {
  PROVIDER_REGISTRY.ollama.defaultModel = process.env.OPENAI_MODEL
}

// Per-session conversation history — shorter on mobile to save RAM
const MAX_HISTORY = IS_TERMUX ? 5 : 10
const conversations = new Map<string, Array<{role: string, content: string}>>()

function getConversation(provider: string, model: string) {
  const key = `${provider}:${model}`
  if (!conversations.has(key)) conversations.set(key, [])
  const msgs = conversations.get(key)!
  // Keep only last N messages to prevent slowdown
  if (msgs.length > MAX_HISTORY * 2) msgs.splice(0, msgs.length - MAX_HISTORY * 2)
  return msgs
}

async function streamLLM(prompt: string, provider: string, model: string, broadcast: (msg: any) => void, overrideApiKey?: string): Promise<void> {
  const cfg = PROVIDER_REGISTRY[provider] || PROVIDER_REGISTRY.ollama
  const baseUrl = cfg.baseUrl
  // Client-provided key (from Settings UI) overrides the server env var.
  // If client sends one, use it — otherwise fall back to the env-var key.
  const apiKey = (overrideApiKey && overrideApiKey.trim()) || cfg.apiKey
  const llmModel = model || cfg.defaultModel

  const history = getConversation(provider, llmModel)
  if (history.length === 0) {
    history.push({ role: 'system', content: 'You are a helpful assistant. Keep answers concise — 1-3 sentences unless asked for more detail.' })
  }
  history.push({ role: 'user', content: prompt })
  const messages = history

  const usage = { input_tokens: 0, output_tokens: 0, cost_usd: 0 }
  let fullReply = ''

  if (!apiKey && provider !== 'ollama' && provider !== 'lmstudio' && provider !== 'atomic-chat') {
    broadcast({ type: 'error', message: `No API key for ${provider}. Open Settings → Provider API Keys and paste one.` })
    broadcast({ type: 'done', usage })
    return
  }

  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: llmModel, messages, stream: true,
        // Limit context window for local models — tighter on Termux
        ...(provider === 'ollama' || provider === 'lmstudio' || provider === 'atomic-chat'
          ? { options: { num_ctx: IS_TERMUX ? 1024 : 2048, num_predict: IS_TERMUX ? 128 : 256 } } : {}),
      }),
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
  const defaultCfg = PROVIDER_REGISTRY.ollama
  console.log(`[openllm] Default LLM: ${defaultCfg.baseUrl} model=${defaultCfg.defaultModel}`)
  console.log(`[openllm] Providers: ${Object.keys(PROVIDER_REGISTRY).join(', ')}`)

  const server = createServer(async (req, res) => {
    if (await handleAPI(req, res)) return
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
        if (msg.type === 'clear') {
          conversations.clear()
          broadcast({ type: 'cleared' })
        } else if (msg.type === 'message' && msg.content) {
          const provider = msg.provider || 'ollama'
          const model = msg.model || ''
          // Client may include an apiKey in the WS payload (entered in
          // Settings → Provider API Keys, persisted in localStorage).
          // It takes precedence over any env-var key on the server side.
          const clientApiKey = typeof msg.apiKey === 'string' ? msg.apiKey : ''
          console.log(`[llm] ${provider}/${model || '(default)'} ${clientApiKey ? '(client key)' : '(env key)'}: ${msg.content.slice(0, 60)}...`)
          await streamLLM(msg.content, provider, model, broadcast, clientApiKey)
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

  const HOST = process.env.OPENLLM_HOST || '127.0.0.1'
  server.listen(PORT, HOST, () => {
    console.log(`\x1b[36m[openllm] Server running on http://${HOST}:${PORT}/\x1b[0m`)
    console.log(`[openllm] WebSocket: ws://${HOST}:${PORT}/ws`)
    console.log(`[openllm] Multi-provider routing enabled`)
  })
}

main().catch(console.error)
