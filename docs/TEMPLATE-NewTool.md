# Template: Creating a New Tool

## File Structure (4 Files — Always)

```
src/tools/MyNewTool/
├── constants.ts      # §0 — TOOL_NAME export (required)
├── prompt.ts         # §0 — DESCRIPTION + getPrompt() (required)
├── UI.tsx            # §8 — rendering functions (required)
└── MyNewTool.ts      # §1-§10 — buildTool() definition (required)
```

---

## Step 1: constants.ts — Tool Name

```typescript
// src/tools/MyNewTool/constants.ts

export const MY_NEW_TOOL_NAME = 'MyNewTool'
```

---

## Step 2: prompt.ts — Description & Prompt

```typescript
// src/tools/MyNewTool/prompt.ts

export const DESCRIPTION = 'One-line description of what the tool does'

export function getDescription(): string {
  return DESCRIPTION
}

export function getPrompt(): string {
  return `${DESCRIPTION}

Usage notes:
- When to use this tool vs alternatives
- Important constraints or limitations
- Expected input/output behavior

Examples:
- "Use this tool when you need to ..."
- "Do NOT use this tool for ..."
`
}
```

---

## Step 3: UI.tsx — Rendering

```typescript
// src/tools/MyNewTool/UI.tsx

import React from 'react'
import type { Input, Output } from './MyNewTool.js'

export function userFacingName(): string {
  return 'My New Tool'
}

export function getToolUseSummary(input: Input): string {
  return input.param1 || ''
}

export function renderToolUseMessage(
  input: Input,
  { verbose }: { verbose?: boolean },
): React.ReactNode {
  return (
    <span>
      <span style={{ fontWeight: 'bold' }}>MyNewTool</span>
      {' '}{input.param1}
    </span>
  )
}

export function renderToolResultMessage(
  output: Output,
): React.ReactNode {
  return <span>{JSON.stringify(output)}</span>
}
```

---

## Step 4: MyNewTool.ts — Main Implementation (10 Sections)

### Minimal (Read-Only — Flavor 1)

```typescript
// src/tools/MyNewTool/MyNewTool.ts

// ── Imports (canonical order) ──
import { z } from 'zod/v4'
import { buildTool, type ToolDef, type ValidationResult } from '../../Tool.js'
import { lazySchema } from '../../utils/lazySchema.js'
import type { PermissionDecision } from '../../utils/permissions/PermissionResult.js'
import { MY_NEW_TOOL_NAME } from './constants.js'
import { getDescription, getPrompt } from './prompt.js'
import {
  renderToolUseMessage,
  renderToolResultMessage,
  getToolUseSummary,
  userFacingName,
} from './UI.js'

// ── Schemas ──
const inputSchema = lazySchema(() =>
  z.strictObject({                          // ALWAYS strictObject for input
    query: z.string().describe('The input query'),
    limit: z.number().optional().describe('Max results to return'),
  }),
)
type InputSchema = ReturnType<typeof inputSchema>
export type Input = z.infer<InputSchema>

const outputSchema = lazySchema(() =>
  z.object({                                // ALWAYS regular object for output
    results: z.array(z.string()),
    count: z.number(),
  }),
)
type OutputSchema = ReturnType<typeof outputSchema>
export type Output = z.infer<OutputSchema>

// ── Tool Definition (10 sections) ──
export const MyNewTool = buildTool({

  // §1 IDENTITY
  name: MY_NEW_TOOL_NAME,
  searchHint: 'keywords for tool search discovery',
  maxResultSizeChars: 10_000,

  // §2 METADATA
  async description() { return getDescription() },
  async prompt() { return getPrompt() },
  userFacingName,
  getToolUseSummary,
  getActivityDescription(input) {
    const s = getToolUseSummary(input)
    return s ? `Searching ${s}` : 'Searching'
  },

  // §3 SCHEMAS (always as getters)
  get inputSchema(): InputSchema { return inputSchema() },
  get outputSchema(): OutputSchema { return outputSchema() },

  // §4 BEHAVIOR FLAGS
  isReadOnly() { return true },
  isConcurrencySafe() { return true },

  // §5 CLASSIFICATION
  toAutoClassifierInput(input) { return input.query },

  // §6 PERMISSIONS
  async checkPermissions(input, _context): Promise<PermissionDecision> {
    return { behavior: 'allow', updatedInput: input }
  },

  // §7 VALIDATION
  async validateInput(input): Promise<ValidationResult> {
    if (!input.query) return { result: false, message: 'query is required' }
    return { result: true }
  },

  // §8 RENDERING
  renderToolUseMessage,
  renderToolResultMessage,

  // §9 EXECUTION
  async call(input, context) {
    if (context.abortController.signal.aborted) throw new Error('Cancelled')

    const { query, limit = 10 } = input
    const results = [`Result for: ${query}`]

    return {
      data: { results, count: results.length },
    }
  },

  // §10 RESULT MAP (always last)
  mapToolResultToToolResultBlockParam(output, toolUseID) {
    return {
      tool_use_id: toolUseID,
      type: 'tool_result' as const,
      content: output.results.join('\n') || 'No results',
    }
  },
} satisfies ToolDef<InputSchema, Output>)
```

