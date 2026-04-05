# OpenLLM Skill Manager — Setup & Usage

## What Was Built

### 1. Skill Manager Command (`/skill`)

**Location:** `~/.claude/commands/skill-manager.md`

A meta-skill that manages all other skills from inside OpenLLM. No code changes needed.

### 2. Skill Packs Repository

**Repo:** `github.com/RachEma-ux/openllm-skills`
**Local:** `~/openllm-skills/`

17 pre-built skills across 9 domain packs, targeting MyNewAp1Claude modules.

### 3. Zero Code Changes

- No TypeScript edited
- No build step needed
- Drop `.md` file → skill is live
- Git repo for versioning & sharing
- Profile switching via `/skill profile <name>`

---

## Skill Manager Commands

```
/skill install <git-url> [pack-name]    Install skills from a git repo
/skill remove <skill-name>              Delete a skill
/skill list                             Show all installed skills
/skill profile <name>                   Switch to a skill profile
/skill profile list                     Show available profiles
/skill profile create <name> <skills>   Create a new profile
/skill profile all                      Enable all skills
/skill create <name> "<description>"    Create a new skill interactively
```

### Examples

```
# Install all packs
/skill install https://github.com/RachEma-ux/openllm-skills

# Install only provider skills
/skill install https://github.com/RachEma-ux/openllm-skills providers

# Install only frontend skills
/skill install https://github.com/RachEma-ux/openllm-skills frontend

# Switch to database-only profile
/skill profile database

# Enable everything
/skill profile all

# List what's installed
/skill list

# Remove a skill
/skill remove token-audit

# Create a new skill on the fly
/skill create my-checker "Check for TODO comments in code"
```

---

## Skill Packs (17 Skills, 9 Packs)

### providers (3 skills)

| Skill | Command | Description |
|-------|---------|-------------|
| review-provider | `/review-provider` | Review and validate LLM provider configurations |
| test-connection | `/test-connection` | Test an LLM provider connection and report results |
| sync-keys | `/sync-keys` | Audit and sync API keys across provider configurations |

### chat (2 skills)

| Skill | Command | Description |
|-------|---------|-------------|
| debug-stream | `/debug-stream` | Debug chat streaming issues — trace the full message path |
| token-audit | `/token-audit` | Audit token usage and cost tracking across chat sessions |

### agents (1 skill)

| Skill | Command | Description |
|-------|---------|-------------|
| review-pipeline | `/review-pipeline` | Review agent orchestration pipeline and promotion lifecycle |

### documents (2 skills)

| Skill | Command | Description |
|-------|---------|-------------|
| chunk-preview | `/chunk-preview` | Preview how a document gets chunked and embedded in RAG |
| embedding-inspect | `/embedding-inspect` | Inspect embedding quality and vector database health |

### automation (2 skills)

| Skill | Command | Description |
|-------|---------|-------------|
| workflow-lint | `/workflow-lint` | Lint and validate automation workflows for correctness |
| trigger-test | `/trigger-test` | Test automation triggers by tracing event → condition → action |

### governance (2 skills)

| Skill | Command | Description |
|-------|---------|-------------|
| policy-check | `/policy-check` | Check governance policies and security controls |
| secret-rotate | `/secret-rotate` | Guide secret rotation process and verify no stale keys |

### database (2 skills)

| Skill | Command | Description |
|-------|---------|-------------|
| schema-review | `/schema-review` | Review Drizzle schema for consistency, indexes, relations |
| migration-check | `/migration-check` | Verify database migrations are safe and reversible |

### frontend (2 skills)

| Skill | Command | Description |
|-------|---------|-------------|
| component-review | `/component-review` | Review React components for patterns, a11y, performance |
| route-audit | `/route-audit` | Audit all frontend routes — dead routes, missing pages |

### general (2 skills)

| Skill | Command | Description |
|-------|---------|-------------|
| review-security | `/review-security` | Full security audit (OWASP Top 10) |
| full-review | `/full-review` | Comprehensive code review — architecture, quality, bugs |

---

## Module → Pack Mapping (MyNewAp1Claude)

| Server Module | Skill Pack | Skills Available |
|---------------|-----------|-----------------|
| `server/providers/` | providers | review-provider, test-connection, sync-keys |
| `server/chat/` | chat | debug-stream, token-audit |
| `server/agents/` | agents | review-pipeline |
| `server/documents/` | documents | chunk-preview, embedding-inspect |
| `server/automation/` | automation | workflow-lint, trigger-test |
| `server/policies/` + `server/secrets/` | governance | policy-check, secret-rotate |
| `drizzle/` | database | schema-review, migration-check |
| `client/src/` | frontend | component-review, route-audit |
| (cross-cutting) | general | review-security, full-review |

---

## How It Works (Architecture)

