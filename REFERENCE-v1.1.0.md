# OpenLLM v1.1.0 — Mobile-Ready Reference

**Tag:** `v1.1.0-mobile-ready`
**Commit:** `d0a2932`
**Date:** 2026-04-06
**Status:** Production-ready for mobile deployment

---

## What This Version Includes

### Core
- Multi-provider chat relay (16 providers)
- Auto-detect Ollama models
- WebSocket streaming with auto-reconnect
- Conversation history (5 on Termux, 10 elsewhere)
- `num_ctx: 1024/2048`, `num_predict: 128/256` Ollama limits

### Mobile/PWA (26 features)
1. PWA manifest + icons (install as app)
2. Self-healing service worker (version-based auto-clear)
3. Mobile layout (100dvh, safe-area-inset)
4. 44px+ touch targets
5. Shared top app bar with hamburger
6. Slide-out drawer (Home/New/Settings/Sessions/Provider/Status)
7. Settings panel (connection, Ollama, sessions, about)
8. Remote agent connection (tunnel URL input)
9. Multi-backend manager (save + switch)
10. Session persistence (IndexedDB)
11. Session resume + export (JSON)
12. Session delete (long press)
13. Dark/light theme toggle
14. Font size adjustment (A-/A+)
15. Voice input (SpeechRecognition)
16. File upload (attach button)
17. Syntax highlighting (Prism.js + marked.js)
18. Copy button on code blocks
19. Collapsible long code blocks
20. Swipe gestures (left/right navigation)
21. Long press → copy message
22. Toast notifications
23. Deploy agent button (triggers GitHub Actions)
24. Termux detection + auto-paths
25. `/api/status` endpoint (platform/memory/sessions)
26. Termux launcher script (`bin/openllm-termux.sh`)

### Architecture
```
Phone (PWA) ──WSS──→ Cloudflare Tunnel ──→ GitHub Actions
                                              ├── node-server.ts (chat relay)
                                              └── Ollama + llama3.2:3b
```

Alternative (on device):
```
Phone (PWA) ──WS──→ node-server.ts (Termux) ──→ Ollama (local)
```

---

## Files Structure

```
openllm/
├── src/web/
│   ├── node-server.ts          # Multi-provider Node.js server
│   ├── public/
│   │   ├── index.html          # Full mobile PWA UI
│   │   ├── manifest.json       # PWA manifest
│   │   ├── sw.js               # Self-healing service worker
│   │   ├── icon-192.svg        # PWA icon (small)
│   │   ├── icon-512.svg        # PWA icon (large)
│   │   └── favicon.svg         # Browser favicon
│   ├── server.ts               # Bun-based full agent server
│   ├── headless-engine.ts      # QueryEngine bridge
│   └── ws-bridge.ts            # WebSocket protocol
├── bin/
│   └── openllm-termux.sh       # Termux launcher (Ollama + web UI)
└── .github/workflows/
    └── openllm-builder-deploy.yml  # GitHub Actions deploy with tunnel
```

---

## Deployment Verified

**Tunnel URL (ephemeral, regenerates per deploy):**
`https://*.trycloudflare.com`

**Test:**
```
WS: wss://*.trycloudflare.com/ws
Send: {"type":"message","content":"What is 2+2?","provider":"ollama","model":"llama3.2:3b"}
Recv: token "Four." → done
Latency: ~5s first token, ~5.4s total
```

---

## Known Issues

1. **Full agent (dist/cli.mjs serve) crashes** on GitHub Actions with `path.resolve` error
   - Falls back to node-server.ts (chat-only, no tools) automatically
   - Bun QueryEngine doesn't run on Android/Termux (binary incompatible)
2. **Cloudflare Quick Tunnel** occasionally returns 500 errors (their service, not ours)
3. **Service worker** must be version-bumped to invalidate caches

---

## Quick Start

### On Workstation
```bash
git clone https://github.com/RachEma-ux/openllm
cd openllm
bun install
npx tsx src/web/node-server.ts
# Open http://localhost:5000
```

### On Termux (Android)
```bash
cd ~/openllm
bash bin/openllm-termux.sh
# Auto-starts Ollama + web UI, opens browser
```

### Deploy to GitHub Actions
```bash
gh workflow run openllm-builder-deploy.yml --ref main \
  -f run_app=yes -f duration=30 -f provider=ollama
# Wait ~3 min, check gist for tunnel URL
```

---

## Baseline for Future Work

This is the reference version for all subsequent development. Any new features should:
1. Not break mobile PWA experience
2. Not remove the 26 mobile features
3. Keep the OpenCode-style navigation (hamburger drawer)
4. Maintain the self-healing SW pattern

---

*Tagged: 2026-04-06*