### Full (Write — Flavor 2, With Validation & Permissions)

```typescript
// src/tools/MyWriteTool/MyWriteTool.ts

// ── Imports (canonical order) ──
import { z } from 'zod/v4'
import { buildTool, type ToolDef, type ValidationResult } from '../../Tool.js'
import { lazySchema } from '../../utils/lazySchema.js'
import { semanticBoolean } from '../../utils/semanticBoolean.js'
import type { PermissionDecision } from '../../utils/permissions/PermissionResult.js'
import { checkWritePermissionForTool } from '../../utils/permissions/filesystem.js'
import { matchWildcardPattern } from '../../utils/permissions.js'
import { MY_WRITE_TOOL_NAME } from './constants.js'
import { getDescription, getPrompt } from './prompt.js'
import {
  renderToolUseMessage,
  renderToolResultMessage,
  renderToolUseRejectedMessage,
  getToolUseSummary,
  userFacingName,
} from './UI.js'

// ── Schemas ──
const inputSchema = lazySchema(() =>
  z.strictObject({
    file_path: z.string().describe('Absolute path to the file'),
    content: z.string().describe('Content to write'),
    overwrite: semanticBoolean(z.boolean().optional())
      .describe('Overwrite if exists (default: false)'),
  }),
)
type InputSchema = ReturnType<typeof inputSchema>
export type Input = z.infer<InputSchema>

const outputSchema = lazySchema(() =>
  z.object({
    path: z.string(),
    bytesWritten: z.number(),
    created: z.boolean(),
  }),
)
type OutputSchema = ReturnType<typeof outputSchema>
export type Output = z.infer<OutputSchema>

// ── Tool Definition (10 sections) ──
export const MyWriteTool = buildTool({

  // §1 IDENTITY
  name: MY_WRITE_TOOL_NAME,
  searchHint: 'write create file',
  maxResultSizeChars: 5_000,
  strict: true,                              // ← Write flavor adds this

  // §2 METADATA
  async description() { return getDescription() },
  async prompt() { return getPrompt() },
  userFacingName,
  getToolUseSummary,
  getActivityDescription(input) {
    return `Writing to ${getToolUseSummary(input)}`
  },

  // §3 SCHEMAS
  get inputSchema(): InputSchema { return inputSchema() },
  get outputSchema(): OutputSchema { return outputSchema() },

  // §4 BEHAVIOR FLAGS
  isReadOnly() { return false },             // ← Writes files
  isConcurrencySafe() { return false },      // ← Not safe for parallel
  isDestructive(input) {                     // ← Write flavor adds this
    return input.overwrite === true
  },

  // §5 CLASSIFICATION
  toAutoClassifierInput(input) { return input.file_path },
  getPath({ file_path }) { return file_path },  // ← Write flavor adds this

  // §6 PERMISSIONS (write flavor uses write checker + matcher)
  async preparePermissionMatcher({ file_path }) {
    return (rulePattern: string) => matchWildcardPattern(rulePattern, file_path)
  },
  async checkPermissions(input, context): Promise<PermissionDecision> {
    return checkWritePermissionForTool(
      MyWriteTool, input, context.getAppState().toolPermissionContext,
    )
  },

  // §7 VALIDATION
  async validateInput(input): Promise<ValidationResult> {
    if (!input.file_path.startsWith('/')) {
      return { result: false, message: 'file_path must be absolute' }
    }
    return { result: true }
  },

  // §8 RENDERING
  renderToolUseMessage,
  renderToolResultMessage,
  renderToolUseRejectedMessage,              // ← Write flavor adds this

  // §9 EXECUTION
  async call(input, context) {
    if (context.abortController.signal.aborted) throw new Error('Cancelled')

    const { file_path, content, overwrite = false } = input
    const fs = await import('fs/promises')
    const exists = await fs.access(file_path).then(() => true).catch(() => false)

    if (exists && !overwrite) {
      throw new Error(`File exists: ${file_path}. Set overwrite=true.`)
    }

    await fs.writeFile(file_path, content, 'utf-8')

    context.updateFileHistoryState((prev) => ({
      ...prev,
      [file_path]: { action: exists ? 'modified' : 'created' },
    }))

    return {
      data: {
        path: file_path,
        bytesWritten: Buffer.byteLength(content),
        created: !exists,
      },
    }
  },

  // §10 RESULT MAP (always last)
  mapToolResultToToolResultBlockParam(output, toolUseID) {
    return {
      tool_use_id: toolUseID,
      type: 'tool_result' as const,
      content: `${output.created ? 'Created' : 'Updated'} ${output.path} (${output.bytesWritten} bytes)`,
    }
  },
} satisfies ToolDef<InputSchema, Output>)
```

