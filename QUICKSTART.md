# CHAPERON Quick Start

## 1. Prerequisites

- Bun v1.1+ installed
- Admiral running at `http://localhost:3031` (or configured URL)
- Valid OpenAI-compatible LLM endpoint

## 2. One-Minute Setup

```bash
# Navigate to CHAPERON directory
cd /Users/freddie/src/spacemolt-chaperon

# Install dependencies
bun install

# Configure LLM (edit .env with your API key)
nano .env
# Set: OPENAI_COMPAT_BASE_URL, OPENAI_COMPAT_API_KEY, OPENAI_COMPAT_MODEL

# Start (default: http://localhost:9000)
bun run dev
```

Open http://localhost:9000 in your browser.

## 3. What You'll See

### Console Output
```
🎯 CHAPERON - SpaceMolt Orchestrator
====================================

Configuration:
  Admiral URL: http://localhost:3031
  Cycle Interval: 30000ms
  Port: 9000
  Log Buffer Size: 50

✓ Server running at http://localhost:9000
[Orchestrator] Initializing...
[Orchestrator] Initialized with 2 agents
[Orchestrator] === Cycle 1 ===
  → nudge agent_xyz: "try mining at..."
  → record_memory: agent_strategy
[Orchestrator] Cycle 1 complete: 2 actions
[Orchestrator] === Cycle 2 ===
...
```

### Dashboard (http://localhost:9000)

**Agent Cards**
- Agent name, empire, current directive
- Connection status, activity digest
- Recent actions

**Decision Log**
- Cycle number & timestamp
- LLM reasoning (first 200 chars)
- Number of actions taken

## 4. Verify Connectivity

Check console for:
- ✅ `[Orchestrator] Initialized with X agents` — Found agents
- ✅ `[LogMonitor] Starting for agent` — SSE streams connected
- ✅ `[Orchestrator] === Cycle 1 ===` — LLM decision made
- ❌ If you see `Error connecting to Admiral` — check admiral_url in chaperon.config.json

## 5. Configuration

### `chaperon.config.json`
```json
{
  "admiral_url": "http://localhost:3031",  // Change if Admiral on different host
  "cycle_interval_ms": 30000,                // 30s default, can adjust
  "port": 9000,                              // Dashboard port
  "log_monitor_buffer_size": 50              // Keep last 50 log entries per agent
}
```

### `.env`
```bash
# For OpenAI
OPENAI_COMPAT_BASE_URL=https://api.openai.com/v1
OPENAI_COMPAT_API_KEY=sk-...
OPENAI_COMPAT_MODEL=gpt-4o-mini

# For Anthropic (with compatibility wrapper)
OPENAI_COMPAT_BASE_URL=https://api.anthropic.com/v1
OPENAI_COMPAT_API_KEY=sk-ant-...
OPENAI_COMPAT_MODEL=claude-3-haiku-20240307
```

### `prompt.md`
Edit the orchestrator system prompt to change behavior:
- Decision philosophy
- Nudge vs directive policies
- Strategic goals
- No code restart required

## 6. First Test: Send a Manual Nudge

1. Open Admiral dashboard
2. Start an agent
3. Wait 30s for first CHAPERON cycle
4. Check Admiral logs for new nudge from CHAPERON

Expected in Admiral logs:
```
[system] Nudge from CHAPERON: "try mining at..."
```

## 7. Monitoring

Watch console for:
- `[LogMonitor] Agent {name} is no longer stuck` — Recovery detected
- `[LogMonitor] Agent {name} has recent errors` — Issues detected
- `→ do_nothing: All systems nominal` — No action needed (success)

## 8. Stopping

Press `Ctrl+C` to gracefully shutdown:
```
Shutting down gracefully...
[Orchestrator] Stopped
```

## 9. Production Build

```bash
bun run build

# Creates:
# - dist/    (frontend assets)
# - chaperon (standalone binary)

./chaperon
```

## 10. Troubleshooting

### Admiral not found
```
[AdmiralClient] Error listing profiles: fetch failed
```
Check `admiral_url` in `chaperon.config.json` and ensure Admiral is running.

### LLM connection failed
```
[LLM] LLM call failed (attempt 1/3): ...
```
Check `.env`:
- Valid `OPENAI_COMPAT_BASE_URL`
- Valid `OPENAI_COMPAT_API_KEY`
- Valid `OPENAI_COMPAT_MODEL`

### No agents found
```
[Orchestrator] Initialized with 0 agents
```
Create at least one agent in Admiral first.

### Agents not updating
Check:
1. Agent is running (status "connected" in Admiral)
2. Admiral logs show nudge accepted
3. Agent LLM allows external nudges

---

**Need more help?** See `README.md` for detailed API docs and examples.
