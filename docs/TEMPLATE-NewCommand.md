# Template: Creating a New Slash Command

## File Structure

```
src/commands/my-command/
├── index.ts          # Command definition (required)
└── my-command.tsx    # Implementation (required)
```

---

## Three Command Types

| Type | Use Case | Returns |
|------|----------|---------|
| `local` | Text-only output, no UI | `{ type: 'text', value: string }` |
| `local-jsx` | Interactive UI (React) | React node via `onDone()` callback |
| `prompt` | Expand to LLM prompt | `ContentBlockParam[]` for model context |

---

## Type 1: LOCAL Command (Simplest)

### index.ts

```typescript
// src/commands/my-command/index.ts
import type { Command } from '../../commands.js'

const myCommand = {
  type: 'local',
  name: 'my-command',
  aliases: ['mc'],                    // optional shortcuts
  description: 'What this command does',
  argumentHint: '[optional-arg]',     // shown in /help
  isEnabled: () => true,              // can be conditional
  isHidden: false,                    // hidden from /help?
  immediate: true,                    // run without querying LLM after
  supportsNonInteractive: true,       // works in SDK/headless mode
  load: () => import('./my-command.js'),
} satisfies Command

export default myCommand
```

### my-command.ts

```typescript
// src/commands/my-command/my-command.ts
import type { LocalCommandCall, LocalCommandResult } from '../../types/command.js'

export const call: LocalCommandCall = async (
  args,      // string after /my-command (user input)
  context,   // ToolUseContext + LocalJSXCommandContext
): Promise<LocalCommandResult> => {

  // Simple text output
  if (!args.trim()) {
    return {
      type: 'text',
      value: 'Usage: /my-command <argument>',
    }
  }

  // Do work
  const result = `Processed: ${args}`

  return {
    type: 'text',
    value: result,
  }
}
```

### Return Types for LOCAL

```typescript
// Text result — displayed to user
{ type: 'text', value: 'Output text here' }

// Compact result — for conversation compaction
{ type: 'compact', compactionResult: result, displayText: 'Compacted' }

// Skip — do nothing (command handled internally)
{ type: 'skip' }
```

---

## Type 2: LOCAL-JSX Command (With React UI)

### index.ts

```typescript
// src/commands/my-ui-cmd/index.ts
import type { Command } from '../../commands.js'

const myUiCmd = {
  type: 'local-jsx',
  name: 'my-ui-cmd',
  description: 'Interactive command with UI',
  immediate: false,           // false = query LLM after completion
  load: () => import('./my-ui-cmd.js'),
} satisfies Command

export default myUiCmd
```

### my-ui-cmd.tsx

```typescript
// src/commands/my-ui-cmd/my-ui-cmd.tsx
import React from 'react'
import type { LocalJSXCommandCall } from '../../types/command.js'

export const call: LocalJSXCommandCall = async (
  onDone,     // callback when command finishes
  context,    // full ToolUseContext + UI context
  args,       // string arguments
) => {

  // Option A: Do work and finish immediately
  const result = await doSomething(args)
  onDone(result, {
    display: 'user',       // 'user' | 'system' | 'skip'
    shouldQuery: false,     // true = send result to LLM for follow-up
  })
  return null

  // Option B: Return interactive React component
  // return <MyInteractiveUI onDone={onDone} args={args} context={context} />
}
```

### onDone Options

```typescript
onDone(resultText, {
  display: 'user',        // Show as user message
  display: 'system',      // Show as system message
  display: 'skip',        // Don't display

  shouldQuery: true,       // Send to LLM after
  shouldQuery: false,      // Don't query LLM

  metaMessages: ['info'],  // Extra context messages
  nextInput: '/other-cmd', // Auto-type next command
  submitNextInput: true,   // Auto-submit nextInput
})
```

---

## Type 3: PROMPT Command (Skill / LLM Prompt)

### As Code

```typescript
// src/commands/my-skill/index.ts
import type { Command } from '../../commands.js'

const mySkill = {
  type: 'prompt',
  name: 'my-skill',
  description: 'Specialized analysis skill',
  progressMessage: 'Running analysis...',
  contentLength: 2000,       // estimated chars for token budget
  source: 'builtin',
  userInvocable: true,       // user can call via /my-skill

  async getPromptForCommand(args, context) {
    return [
      {
        type: 'text',
        text: `You are an expert code analyst. Analyze the following:

${args}

Provide:
1. Summary
2. Issues found
3. Recommendations`,
      },
    ]
  },
} satisfies Command

export default mySkill
```

### As Markdown File (Easiest)

```markdown
<!-- ~/.claude/commands/my-skill.md -->
---
name: my-skill
description: Analyze code quality
type: prompt
context: inline
---

You are an expert code analyst. Analyze the following:

$ARGUMENTS

Provide:
1. Summary of what the code does
2. Issues found (bugs, security, performance)
3. Specific recommendations with code examples
```

### Prompt Command Options

```typescript
{
  type: 'prompt',
  context: 'inline',        // Run in current conversation
  context: 'fork',          // Run as sub-agent (isolated)
  agent: 'general-purpose', // Agent type for forked context
  model: 'sonnet',          // Override model for this skill
  allowedTools: ['Bash', 'Read', 'Grep'],  // Restrict tools
  argNames: ['file', 'mode'],  // Named arguments
  effort: 'high',           // Effort level hint
}
```

---

## Step 5: Register in commands.ts

```typescript
// src/commands.ts

import myCommand from './commands/my-command/index.js'

const COMMANDS = memoize((): Command[] => [
  // ... existing commands ...
  myCommand,   // <-- add here
])
```

### Conditional Registration

```typescript
const myCommand = feature('MY_FEATURE')
  ? require('./commands/my-command/index.js').default
  : null

const COMMANDS = memoize((): Command[] => [
  ...(myCommand ? [myCommand] : []),
])
```

---

## Checklist

- [ ] `index.ts` — command definition with `satisfies Command`
- [ ] Implementation file (`.ts` for local, `.tsx` for local-jsx)
- [ ] `name` — unique, lowercase, kebab-case
- [ ] `description` — shown in `/help`
- [ ] `type` — `local` | `local-jsx` | `prompt`
- [ ] `load` — lazy import (for local/local-jsx)
- [ ] `getPromptForCommand` — returns `ContentBlockParam[]` (for prompt)
- [ ] Registered in `commands.ts` → `COMMANDS()`
- [ ] `isEnabled()` — conditional availability (optional)
- [ ] `immediate` — whether to skip LLM query after (optional)