---

## Step 6: Register in tools.ts

```typescript
// src/tools.ts — add to getAllBaseTools()

import { MyNewTool } from './tools/MyNewTool/MyNewTool.js'

export function getAllBaseTools(): Tools {
  return [
    // ... existing tools ...
    MyNewTool,   // <-- add here
  ]
}
```

### Conditional Registration (feature-gated)

```typescript
// Lazy load with feature flag
const MyNewTool = feature('MY_FEATURE')
  ? require('./tools/MyNewTool/MyNewTool.js').MyNewTool
  : null

export function getAllBaseTools(): Tools {
  return [
    // ... existing tools ...
    ...(MyNewTool ? [MyNewTool] : []),
  ]
}
```

---

## Checklist

### 4 Files
- [ ] `constants.ts` — `export const MY_TOOL_NAME = 'MyTool'`
- [ ] `prompt.ts` — `DESCRIPTION` + `getDescription()` + `getPrompt()`
- [ ] `UI.tsx` — `userFacingName` + `getToolUseSummary` + `renderToolUseMessage` + `renderToolResultMessage`
- [ ] `MyTool.ts` — `buildTool({...}) satisfies ToolDef<InputSchema, Output>`

### 10 Sections (in order)
- [ ] §1 `name`, `searchHint`, `maxResultSizeChars`
- [ ] §2 `description()`, `prompt()`, `userFacingName`, `getToolUseSummary`, `getActivityDescription`
- [ ] §3 `get inputSchema()` (`z.strictObject` in `lazySchema`), `get outputSchema()` (`z.object` in `lazySchema`)
- [ ] §4 `isReadOnly()`, `isConcurrencySafe()`
- [ ] §5 `toAutoClassifierInput()`
- [ ] §6 `checkPermissions()` — allow/deny/ask
- [ ] §7 `validateInput()` — return `{ result: true }` or `{ result: false, message }`
- [ ] §8 `renderToolUseMessage`, `renderToolResultMessage`
- [ ] §9 `call()` — returns `{ data: Output }`, checks `abortController`
- [ ] §10 `mapToolResultToToolResultBlockParam()` — **always last**

### Registration
- [ ] Added to `src/tools.ts` → `getAllBaseTools()` array

### Flavor-Specific (add if applicable)
- [ ] Write: `strict: true`, `getPath()`, `preparePermissionMatcher()`, `renderToolUseRejectedMessage`
- [ ] Async: `shouldDefer: true`, `renderToolUseProgressMessage`
- [ ] Agent: `isEnabled()`, state mutations in `call()`
