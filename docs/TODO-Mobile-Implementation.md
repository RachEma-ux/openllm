# OpenLLM Mobile Implementation — Full TODO

Target: Make OpenLLM a first-class mobile experience on Android/Termux.

---

## Level 1: PWA (Progressive Web App)

### 1.1 Web App Manifest
- [ ] Create `src/web/public/manifest.json`
  - name: "OpenLLM"
  - short_name: "OpenLLM"
  - start_url: "/"
  - display: "standalone"
  - background_color: "#0d0d0d"
  - theme_color: "#6366f1"
  - orientation: "portrait"
  - icons: 192x192 + 512x512 (PNG)
- [ ] Add `<link rel="manifest" href="/manifest.json">` to index.html
- [ ] Add `<meta name="theme-color" content="#6366f1">` to index.html
- [ ] Add `<meta name="apple-mobile-web-app-capable" content="yes">` to index.html
- [ ] Add `<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">` to index.html

### 1.2 App Icons
- [ ] Create `src/web/public/icon-192.png` (OpenLLM logo, 192x192)
- [ ] Create `src/web/public/icon-512.png` (OpenLLM logo, 512x512)
- [ ] Create `src/web/public/apple-touch-icon.png` (180x180)
- [ ] Add `<link rel="apple-touch-icon" href="/apple-touch-icon.png">` to index.html

### 1.3 Service Worker
- [ ] Create `src/web/public/sw.js`
  - Cache strategy: network-first for API, cache-first for static
  - Cache list: index.html, favicon.svg, manifest.json, icons
  - Offline fallback: show cached UI with "offline" badge
  - Handle WebSocket reconnect on network restore
- [ ] Register service worker in index.html:
  ```js
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js')
  }
  ```
- [ ] Add install prompt banner ("Add to Home Screen")
- [ ] Handle `beforeinstallprompt` event

### 1.4 Offline Support
- [ ] Cache conversation history in IndexedDB (not just memory)
- [ ] Show cached messages when offline
- [ ] Queue outgoing messages, send when reconnected
- [ ] Show clear offline/online status indicator

---

## Level 2: Touch-Optimized Mobile UI

### 2.1 Layout Fixes
- [ ] Fix mobile breakpoint (currently just hides sidebar — should restructure)
- [ ] Mobile layout: full-width chat, no sidebar rail
- [ ] Bottom navigation bar (Home / Chat / Settings) instead of sidebar
- [ ] Chat composer pinned to bottom (above keyboard)
- [ ] Safe area insets for notch phones: `env(safe-area-inset-top)` etc.
- [ ] Viewport height fix: `height: 100dvh` (dynamic viewport height)

### 2.2 Touch Targets
- [ ] Minimum 44x44px tap targets on all buttons (WCAG)
- [ ] Send button: 48x48px minimum
- [ ] Provider/model dropdowns: larger touch area
- [ ] Tool cards: larger tap area for expand/collapse
- [ ] Permission buttons (Allow/Deny): full-width on mobile

### 2.3 Gestures
- [ ] Swipe right → open sidebar/panel
- [ ] Swipe left → close sidebar/panel
- [ ] Pull down → refresh connection status
- [ ] Long press message → copy text
- [ ] Swipe message left → delete/clear

### 2.4 Keyboard Handling
- [ ] Auto-resize textarea when keyboard opens
- [ ] Scroll chat to bottom when keyboard appears
- [ ] `inputmode="text"` on textarea (no autocapitalize on code)
- [ ] Dismiss keyboard on send
- [ ] Handle `visualViewport` resize events

### 2.5 Mobile-Specific Features
- [ ] Haptic feedback on send (navigator.vibrate)
- [ ] Share button (Web Share API) for messages/results
- [ ] Copy code blocks with one tap
- [ ] Fullscreen toggle button
- [ ] Dark/light theme toggle (respect system preference)
- [ ] Font size adjustment (A+ / A-)

---

## Level 3: Remote Agent Connection

