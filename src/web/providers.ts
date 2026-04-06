/**
 * Provider manifest — single source of truth for the chat relay.
 *
 * This file is the ONLY place that knows about provider IDs, base URLs,
 * env-var names, model lists, and the system-wide default. Both the
 * server (src/web/node-server.ts) and the browser UI
 * (src/web/public/index.html, via the /api/manifest endpoint) read from
 * here.
 *
 * To add a provider: add an entry below. To change the default model:
 * either reorder a provider's `models[]` so the desired model is first,
 * or change DEFAULT_PROVIDER / DEFAULT_MODEL.
 */

export const DEFAULT_PROVIDER = 'openai'
export const DEFAULT_MODEL = 'gpt-5.4-mini'

export interface ProviderDef {
  id: string
  label: string
  badge: string
  baseUrl: string
  /** Env var the server reads for the API key. `null` for providers
   *  that don't need a key (local Ollama, LM Studio). */
  envVar: string | null
  /** Models offered in the UI dropdown. First entry is this provider's
   *  default model when the user picks the provider. */
  models: string[]
  /** True if this provider needs no API key at all. */
  noKeyNeeded?: boolean
}

export const PROVIDERS: Record<string, ProviderDef> = {
  openai: {
    id: 'openai',
    label: 'OpenAI',
    badge: 'O',
    baseUrl: 'https://api.openai.com/v1',
    envVar: 'OPENAI_API_KEY',
    models: ['gpt-5.4-mini', 'gpt-5.4', 'gpt-4o', 'gpt-4o-mini', 'gpt-4.1', 'gpt-4.1-mini', 'o3-mini'],
  },
  anthropic: {
    id: 'anthropic',
    label: 'Anthropic',
    badge: 'A',
    baseUrl: 'https://api.anthropic.com/v1',
    envVar: 'ANTHROPIC_API_KEY',
    models: ['claude-sonnet-4-5', 'claude-opus-4', 'claude-haiku-3-5'],
  },
  gemini: {
    id: 'gemini',
    label: 'Google Gemini',
    badge: 'G',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    envVar: 'GEMINI_API_KEY',
    models: ['gemini-2.0-flash', 'gemini-2.5-pro', 'gemini-2.5-flash'],
  },
  alibaba: {
    id: 'alibaba',
    label: 'Alibaba (Qwen)',
    badge: 'Q',
    baseUrl: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
    envVar: 'DASHSCOPE_API_KEY',
    models: ['qwen-plus', 'qwen-max', 'qwen-turbo', 'qwen2.5-72b-instruct', 'qwen2.5-coder-32b-instruct', 'qwq-32b-preview'],
  },
  deepseek: {
    id: 'deepseek',
    label: 'DeepSeek',
    badge: 'D',
    baseUrl: 'https://api.deepseek.com/v1',
    envVar: 'DEEPSEEK_API_KEY',
    models: ['deepseek-chat', 'deepseek-coder', 'deepseek-reasoner'],
  },
  groq: {
    id: 'groq',
    label: 'Groq',
    badge: 'Q',
    baseUrl: 'https://api.groq.com/openai/v1',
    envVar: 'GROQ_API_KEY',
    models: ['llama-3.3-70b-versatile', 'mixtral-8x7b-32768', 'gemma2-9b-it'],
  },
  mistral: {
    id: 'mistral',
    label: 'Mistral',
    badge: 'M',
    baseUrl: 'https://api.mistral.ai/v1',
    envVar: 'MISTRAL_API_KEY',
    models: ['mistral-large-latest', 'mistral-small-latest', 'codestral-latest'],
  },
  together: {
    id: 'together',
    label: 'Together',
    badge: 'T',
    baseUrl: 'https://api.together.xyz/v1',
    envVar: 'TOGETHER_API_KEY',
    models: ['meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo', 'mistralai/Mixtral-8x22B-Instruct-v0.1'],
  },
  fireworks: {
    id: 'fireworks',
    label: 'Fireworks',
    badge: 'F',
    baseUrl: 'https://api.fireworks.ai/inference/v1',
    envVar: 'FIREWORKS_API_KEY',
    models: ['accounts/fireworks/models/llama-v3p1-70b-instruct', 'accounts/fireworks/models/mixtral-8x22b-instruct'],
  },
  openrouter: {
    id: 'openrouter',
    label: 'OpenRouter',
    badge: 'R',
    baseUrl: 'https://openrouter.ai/api/v1',
    envVar: 'OPENROUTER_API_KEY',
    models: ['openai/gpt-4o', 'anthropic/claude-3.5-sonnet', 'meta-llama/llama-3.1-70b-instruct'],
  },
  github: {
    id: 'github',
    label: 'GitHub Models',
    badge: 'H',
    baseUrl: 'https://models.inference.ai.azure.com',
    envVar: 'GITHUB_TOKEN',
    models: ['openai/gpt-4o', 'openai/gpt-4.1', 'meta/llama-3-70b'],
  },
  ollama: {
    id: 'ollama',
    label: 'Ollama (local)',
    badge: 'O',
    baseUrl: 'http://localhost:11434/v1',
    envVar: null,
    models: ['llama3.2:3b', 'tinyllama', 'phi3'],
    noKeyNeeded: true,
  },
  lmstudio: {
    id: 'lmstudio',
    label: 'LM Studio (local)',
    badge: 'L',
    baseUrl: 'http://localhost:1234/v1',
    envVar: null,
    models: ['(auto-detect from LM Studio)'],
    noKeyNeeded: true,
  },
}