```
~/.claude/commands/              ← OpenLLM auto-discovers .md files here
├── skill-manager.md             ← the /skill meta-command
├── review-provider.md           ← installed skill
├── debug-stream.md              ← installed skill
├── ...
├── .disabled/                   ← skills hidden by profile switch
│   ├── token-audit.md
│   └── ...
└── .profiles/                   ← profile definitions
    ├── providers.txt            ← list of skill filenames
    ├── frontend.txt
    └── all.txt
```

**Flow:**
```
/skill install <url> providers
    ↓
git clone → copy packs/providers/*.md → ~/.claude/commands/
    ↓
Skills immediately available as /review-provider, /test-connection, etc.
    ↓
/skill profile providers
    ↓
Move non-provider skills to .disabled/ → only provider skills active
    ↓
/skill profile all
    ↓
Move everything back from .disabled/ → all skills active
```

---

## How to Create a New Skill

### Option 1: Ask OpenLLM
```
/skill create review-api "Review all tRPC API endpoints for consistency"
```
OpenLLM writes the `.md` file for you.

### Option 2: Manual
Create `~/.claude/commands/my-skill.md`:
```markdown
---
name: my-skill
description: What this skill does
context: fork
allowedTools:
  - Read
  - Grep
  - Glob
  - Bash
---

You are an expert at X. Do the following:

1. Step one
2. Step two
3. Step three

Focus on: $ARGUMENTS

Output a structured report.
```

### Option 3: Add to Skill Pack Repo
```bash
# Create the skill file
vim ~/openllm-skills/packs/my-pack/my-skill.md

# Push to repo
cd ~/openllm-skills && git add -A && git commit -m "add my-skill" && git push

# Install on any machine
/skill install https://github.com/RachEma-ux/openllm-skills my-pack
```

---

## Skill Frontmatter Reference

| Field | Values | Default | Effect |
|-------|--------|---------|--------|
| `name` | any string | filename | Skill name and /command |
| `description` | any string | — | Shown in /skill list and /help |
| `context` | `inline` / `fork` | `inline` | `fork` = runs as isolated sub-agent |
| `agent` | `general-purpose` | — | Agent type for forked context |
| `model` | `sonnet` / `opus` / `haiku` | inherited | Override model for this skill |
| `allowedTools` | list of tool names | all | Restrict which tools the skill can use |
| `argNames` | list of strings | — | Named arguments (parsed from $ARGUMENTS) |
| `effort` | `high` / `medium` / `low` | — | Effort level hint for the model |

---

## Files Reference

| File | Location | Purpose |
|------|----------|---------|
| Skill Manager | `~/.claude/commands/skill-manager.md` | The /skill meta-command |
| Skill Packs Repo | `github.com/RachEma-ux/openllm-skills` | Shareable skill collections |
| Local Skills | `~/.claude/commands/*.md` | Active skills |
| Disabled Skills | `~/.claude/commands/.disabled/*.md` | Inactive (profile-switched) |
| Profiles | `~/.claude/commands/.profiles/*.txt` | Profile definitions |

---

---

## Mid-Session Usage (No Restart)

The key problem: installing new skills requires restart, which kills session context.

**Solution: 3 meta-commands that work mid-session:**

### `/run-skill <name> [args]` — Execute Any Skill Instantly

Reads the skill `.md` file on demand and executes its instructions inline. Works with active AND disabled skills. No restart.

```
User: /run-skill review-security the auth module
      → Agent reads review-security.md → follows its instructions → outputs report

User: /run-skill schema-review
      → Agent reads schema-review.md → analyzes Drizzle schema → outputs findings
```

### `/skills-list` — See All Available Skills

Scans `~/.claude/commands/` and `.disabled/` directories, shows active vs disabled with descriptions.

```
User: /skills-list

ACTIVE SKILLS:
  /review-provider    — Review and validate LLM provider configurations
  /debug-stream       — Debug chat streaming issues
  ...

DISABLED SKILLS (use /run-skill to run anyway):
  /token-audit        — Audit token usage and cost tracking
  ...

17 active, 0 disabled, 17 total
```

### `/switch-profile <name>` — Change Skill Set

Moves skills between active and disabled folders. Meta-commands (run-skill, skills-list, switch-profile, skill-manager) always stay active.

```
User: /switch-profile providers     → only provider skills active
User: /switch-profile database      → only database skills active
User: /switch-profile all           → everything active
User: /switch-profile list          → show available profiles
```

### The Flow (Zero Restarts)

```
Session starts with all 17 skills pre-installed
    ↓
User works on providers module
    /run-skill review-provider Ollama
    /run-skill test-connection OpenAI
    ↓
User switches to database work
    /switch-profile database          ← for next session's /commands
    /run-skill schema-review          ← works NOW, no restart
    /run-skill migration-check        ← works NOW, no restart
    ↓
User needs a skill not yet installed
    /skill create api-audit "Audit all REST endpoints"
    /run-skill api-audit              ← works immediately
    ↓
Session context preserved throughout — no restarts, no lost history
```

---

*Built 2026-04-06 — zero code changes to OpenLLM*