### 3.1 Connection Manager
- [ ] Add `/api/mode` endpoint to node-server.ts
  - Returns: `{ mode: 'local' | 'remote', agent: 'chat-only' | 'full-agent' }`
- [ ] UI shows current mode badge (Local Chat / Remote Agent)
- [ ] Settings panel to configure remote agent URL

### 3.2 Remote WebSocket Bridge
- [ ] Add `remoteUrl` field to UI state
- [ ] When set, connect WebSocket to remote URL instead of local
- [ ] Support both `ws://` (local) and `wss://` (tunnel)
- [ ] Auto-detect: if local health fails, prompt for remote URL
- [ ] Save remote URL in localStorage

### 3.3 GitHub Actions Integration
- [ ] Add "Deploy Agent" button in UI settings
  - Triggers `builder-deploy.yml` via GitHub API
  - Shows deploy progress
  - Auto-connects to tunnel URL when ready
- [ ] Poll gist for tunnel URL
- [ ] Show remaining time badge (30 min countdown)
- [ ] "Extend" button to re-trigger deploy before timeout

### 3.4 Workstation Connection
- [ ] QR code generator on workstation (show connection URL)
- [ ] Phone scans QR → auto-connects to workstation agent
- [ ] mDNS/Bonjour discovery on local network (stretch goal)
- [ ] Connection URL format: `ws://192.168.x.x:5000/ws`

### 3.5 Multi-Backend Switching
- [ ] Settings: manage multiple backends
  ```
  Local (Ollama)     ws://127.0.0.1:5000/ws     [active]
  Workstation        ws://192.168.1.50:5000/ws   
  GitHub Actions     wss://xxx.trycloudflare.com/ws
  ```
- [ ] One-tap switch between backends
- [ ] Health check indicator per backend (green/red dot)
- [ ] Auto-failover: if active backend drops, try next

---

## Level 4: Termux-Aware Mode

### 4.1 Environment Detection
- [ ] Add `detectTermux()` function in node-server.ts
  ```js
  const isTermux = process.env.PREFIX?.includes('com.termux')
    || process.cwd().includes('/data/data/com.termux')
  ```
- [ ] Set global `TERMUX_MODE` flag
- [ ] Log: `[openllm] Termux detected — applying mobile optimizations`

### 4.2 Path Handling
- [ ] Auto-detect Termux paths:
  - Home: `/data/data/com.termux/files/home`
  - Tmp: `/data/data/com.termux/files/usr/tmp`
  - Bin: `/data/data/com.termux/files/usr/bin`
- [ ] Use `TMPDIR` env var (respect Termux sandbox)
- [ ] Don't use `/tmp` directly (EACCES on Android)

### 4.3 Memory Optimization
- [ ] Limit conversation history to 5 turns (not 10) on Termux
- [ ] Reduce `maxResultSizeChars` defaults
- [ ] Set `num_ctx: 1024` and `num_predict: 128` for Ollama on Termux
- [ ] Garbage collect conversation map when > 3 sessions
- [ ] Monitor `process.memoryUsage()` and warn at 80% RSS

### 4.4 Auto-Start Script
- [ ] Create `bin/openllm-termux.sh`:
  ```bash
  #!/data/data/com.termux/files/usr/bin/bash
  # Start Ollama if not running
  pgrep ollama || (nohup ollama serve &)
  sleep 2
  # Start OpenLLM web UI
  TMPDIR=/data/data/com.termux/files/usr/tmp \
    npx tsx src/web/node-server.ts
  ```
- [ ] Add to Termux boot (optional): `~/.termux/boot/openllm.sh`
- [ ] Termux widget shortcut: `~/.shortcuts/OpenLLM`

### 4.5 Ollama Manager
- [ ] `/api/ollama-status` endpoint:
  - Running? Model loaded? Memory usage?
- [ ] `/api/ollama-start` endpoint (POST):
  - Start Ollama if not running
- [ ] `/api/ollama-pull` endpoint (POST):
  - Pull a model: `{ model: "tinyllama" }`
