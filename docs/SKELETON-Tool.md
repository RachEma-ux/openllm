# OpenLLM Tool Skeleton — The Repeating Pattern

Every tool in OpenLLM follows the **exact same 10-section structure**. No exceptions.

---

## The Invariant Structure

```
Every tool = 4 files + 10 sections + 1 registration line
```

### 4 Files (Always)

```
src/tools/MyTool/
├── constants.ts       # TOOL_NAME export
├── prompt.ts          # DESCRIPTION + PROMPT
├── UI.tsx             # renderToolUseMessage + renderToolResultMessage
└── MyTool.ts          # buildTool() — the 10 sections below
```

### 10 Sections (Always in this order)

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
  // §10 RESULT MAP      → mapToolResultToToolResultBlockParam()
} satisfies ToolDef<InputSchema, Output>)
```

### 1 Registration Line

```typescript
// src/tools.ts → getAllBaseTools()
MyTool,
```

---

## The Rules (100% Consistent Across All 44 Tools)

| Rule | Pattern | Why |
|------|---------|-----|
| Input schema | `z.strictObject()` | Rejects unknown fields |
| Output schema | `z.object()` | Allows extra fields |
| Both schemas | Wrapped in `lazySchema()` | Breaks circular deps |
| Schema access | `get inputSchema()` getter | Lazy evaluation |
| call() return | `{ data: Output }` | Always wrapped |
| Last property | `mapToolResultToToolResultBlockParam` | Always last |
| Type assertion | `satisfies ToolDef<InputSchema, Output>` | Type safety |
| Export style | `export const XTool = buildTool({})` | Named export, never default |
| Name constant | `UPPER_SNAKE_CASE` in constants.ts | e.g. `BASH_TOOL_NAME = 'Bash'` |
| Import order | zod → anthropic → Tool.js → utils → permissions → local | Always |

---

## The 4 Flavors

### Flavor 1: READ-ONLY (GrepTool, GlobTool, FileReadTool)

```typescript
// Extra sections:
isReadOnly() { return true },
isConcurrencySafe() { return true },
isSearchOrReadCommand() { return { isSearch: true, isRead: false } },
extractSearchText(output) { return output.text },

// Permission:
checkPermissions → checkReadPermissionForTool()
```

### Flavor 2: WRITE (FileWriteTool, FileEditTool)

```typescript
// Extra sections:
strict: true,
isReadOnly() { return false },
isConcurrencySafe() { return false },
isDestructive(input) { return input.overwrite },
backfillObservableInput(input) { /* normalize paths */ },

// Permission:
checkPermissions → checkWritePermissionForTool()
getPath(input) { return input.file_path },
preparePermissionMatcher(input) { return (rule) => match(rule, input.file_path) },

// Extra rendering:
renderToolUseRejectedMessage,
```

### Flavor 3: ASYNC/NETWORK (WebSearchTool, WebFetchTool)

```typescript
// Extra sections:
shouldDefer: true,
renderToolUseProgressMessage,

// call() uses:
onProgress?.({ type: 'status', message: 'Fetching...' })
```

### Flavor 4: AGENT/TASK (AgentTool, TaskCreateTool, SendMessageTool)

```typescript
// Extra sections:
shouldDefer: true,
isEnabled() { return someFeatureFlag },

// call() modifies:
context.getAppState() / context.setAppState()
```

---

## Copy-Paste Skeleton

### constants.ts

```typescript
export const MY_TOOL_NAME = 'MyTool'
```

### prompt.ts

```typescript
import { MY_TOOL_NAME } from './constants.js'

export const DESCRIPTION = 'One-line: what the tool does'

export function getDescription(): string {
  return DESCRIPTION
}

export function getPrompt(): string {
  return `${DESCRIPTION}

Usage:
- When to use this tool
- What parameters to provide
- What to expect as output

Important:
- Constraints and limitations
- Edge cases to handle
`
}
```

### UI.tsx

```typescript
import React from 'react'
import type { Input, Output } from './MyTool.js'

export function userFacingName(): string {
  return 'My Tool'
}

export function getToolUseSummary(input: Input): string {
  return input.mainParam || ''
}

