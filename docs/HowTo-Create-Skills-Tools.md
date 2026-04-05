# How To: Create New Skills & Tools in OpenLLM

A step-by-step guide from zero to working tool/command.

---

## Table of Contents

1. [Understanding the Architecture](#1-understanding-the-architecture)
2. [The Universal Tool Skeleton](#2-the-universal-tool-skeleton)
3. [Creating a New Tool (Step-by-Step)](#3-creating-a-new-tool)
4. [The 4 Tool Flavors](#4-the-4-tool-flavors)
5. [Creating a New Command (Step-by-Step)](#5-creating-a-new-command)
6. [Creating a Skill (Easiest Method)](#6-creating-a-skill)
7. [Advanced Patterns](#7-advanced-patterns)
8. [Testing](#8-testing)
9. [The Rules (Never Break These)](#9-the-rules)
10. [Common Mistakes](#10-common-mistakes)
11. [Reference](#11-reference)

---

## 1. Understanding the Architecture

### Tools vs Commands vs Skills

```
┌─────────┬────────────────────────────────┬──────────────────┐
│ Type    │ What it does                   │ Who calls it     │
├─────────┼────────────────────────────────┼──────────────────┤
│ Tool    │ LLM decides to call it during  │ The LLM (auto)   │
│         │ a conversation to accomplish   │                  │
│         │ a task (read file, run bash)   │                  │
├─────────┼────────────────────────────────┼──────────────────┤
│ Command │ User types /command to trigger │ The user (manual) │
│         │ an action (switch model, show  │                  │
│         │ cost, compact history)         │                  │
├─────────┼────────────────────────────────┼──────────────────┤
│ Skill   │ A prompt template that expands │ User or LLM      │
│         │ into instructions for the LLM  │                  │
│         │ (code review, commit, etc.)    │                  │
└─────────┴────────────────────────────────┴──────────────────┘
```

### How They Flow

```
User types message
    │
    ├── Starts with "/" ──→ Command system
    │                           │
    │                           ├── local: run code, return text
    │                           ├── local-jsx: show React UI
    │                           └── prompt: expand to LLM instructions
    │
    └── Regular message ──→ QueryEngine
                                │
                                ├── Sends to LLM provider
                                │
                                └── LLM responds with:
                                    ├── Text (displayed to user)
                                    └── tool_use (calls a Tool)
                                         │
                                         ├── Tool executes
                                         ├── Result sent back to LLM
                                         └── LLM continues...
```

### Key Files

```
src/Tool.ts              ← Tool interface + buildTool()
src/tools.ts             ← Tool registry (getAllBaseTools)
src/tools/[Name]/        ← Tool implementations (4 files each)

src/types/command.ts     ← Command interface
src/commands.ts          ← Command registry (COMMANDS)
src/commands/[name]/     ← Command implementations (2 files each)

~/.claude/commands/      ← User-defined skills (markdown)
~/.claude/skills/        ← User-defined skills (directories)
```

---

## 2. The Universal Tool Skeleton

**Every single tool in OpenLLM** (all 44 of them) follows the exact same structure. No exceptions.

### The Formula

```
Every tool = 4 files + 10 sections + 1 registration line
```

### 4 Files (Always)

```
src/tools/MyTool/
├── constants.ts       # §0 — TOOL_NAME export
├── prompt.ts          # §0 — DESCRIPTION + getPrompt()
├── UI.tsx             # §8 — renderToolUseMessage + renderToolResultMessage
└── MyTool.ts          # §1-§10 — buildTool() with the 10 sections
```

### 10 Sections (Always in This Order)

```typescript
export const MyTool = buildTool({
  // §1  IDENTITY        → name, searchHint, maxResultSizeChars
  // §2  METADATA        → description(), prompt(), userFacingName, getToolUseSummary
  // §3  SCHEMAS         → get inputSchema(), get outputSchema()
  // §4  BEHAVIOR FLAGS  → isReadOnly(), isConcurrencySafe(), isEnabled()
  // §5  CLASSIFICATION  → toAutoClassifierInput()
  // §6  PERMISSIONS     → checkPermissions(), preparePermissionMatcher()
  // §7  VALIDATION      → validateInput()
  // §8  RENDERING       → renderToolUseMessage, renderToolResultMessage
  // §9  EXECUTION       → call()
  // §10 RESULT MAP      → mapToolResultToToolResultBlockParam()  ← ALWAYS LAST
} satisfies ToolDef<InputSchema, Output>)
```

### 1 Registration Line

```typescript
// src/tools.ts → getAllBaseTools()
MyTool,
```

### Import Order (100% Consistent)

```typescript
// 1. External (zod, react)
import { z } from 'zod/v4'

// 2. Anthropic SDK types
import type { ToolResultBlockParam } from '@anthropic-ai/sdk/resources/index.mjs'

// 3. Internal Tool framework
import { buildTool, type ToolDef, type ValidationResult } from '../../Tool.js'

// 4. Utilities
import { lazySchema } from '../../utils/lazySchema.js'

// 5. Permissions
import type { PermissionDecision } from '../../utils/permissions/PermissionResult.js'

// 6. Local (constants, prompt, UI)
import { MY_TOOL_NAME } from './constants.js'
import { getDescription, getPrompt } from './prompt.js'
import { renderToolUseMessage, renderToolResultMessage } from './UI.js'
```

### Schema Rules (100% Consistent)

| Schema | Zod Type | Why |
|--------|----------|-----|
| Input | `z.strictObject()` | Rejects unknown fields from LLM |
| Output | `z.object()` | Allows extra fields in output |
| Both | Wrapped in `lazySchema()` | Breaks circular dependencies |
| Access | Via `get` getter | Lazy evaluation on first use |

```typescript
// Input — ALWAYS strictObject
const inputSchema = lazySchema(() =>
  z.strictObject({ ... })
)
type InputSchema = ReturnType<typeof inputSchema>
export type Input = z.infer<InputSchema>

// Output — ALWAYS regular object
const outputSchema = lazySchema(() =>
  z.object({ ... })
)
type OutputSchema = ReturnType<typeof outputSchema>
export type Output = z.infer<OutputSchema>
```

---

## 3. Creating a New Tool

### Example: A "WordCount" tool that counts words in a file

Following the skeleton exactly:

#### File 1: constants.ts

```typescript
// src/tools/WordCountTool/constants.ts

export const WORD_COUNT_TOOL_NAME = 'WordCount'
```

#### File 2: prompt.ts

```typescript
// src/tools/WordCountTool/prompt.ts

export const DESCRIPTION =
  'Count words, lines, and characters in a file or text input'

export function getDescription(): string {
  return DESCRIPTION
}

export function getPrompt(): string {
  return `${DESCRIPTION}

Usage:
- Provide a file_path to count words in a file
- Provide text directly to count words in a string
- Use this tool when the user asks about file size, word count, or statistics

Output includes: word count, line count, character count.
`
}
```

#### File 3: UI.tsx

```typescript
// src/tools/WordCountTool/UI.tsx

import React from 'react'
import type { Input, Output } from './WordCountTool.js'

export function userFacingName(): string {
  return 'Word Count'
}

export function getToolUseSummary(input: Input): string {
  return input.file_path || '(text)'
}

export function renderToolUseMessage(
  input: Input,
  { verbose }: { verbose?: boolean },
): React.ReactNode {
  return (
    <span>
      <span style={{ fontWeight: 'bold' }}>WordCount</span>
      {' '}{input.file_path || '(text input)'}
    </span>
  )
}

export function renderToolResultMessage(
  output: Output,
): React.ReactNode {
  return <span>{output.words} words, {output.lines} lines</span>
}
```

#### File 4: WordCountTool.ts (The 10 Sections)

```typescript
// src/tools/WordCountTool/WordCountTool.ts

// ── Imports (in canonical order) ──
import { z } from 'zod/v4'
import { readFile } from 'fs/promises'
import { buildTool, type ToolDef, type ValidationResult } from '../../Tool.js'
import { lazySchema } from '../../utils/lazySchema.js'
import type { PermissionDecision } from '../../utils/permissions/PermissionResult.js'
import { WORD_COUNT_TOOL_NAME } from './constants.js'
import { getDescription, getPrompt } from './prompt.js'
import {
  renderToolUseMessage,
  renderToolResultMessage,
  getToolUseSummary,
  userFacingName,
} from './UI.js'

// ── Schemas ──
const inputSchema = lazySchema(() =>
  z.strictObject({
    file_path: z.string().optional()
      .describe('Absolute path to file to count'),
    text: z.string().optional()
      .describe('Direct text input to count'),
  }),
)
type InputSchema = ReturnType<typeof inputSchema>
export type Input = z.infer<InputSchema>

const outputSchema = lazySchema(() =>
  z.object({
    words: z.number(),
    lines: z.number(),
    characters: z.number(),
    source: z.string(),
  }),
)
type OutputSchema = ReturnType<typeof outputSchema>
export type Output = z.infer<OutputSchema>

// ── Tool Definition (10 sections) ──
export const WordCountTool = buildTool({

  // §1 IDENTITY
  name: WORD_COUNT_TOOL_NAME,
  searchHint: 'count words lines characters file stats',
  maxResultSizeChars: 1_000,

  // §2 METADATA
  async description() { return getDescription() },
  async prompt() { return getPrompt() },
  userFacingName,
  getToolUseSummary,
  getActivityDescription(input) {
    const s = getToolUseSummary(input)
    return s ? `Counting words in ${s}` : 'Counting words'
  },

  // §3 SCHEMAS
  get inputSchema(): InputSchema { return inputSchema() },
  get outputSchema(): OutputSchema { return outputSchema() },

  // §4 BEHAVIOR FLAGS
  isReadOnly() { return true },
  isConcurrencySafe() { return true },

  // §5 CLASSIFICATION
  toAutoClassifierInput(input) {
    return input.file_path || input.text || ''
  },

  // §6 PERMISSIONS
  async checkPermissions(input, _context): Promise<PermissionDecision> {
    return { behavior: 'allow', updatedInput: input }
  },

  // §7 VALIDATION
  async validateInput(input): Promise<ValidationResult> {
    if (!input.file_path && !input.text) {
      return { result: false, message: 'Provide either file_path or text' }
    }
    return { result: true }
  },

  // §8 RENDERING
  renderToolUseMessage,
  renderToolResultMessage,

  // §9 EXECUTION
  async call(input, context) {
    if (context.abortController.signal.aborted) {
      throw new Error('Cancelled')
    }

    let content: string
    let source: string

    if (input.file_path) {
      content = await readFile(input.file_path, 'utf-8')
      source = input.file_path
    } else {
      content = input.text || ''
      source = 'direct input'
    }

    return {
      data: {
        words: content.trim().split(/\s+/).filter(Boolean).length,
        lines: content.split('\n').length,
        characters: content.length,
        source,
      },
    }
  },

  // §10 RESULT MAP (always last)
  mapToolResultToToolResultBlockParam(output, toolUseID) {
    return {
      tool_use_id: toolUseID,
      type: 'tool_result' as const,
      content: [
        `Source: ${output.source}`,
        `Words: ${output.words}`,
        `Lines: ${output.lines}`,
        `Characters: ${output.characters}`,
      ].join('\n'),
    }
  },
} satisfies ToolDef<InputSchema, Output>)
```

#### Register: tools.ts

```typescript
import { WordCountTool } from './tools/WordCountTool/WordCountTool.js'

export function getAllBaseTools(): Tools {
  return [
    // ... existing tools ...
    WordCountTool,
  ]
}
```

#### Build and test

```bash
bun run build
node dist/cli.mjs
# Ask: "Count the words in package.json"
# The LLM calls WordCount automatically
```

---

## 4. The 4 Tool Flavors

Every tool starts from the same 10-section skeleton, then adds extra sections based on its flavor:

### Flavor 1: READ-ONLY (like GrepTool, GlobTool, FileReadTool)

Adds to the base skeleton:

```typescript
// §4 — extra flags
isReadOnly() { return true },
isConcurrencySafe() { return true },
isSearchOrReadCommand() { return { isSearch: true, isRead: false } },

// §8 — extra rendering
extractSearchText(output) { return output.matches.join('\n') },

// §6 — uses read permission helper
async checkPermissions(input, context) {
  return checkReadPermissionForTool(MyTool, input, context.getAppState().toolPermissionContext)
},
```

### Flavor 2: WRITE (like FileWriteTool, FileEditTool)

Adds to the base skeleton:

```typescript
// §1 — extra identity
strict: true,

// §4 — flags differ
isReadOnly() { return false },
isConcurrencySafe() { return false },
isDestructive(input) { return input.overwrite === true },

// §5 — extra classification
backfillObservableInput(input) { /* normalize paths */ },
getPath(input) { return input.file_path },

// §6 — uses write permission + matcher
async checkPermissions(input, context) {
  return checkWritePermissionForTool(MyTool, input, context.getAppState().toolPermissionContext)
},
async preparePermissionMatcher({ file_path }) {
  return (rulePattern) => matchWildcardPattern(rulePattern, file_path)
},

// §8 — extra rendering
renderToolUseRejectedMessage,
```

### Flavor 3: ASYNC/NETWORK (like WebSearchTool, WebFetchTool)

Adds to the base skeleton:

```typescript
// §1 — extra identity
shouldDefer: true,

// §8 — extra rendering (progress)
renderToolUseProgressMessage,

// §9 — call() uses progress callback
async call(input, context, _canUseTool, _msg, onProgress) {
  onProgress?.({ type: 'status', message: 'Fetching...' })
  const data = await fetch(input.url)
  onProgress?.({ type: 'status', message: 'Processing...' })
  return { data: await process(data) }
},
```

### Flavor 4: AGENT/TASK (like AgentTool, TaskCreateTool, SendMessageTool)

Adds to the base skeleton:

```typescript
// §1 — extra identity
shouldDefer: true,

// §4 — conditional availability
isEnabled() { return someFeatureFlag() },

// §9 — call() modifies app state
async call(input, context) {
  context.setAppState((prev) => ({ ...prev, tasks: [...prev.tasks, newTask] }))
  return { data: result }
},
```

### Quick Decision Guide

```
Does your tool write files?
  YES → Flavor 2 (WRITE)
  NO  → Does it call external APIs/URLs?
          YES → Flavor 3 (ASYNC)
          NO  → Does it manage agents/tasks/state?
                  YES → Flavor 4 (AGENT)
                  NO  → Flavor 1 (READ-ONLY)
```

---

## 5. Creating a New Command

Commands have a simpler structure: **2 files + 1 registration line**.

### Three Command Types

| Type | Use Case | Returns |
|------|----------|---------|
| `local` | Text-only output, no UI | `{ type: 'text', value: string }` |
| `local-jsx` | Interactive UI (React) | React node via `onDone()` callback |
| `prompt` | Expand to LLM prompt | `ContentBlockParam[]` for model context |

### Example: /stats command (type: local)

#### File 1: index.ts (definition)

```typescript
// src/commands/stats/index.ts
import type { Command } from '../../commands.js'

const stats = {
  type: 'local',
  name: 'stats',
  aliases: ['info'],
  description: 'Show project statistics (files, lines, git info)',
  argumentHint: '[path]',
  immediate: true,
  supportsNonInteractive: true,
  load: () => import('./stats.js'),
} satisfies Command

export default stats
```

#### File 2: stats.ts (implementation)

```typescript
// src/commands/stats/stats.ts
import type { LocalCommandCall } from '../../types/command.js'
import { execSync } from 'child_process'

export const call: LocalCommandCall = async (args, context) => {
  const cwd = args.trim() || process.cwd()

  try {
    const fileCount = execSync(
      `find ${cwd} -type f -not -path '*/node_modules/*' -not -path '*/.git/*' | wc -l`,
      { encoding: 'utf-8' },
    ).trim()

    const gitBranch = execSync('git branch --show-current', {
      encoding: 'utf-8', cwd,
    }).trim()

    return {
      type: 'text',
      value: `Project: ${cwd}\nFiles: ${fileCount}\nBranch: ${gitBranch}`,
    }
  } catch (e) {
    return { type: 'text', value: `Error: ${(e as Error).message}` }
  }
}
```

#### Register in commands.ts

```typescript
import stats from './commands/stats/index.js'

const COMMANDS = memoize((): Command[] => [
  // ... existing ...
  stats,
])
```

### Example: /toggle command (type: local-jsx)

```typescript
// src/commands/toggle/index.ts
const toggle = {
  type: 'local-jsx',
  name: 'toggle',
  description: 'Toggle a feature on or off',
  immediate: true,
  load: () => import('./toggle.js'),
} satisfies Command

// src/commands/toggle/toggle.tsx
export const call: LocalJSXCommandCall = async (onDone, context, args) => {
  const feature = args.trim()
  const enabled = !getCurrentState(feature)
  setFeature(feature, enabled)
  onDone(`${feature}: ${enabled ? 'ON' : 'OFF'}`, {
    display: 'user',
    shouldQuery: false,
  })
  return null
}
```

### onDone Options

```typescript
onDone(resultText, {
  display: 'user',        // Show as user message
  display: 'system',      // Show as system message
  display: 'skip',        // Don't display
  shouldQuery: true,      // Send to LLM after
  shouldQuery: false,     // Don't query LLM
  nextInput: '/other-cmd', // Auto-type next command
  submitNextInput: true,  // Auto-submit nextInput
})
```

### Return Types for LOCAL commands

```typescript
{ type: 'text', value: 'Output' }                          // Display text
{ type: 'compact', compactionResult: result }               // Compact history
{ type: 'skip' }                                            // Do nothing
```

---

## 6. Creating a Skill (Easiest Method)

Skills need **no TypeScript, no build step**. Just a markdown file.

### Method 1: Single Markdown File

Create `~/.claude/commands/review-security.md`:

```markdown
---
name: review-security
description: Security audit of the current codebase
---

You are a security expert. Perform a thorough security audit:

1. Read the project structure with Glob and Grep
2. Check for:
   - SQL injection vulnerabilities
   - XSS attack vectors
   - Hardcoded secrets or API keys
   - Insecure file operations
   - Missing input validation
3. For each finding:
   - Severity: Critical / High / Medium / Low
   - File and line number
   - Recommended fix with code example

Focus on: $ARGUMENTS

Output a structured security report.
```

Usage: `/review-security the auth module`

### Method 2: Skill Directory (With Config)

Create `~/.claude/skills/deploy-checker/index.md`:

```markdown
---
name: deploy-checker
description: Pre-deployment checklist and validation
context: fork
agent: general-purpose
allowedTools:
  - Bash
  - Read
  - Grep
  - Glob
---

You are a deployment readiness checker. Run through this checklist:

1. **Build Check**: Run the build command and verify it succeeds
2. **Test Check**: Run tests and verify they pass
3. **Env Check**: Verify all required env vars are documented
4. **Secret Check**: Grep for hardcoded secrets, API keys, passwords
5. **Git Check**: Verify clean working tree, correct branch

For each check, report PASS / FAIL / WARN.
End with a GO / NO-GO deployment recommendation.
```

### Method 3: Prompt Command in Code

```typescript
// src/commands/quick-fix/index.ts
const quickFix = {
  type: 'prompt',
  name: 'quick-fix',
  description: 'Quickly fix a bug described in natural language',
  progressMessage: 'Analyzing and fixing...',
  contentLength: 500,
  source: 'builtin',
  userInvocable: true,
  context: 'fork',
  agent: 'general-purpose',
  allowedTools: ['Read', 'Edit', 'Grep', 'Glob', 'Bash'],

  async getPromptForCommand(args) {
    return [{
      type: 'text',
      text: `Find and fix this bug: ${args}

Steps:
1. Search the codebase for relevant code
2. Identify the root cause
3. Apply the minimal fix
4. Verify the fix doesn't break anything

Only edit what's necessary. Don't refactor.`,
    }]
  },
} satisfies Command
```

### Skill Frontmatter Options

| Field | Values | Effect |
|-------|--------|--------|
| `context` | `inline` | Run in current conversation |
| `context` | `fork` | Run as isolated sub-agent |
| `agent` | `general-purpose` | Agent type for forked context |
| `model` | `sonnet` / `opus` / `haiku` | Override model |
| `allowedTools` | `['Bash', 'Read', ...]` | Restrict available tools |
| `argNames` | `['file', 'mode']` | Named arguments |
| `effort` | `high` / `medium` / `low` | Effort level hint |

---

## 7. Advanced Patterns

### Pattern: Tool With Progress Updates

```typescript
// §9 EXECUTION — use 5th param onProgress
async call(input, context, _canUseTool, _parentMsg, onProgress) {
  onProgress?.({ type: 'status', message: 'Downloading...' })
  const data = await downloadFile(input.url)
  onProgress?.({ type: 'status', message: 'Processing...' })
  const result = await processData(data)
  return { data: result }
},
```

### Pattern: Tool That Injects Messages

```typescript
// §9 EXECUTION — return newMessages
async call(input, context) {
  return {
    data: result,
    newMessages: [{
      role: 'user',
      content: [{ type: 'text', text: 'Additional context...' }],
    }],
  }
},
```

### Pattern: Context Modifier

```typescript
// §9 EXECUTION — modify context for next tool in same turn
async call(input, context) {
  return {
    data: { changed: true },
    contextModifier: (ctx) => ({
      ...ctx,
      readFileState: updatedCache,
    }),
  }
},
```

### Pattern: Feature-Gated Registration

```typescript
// In tools.ts — lazy require + conditional spread
const MyTool = feature('MY_FEATURE_FLAG')
  ? require('./tools/MyTool/MyTool.js').MyTool
  : null

// In getAllBaseTools():
...(MyTool ? [MyTool] : []),
```

### Pattern: Deferred (Lazy-Loaded) Tool

```typescript
// §1 IDENTITY — add shouldDefer
shouldDefer: true,
searchHint: 'keywords that help ToolSearch find this',
```

### Pattern: Semantic Type Coercion

```typescript
import { semanticNumber } from '../../utils/semanticNumber.js'
import { semanticBoolean } from '../../utils/semanticBoolean.js'

// LLM sometimes sends "5" instead of 5, or "true" instead of true
const inputSchema = lazySchema(() =>
  z.strictObject({
    timeout: semanticNumber(z.number().optional()).describe('Timeout in ms'),
    enabled: semanticBoolean(z.boolean().optional()).describe('Enable'),
  }),
)
```

---

## 8. Testing

### Tool Test File

```typescript
// src/tools/WordCountTool/WordCountTool.test.ts

import { describe, test, expect } from 'bun:test'
import { WordCountTool } from './WordCountTool.js'

describe('WordCountTool', () => {
  test('counts words in text', async () => {
    const result = await WordCountTool.call(
      { text: 'hello world foo bar' },
      mockContext(),
      mockCanUseTool,
      mockMessage,
    )
    expect(result.data.words).toBe(4)
    expect(result.data.lines).toBe(1)
  })

  test('validates input — requires file_path or text', async () => {
    const result = await WordCountTool.validateInput?.({})
    expect(result?.result).toBe(false)
  })

  test('schema rejects unknown fields', () => {
    expect(() =>
      WordCountTool.inputSchema.parse({ unknown: true })
    ).toThrow()
  })
})
```

### Run Tests

```bash
bun test src/tools/WordCountTool/
bun test --coverage
```

---

## 9. The Rules (Never Break These)

These rules are 100% consistent across all 44 tools in the codebase:

| # | Rule | Why |
|---|------|-----|
| 1 | Input schema uses `z.strictObject()` | Rejects unknown fields from LLM |
| 2 | Output schema uses `z.object()` | Allows extra fields in output |
| 3 | Both schemas wrapped in `lazySchema()` | Breaks circular dependencies |
| 4 | Schemas accessed via `get` getter | Lazy evaluation |
| 5 | `call()` returns `{ data: Output }` | Always wrapped, never raw |
| 6 | `mapToolResultToToolResultBlockParam` is LAST property | Convention |
| 7 | End with `satisfies ToolDef<InputSchema, Output>` | Type safety |
| 8 | Named export: `export const XTool = buildTool({})` | Never default export |
| 9 | Name constant in `constants.ts`: `UPPER_SNAKE_CASE` | e.g. `BASH_TOOL_NAME` |
| 10 | Import order: zod → anthropic → Tool.js → utils → permissions → local | Convention |
| 11 | 10 sections in canonical order (§1-§10) | Consistency across all tools |
| 12 | 4 files per tool: constants + prompt + UI + main | Separation of concerns |

For commands:
| # | Rule | Why |
|---|------|-----|
| 1 | Definition in `index.ts` with `satisfies Command` | Type safety |
| 2 | Implementation in separate file, lazy-loaded via `load:` | Performance |
| 3 | Default export from `index.ts` | Convention |
| 4 | Registered in `commands.ts` → `COMMANDS()` array | Discovery |

---

## 10. Common Mistakes

### DO

- Follow the 10-section order exactly
- Use `lazySchema()` for all schemas
- Use `z.strictObject()` for input, `z.object()` for output
- Return `{ data: Output }` from `call()`
- Check `context.abortController.signal.aborted` in long operations
- Put `mapToolResultToToolResultBlockParam` last
- Create all 4 files (constants, prompt, UI, main)

### DON'T

- Don't use `z.object()` for input — use `z.strictObject()`
- Don't use `z.strictObject()` for output — use `z.object()`
- Don't forget to register in `tools.ts` or `commands.ts`
- Don't set `isConcurrencySafe: true` if tool writes files
- Don't import heavy modules at top level — use dynamic `import()`
- Don't use `process.exit()` in tools (breaks the agent loop)
- Don't return raw strings from `call()` — always `{ data: ... }`
- Don't use `export default` for tools — use named `export const`
- Don't skip the `satisfies ToolDef<>` assertion
- Don't put sections out of order (§1-§10)

---

## 11. Reference

### Properties Present in 100% of Tools

| Property | Section | Purpose |
|----------|---------|---------|
| `name` | §1 | Unique identifier string |
| `maxResultSizeChars` | §1 | Max chars before truncation |
| `description()` | §2 | One-line description for LLM |
| `prompt()` | §2 | Full instructions for LLM |
| `userFacingName` | §2 | Human-readable name |
| `getToolUseSummary` | §2 | Short summary for display |
| `getActivityDescription` | §2 | Activity log description |
| `get inputSchema()` | §3 | Zod input schema (getter) |
| `get outputSchema()` | §3 | Zod output schema (getter) |
| `validateInput()` | §7 | Input validation |
| `checkPermissions()` | §6 | Permission checking |
| `call()` | §9 | Core execution logic |
| `mapToolResultToToolResultBlockParam()` | §10 | Output → API format |

### Properties Present in 80%+ of Tools

| Property | Section | Purpose |
|----------|---------|---------|
| `searchHint` | §1 | Keywords for ToolSearch |
| `toAutoClassifierInput()` | §5 | Security classifier input |
| `renderToolUseMessage` | §8 | Display tool invocation |
| `renderToolResultMessage` | §8 | Display tool output |
| `isReadOnly()` | §4 | Does it modify state? |
| `isConcurrencySafe()` | §4 | Can run in parallel? |

### Flavor-Specific Properties

| Property | Flavor | Purpose |
|----------|--------|---------|
| `strict: true` | Write | Strict schema enforcement |
| `getPath()` | Write | File path for permissions |
| `preparePermissionMatcher()` | Write | Rule matching |
| `renderToolUseRejectedMessage` | Write | Denied display |
| `isDestructive()` | Write | Overwrite warning |
| `shouldDefer: true` | Async/Agent | Lazy loading |
| `renderToolUseProgressMessage` | Async | Progress display |
| `isEnabled()` | Agent | Feature flag check |
| `isSearchOrReadCommand()` | Read | Search classification |
| `extractSearchText()` | Read | Search result text |

### Permission Results

```typescript
{ behavior: 'allow', updatedInput }   // Approved
{ behavior: 'deny' }                  // Rejected
{ behavior: 'ask' }                   // Ask user
```

### Tool Result Structure

```typescript
{
  data: Output,                        // Required: your output
  newMessages?: Message[],             // Optional: inject messages
  contextModifier?: (ctx) => ctx,      // Optional: modify context
}
```

### Useful Imports

```typescript
import { buildTool, type ToolDef } from '../../Tool.js'
import { lazySchema } from '../../utils/lazySchema.js'
import { semanticNumber } from '../../utils/semanticNumber.js'
import { semanticBoolean } from '../../utils/semanticBoolean.js'
import { getCwd } from '../../utils/cwd.js'
import { logEvent } from '../../utils/analytics.js'
import { matchWildcardPattern } from '../../utils/permissions.js'
import { checkReadPermissionForTool, checkWritePermissionForTool } from '../../utils/permissions/filesystem.js'
```

---

*Generated from OpenLLM codebase deep analysis — 2026-04-05*
*See also: SKELETON-Tool.md, TEMPLATE-NewTool.md, TEMPLATE-NewCommand.md*