- [ ] UI: Ollama status card on home page
  - Green: running + model loaded
  - Yellow: running, no model
  - Red: not running + "Start" button

---

## Level 5: Enhanced Mobile UI Features

### 5.1 Session Persistence
- [ ] Save sessions to IndexedDB (not just memory)
- [ ] Session list on home page (real data, not dummy)
- [ ] Resume session on reload
- [ ] Export session as markdown/JSON
- [ ] Delete session (swipe left or long press)

### 5.2 Settings Panel
- [ ] New "Settings" view (gear icon in sidebar)
- [ ] Provider configuration (API keys input)
- [ ] Model selection per provider
- [ ] Remote agent URL configuration
- [ ] Theme toggle (dark/light/system)
- [ ] Font size slider
- [ ] Clear all data button
- [ ] About page (version, links)

### 5.3 Notification System
- [ ] Web Push notifications (when agent finishes background task)
- [ ] In-app toast notifications (connection status, errors)
- [ ] Sound on new message (optional, with mute toggle)
- [ ] Badge count on PWA icon (unread messages)

### 5.4 Code & Markdown Rendering
- [ ] Syntax highlighting in code blocks (highlight.js or Prism)
- [ ] Copy button on code blocks
- [ ] Collapsible long code blocks
- [ ] Proper markdown table rendering
- [ ] LaTeX/math rendering (stretch goal)
- [ ] Mermaid diagram rendering (stretch goal)

### 5.5 File Operations (Mobile)
- [ ] File picker for document upload (attach button)
- [ ] Camera capture → send image to agent
- [ ] Voice input → speech-to-text → send as message
- [ ] Share intent handler (receive shared text/files from other apps)

---

## Implementation Priority

### Phase 1 — Quick Wins (1 session)
1. [ ] PWA manifest + icons + meta tags
2. [ ] Service worker (basic cache)
3. [ ] Mobile layout fix (bottom nav, safe areas, dvh)
4. [ ] Touch targets (44px minimum)
5. [ ] Termux detection + auto-paths

### Phase 2 — Usable Mobile App (1-2 sessions)
6. [ ] Remote agent connection (URL input + connect)
7. [ ] Session persistence (IndexedDB)
8. [ ] Keyboard handling (resize, scroll)
9. [ ] Settings panel (provider, theme, remote URL)
10. [ ] Ollama status/start/pull endpoints

### Phase 3 — Polished Experience (2-3 sessions)
11. [ ] Gestures (swipe, pull, long press)
12. [ ] Deploy agent button (GitHub Actions trigger)
13. [ ] Multi-backend switching
14. [ ] Code syntax highlighting
15. [ ] Push notifications

### Phase 4 — Native-Like (stretch)
16. [ ] Voice input
17. [ ] Camera capture
18. [ ] Share intent
19. [ ] QR code workstation connect
20. [ ] mDNS local discovery

---

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `src/web/public/manifest.json` | CREATE | PWA manifest |
| `src/web/public/sw.js` | CREATE | Service worker |
| `src/web/public/icon-192.png` | CREATE | PWA icon |
| `src/web/public/icon-512.png` | CREATE | PWA icon |
| `src/web/public/index.html` | MODIFY | Meta tags, mobile layout, gestures, PWA |
| `src/web/node-server.ts` | MODIFY | Termux detection, Ollama endpoints, remote mode |
| `bin/openllm-termux.sh` | CREATE | Termux launcher script |
| `src/web/public/db.js` | CREATE | IndexedDB session storage |

---

## Success Criteria

- [ ] Installable on Android home screen (PWA)
- [ ] Works offline (cached UI + stored sessions)
- [ ] Touch-friendly (no misclicks, proper keyboard handling)
- [ ] Connects to remote agent (full tools via tunnel)
- [ ] Auto-detects Termux and configures paths
- [ ] Manages Ollama from UI (start/stop/pull)
- [ ] Feels like a native app, not a website

---

*Created 2026-04-06 — OpenLLM Mobile Implementation Roadmap*