export function renderToolUseMessage(
  input: Input,
  { verbose }: { verbose?: boolean },
): React.ReactNode {
  return (
    <span>
      <span style={{ fontWeight: 'bold' }}>MyTool</span>
      {' '}{input.mainParam}
    </span>
  )
}

export function renderToolResultMessage(
  output: Output,
  _progressMessages: unknown[],
  { verbose }: { verbose?: boolean },
): React.ReactNode {
  return <span>{output.summary}</span>
}
```

### MyTool.ts

```typescript
import { z } from 'zod/v4'
import { buildTool, type ToolDef, type ValidationResult } from '../../Tool.js'
import { lazySchema } from '../../utils/lazySchema.js'
import type { PermissionDecision } from '../../utils/permissions/PermissionResult.js'
import { MY_TOOL_NAME } from './constants.js'
import { getDescription, getPrompt } from './prompt.js'
import {
  renderToolUseMessage,
  renderToolResultMessage,
  getToolUseSummary,
  userFacingName,
} from './UI.js'

// ── §SCHEMAS ──
const inputSchema = lazySchema(() =>
  z.strictObject({
    mainParam: z.string().describe('Primary input'),
    optionalParam: z.number().optional().describe('Optional setting'),
  }),
)
type InputSchema = ReturnType<typeof inputSchema>
export type Input = z.infer<InputSchema>

const outputSchema = lazySchema(() =>
  z.object({
    summary: z.string(),
    count: z.number(),
  }),
)
type OutputSchema = ReturnType<typeof outputSchema>
export type Output = z.infer<OutputSchema>

// ── §TOOL ──
export const MyTool = buildTool({
  // §1 IDENTITY
  name: MY_TOOL_NAME,
  searchHint: 'keywords for discovery',
  maxResultSizeChars: 10_000,

  // §2 METADATA
  async description() { return getDescription() },
  async prompt() { return getPrompt() },
  userFacingName,
  getToolUseSummary,
  getActivityDescription(input) {
    const s = getToolUseSummary(input)
    return s ? `Processing ${s}` : 'Processing'
  },

  // §3 SCHEMAS
  get inputSchema(): InputSchema { return inputSchema() },
  get outputSchema(): OutputSchema { return outputSchema() },

  // §4 BEHAVIOR FLAGS
  isReadOnly() { return true },
  isConcurrencySafe() { return true },

  // §5 CLASSIFICATION
  toAutoClassifierInput(input) { return input.mainParam },

  // §6 PERMISSIONS
  async checkPermissions(input, _context): Promise<PermissionDecision> {
    return { behavior: 'allow', updatedInput: input }
  },

  // §7 VALIDATION
  async validateInput(input): Promise<ValidationResult> {
    if (!input.mainParam) {
      return { result: false, message: 'mainParam is required' }
    }
    return { result: true }
  },

  // §8 RENDERING
  renderToolUseMessage,
  renderToolResultMessage,

  // §9 EXECUTION
  async call(input, context) {
    const { mainParam } = input

    // Check abort
    if (context.abortController.signal.aborted) {
      throw new Error('Cancelled')
    }

    // Your logic here
    const result = { summary: `Done: ${mainParam}`, count: 1 }

    return { data: result }
  },

  // §10 RESULT MAP (always last)
  mapToolResultToToolResultBlockParam(output, toolUseID) {
    return {
      tool_use_id: toolUseID,
      type: 'tool_result' as const,
      content: output.summary,
    }
  },
} satisfies ToolDef<InputSchema, Output>)
```

### Registration (tools.ts)

```typescript
import { MyTool } from './tools/MyTool/MyTool.js'

// In getAllBaseTools():
MyTool,
```

---

## Quick Reference: What Goes Where

| Question | Answer |
|----------|--------|
| Tool name string? | `constants.ts` |
| LLM instructions? | `prompt.ts` → `getPrompt()` |
| Input/output types? | `MyTool.ts` → `lazySchema()` |
| Business logic? | `MyTool.ts` → `call()` |
| Display to user? | `UI.tsx` → `renderToolUseMessage()` |
| Return to LLM? | `MyTool.ts` → `mapToolResultToToolResultBlockParam()` |
| Can run parallel? | `isConcurrencySafe()` |
| Needs permission? | `checkPermissions()` |
| Register it? | `tools.ts` → `getAllBaseTools()` |
