# OpenLLM — Skills & Tools Reference

## Core Tools (Always Available)

| # | Tool | Description |
|---|------|-------------|
| 1 | **Bash** | Execute shell commands in the local environment |
| 2 | **Read** | Read a file from the local filesystem |
| 3 | **Write** | Write/create a file to the local filesystem |
| 4 | **Edit** | Modify existing files with diff-based replacements |
| 5 | **Glob** | Fast file pattern matching (e.g. `**/*.ts`) |
| 6 | **Grep** | Search file contents using ripgrep regex |
| 7 | **WebSearch** | Search the internet for current information |
| 8 | **WebFetch** | Fetch and analyze content from a URL |
| 9 | **Agent** | Launch a new sub-agent for parallel/complex tasks |
| 10 | **SendMessage** | Send a message to another running agent |
| 11 | **TeamCreate** | Create a team for coordinating multiple agents |
| 12 | **TeamDelete** | Clean up a team when the swarm is complete |
| 13 | **TaskCreate** | Create a new task in the task list |
| 14 | **TaskList** | List all tasks |
| 15 | **TaskGet** | Get a task by ID |
| 16 | **TaskUpdate** | Update a task's status or content |
| 17 | **TaskStop** | Stop a running background task |
| 18 | **TaskOutput** | Access the output file of a task |
| 19 | **AskUserQuestion** | Ask the user multiple choice questions |
| 20 | **NotebookEdit** | Edit cells in a Jupyter notebook |
| 21 | **EnterPlanMode** | Enter plan mode for complex multi-step tasks |
| 22 | **ExitPlanMode** | Exit plan mode and proceed with execution |
| 23 | **EnterWorktree** | Create an isolated git worktree for safe changes |
| 24 | **ExitWorktree** | Exit worktree and restore original directory |
| 25 | **LSP** | Language Server Protocol — code intelligence (go-to-def, references) |
| 26 | **ListMcpResources** | List available resources from MCP servers |
| 27 | **ReadMcpResource** | Read a specific resource from an MCP server |
| 28 | **ToolSearch** | Search for deferred/lazy-loaded tools by keyword |
| 29 | **Config** | Get or set Claude Code / OpenLLM configuration |
| 30 | **Skill** | Invoke a slash command or skill |
| 31 | **Brief** | Send a message/status update to the user |
| 32 | **RemoteTrigger** | Manage scheduled remote agents via API |
| 33 | **CronCreate** | Create a cron-scheduled recurring task |
| 34 | **CronDelete** | Delete a cron-scheduled task |
| 35 | **CronList** | List all cron-scheduled tasks |
| 36 | **SyntheticOutputTool** | Return structured output in a requested format |

## Feature-Gated Tools (When Enabled)

| # | Tool | Description |
|---|------|-------------|
| 37 | **PowerShell** | Execute PowerShell commands (Windows) |
| 38 | **REPL** | Run code in an interactive REPL environment |
| 39 | **WebBrowserTool** | Web browser automation |
| 40 | **Sleep** | Pause execution for a duration |
| 41 | **Monitor** | Monitor tool for background observation |
| 42 | **PushNotification** | Send push notifications to the user |
| 43 | **SendUserFile** | Send a file to the user |
| 44 | **SubscribePR** | Subscribe to GitHub PR webhooks |
| 45 | **TerminalCaptureTool** | Capture terminal output |
| 46 | **SnipTool** | Snip/compact conversation history |
| 47 | **ListPeersTool** | List peer agents in a swarm |
| 48 | **WorkflowTool** | Execute workflow scripts |
| 49 | **VerifyPlanExecution** | Verify plan was executed correctly |
| 50 | **SuggestBackgroundPR** | Suggest background PR changes |
| 51 | **CtxInspectTool** | Inspect context window state |

## Slash Commands (~40)

| Command | Description |
|---------|-------------|
| `/add-dir` | Add a directory to working directories |
| `/agents` | Manage agents |
| `/branch` | Create/manage git branches |
| `/clear` | Clear caches and state |
| `/compact` | Compact the session to free context |
| `/config` | Configure settings |
| `/context` | Show context information |
| `/copy` | Copy content to clipboard |
| `/cost` | Show API costs and token usage |
| `/diff` | Show file differences |
| `/doctor` | Diagnose environment issues |
| `/exit` | Exit the session |
| `/fast` | Toggle fast mode |
| `/files` | Manage files |
| `/help` | Show help information |
| `/ide` | IDE integration commands |
| `/init` | Initialize configuration |
| `/keybindings` | Configure keyboard shortcuts |
| `/memory` | Manage persistent memory |
| `/model` | Switch or manage AI models |
| `/mcp` | Manage MCP servers |
| `/onboard-github` | GitHub Models setup and authentication |
| `/permissions` | Manage tool permissions |
| `/plan` | Enter/manage plan mode |
| `/plugin` | Manage plugins |
| `/pr-comments` | Show PR comments |
| `/provider` | Configure AI provider (OpenAI, Ollama, Gemini, etc.) |
| `/reload-plugins` | Reload installed plugins |
| `/rename` | Rename items |
| `/resume` | Resume previous sessions |
| `/review` | Code review |
| `/session` | Manage sessions |
| `/skills` | Manage skills |
| `/status` | Show status information |
| `/tasks` | Manage task list |
| `/theme` | Manage color theme |
| `/usage` | Show usage statistics |
| `/vim` | Toggle vim mode |

## MCP (Model Context Protocol)

OpenLLM supports dynamically loaded tools from configured MCP servers. These are added at runtime based on:
- MCP server connections in settings
- Available resources and tools from those servers
- Permission rules per server

## Supported Providers

| Provider | Type | API Key Env Var |
|----------|------|----------------|
| Ollama | Local (free) | None needed |
| OpenAI | Cloud | `OPENAI_API_KEY` |
| Anthropic | Cloud | `ANTHROPIC_API_KEY` |
| Google Gemini | Cloud | `GEMINI_API_KEY` |
| DeepSeek | Cloud | `DEEPSEEK_API_KEY` |
| Groq | Cloud (free tier) | `GROQ_API_KEY` |
| Together | Cloud | `TOGETHER_API_KEY` |
| Fireworks | Cloud | `FIREWORKS_API_KEY` |
| Mistral | Cloud | `MISTRAL_API_KEY` |
| OpenRouter | Cloud (200+ models) | `OPENROUTER_API_KEY` |
| GitHub Models | Cloud | `GITHUB_TOKEN` |
| LM Studio | Local (free) | None needed |
| AWS Bedrock | Cloud | AWS credentials |
| Google Vertex | Cloud | GCP credentials |
| Atomic Chat | Local (Apple Silicon) | None needed |

## Summary

- **51 tools** (36 core + 15 feature-gated)
- **~40 slash commands**
- **15 providers** supported
- **MCP** for unlimited extensibility

---

*Generated from OpenLLM codebase analysis — 2026-04-05*
