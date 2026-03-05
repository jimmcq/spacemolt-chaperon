# CHAPERON — Orchestration Layer for SpaceMolt Admiral

**CHAPERON** is an autonomous orchestration service that observes all your AI agents in [SpaceMolt](https://spacemolt.com), makes intelligent decisions via an LLM, and guides them through directives and nudges.

Think of it as "the guy in the chair" — continuously observing your field agents and coordinating their activities for maximum synergy.

## Features

- **Multi-Agent Observation** — Monitors all agents via live SSE log streams
- **Intelligent Decision Making** — Uses an LLM (OpenAI-compatible) to decide when to nudge or redirect agents
- **Persistent Memories** — Stores facts about agent preferences, faction dynamics, and strategic insights
- **Decision Logging** — Full audit trail of orchestrator reasoning and actions
- **Zero Admiral Changes** — Works alongside Admiral without requiring any modifications

## Architecture

```
CHAPERON (:9000)                    ADMIRAL (:3031)
──────────────────────────────────  ──────────────────────
Orchestrator (LLM loop)      ◄──►   Agent Profiles
LogMonitor (per-agent SSE)   ◄──    Activity Logs
Decision Log (SQLite)
```

Each cycle (default 30s):
1. **Observe** — Fetch all agent statuses + stream logs
2. **Decide** — LLM processes world state → tool calls
3. **Act** — Execute nudges, directives, memory updates
4. **Log** — Record reasoning + actions

## Quick Start

### Prerequisites

- Bun v1.1+ (https://bun.sh)
- Running Admiral instance (http://localhost:3031)
- OpenAI-compatible LLM endpoint + API key

### Setup

```bash
# Clone/create project
cd spacemolt-chaperon

# Install dependencies
bun install

# Configure LLM
cp .env.example .env
# Edit .env with your LLM credentials
```

### Run

```bash
# Development (hot reload)
bun run dev

# Build binary
bun run build

# Run production binary
./chaperon
```

CHAPERON will:
1. Connect to Admiral at the configured URL
2. Start log monitors for all agents
3. Begin orchestrator loop (default 30s cycles)
4. Serve dashboard at http://localhost:9000

## Configuration

### `chaperon.config.json`

```json
{
  "admiral_url": "http://localhost:3031",
  "cycle_interval_ms": 30000,
  "port": 9000,
  "log_monitor_buffer_size": 50
}
```

### `.env`

```bash
OPENAI_COMPAT_BASE_URL=https://api.openai.com/v1
OPENAI_COMPAT_API_KEY=sk-...
OPENAI_COMPAT_MODEL=gpt-4o-mini
```

Supports any OpenAI-compatible endpoint:
- **OpenAI** (GPT-4, GPT-4o-mini)
- **Anthropic** (Claude models via compat endpoint)
- **Groq** (Fast inference)
- **Ollama** (Local)

### `prompt.md`

Edit the orchestrator system prompt without code changes. Define:
- CHAPERON's strategic philosophy
- Nudge vs directive policies
- Decision criteria
- Fallback behaviors

## Dashboard

Open http://localhost:9000 to view:

- **Commander Goals** — Set high-level fleet objectives; injected into every LLM cycle
- **Agent Cards** — Name, directive, recent TODO/activity, connection status
- **Decision Log** — Recent orchestrator cycles with reasoning and actions taken

## API

All endpoints return JSON.

### Agents
```
GET /api/agents — List all connected agents with current status
GET /api/health — Server health check
```

### Decision Log
```
GET /api/decisions?limit=50 — Recent decision log entries
GET /api/decisions/stream — SSE stream of new decisions
```

### Memories
```
GET /api/memories — All stored memories with importance scores
```

### Stats
```
GET /api/stats — Orchestrator stats (cycle number, memory count, etc.)
```

## How It Works

### LogMonitor

Each agent gets a `LogMonitor` that:
- Subscribes to the agent's SSE log stream
- Maintains a ring buffer of recent entries (default 50)
- Detects "stuck" agents (no tool_call in 5+ minutes)
- Detects recent errors
- Triggers early wakeup on issues

### Orchestrator

The orchestrator loop:
1. Queries all agent statuses
2. Collects activity digests from log monitors
3. Loads remembered facts from SQLite
4. Calls LLM with world snapshot + tools
5. Executes returned tool calls (nudge, directive, memory, etc.)
6. Records decision to decision log
7. Sleeps until next cycle (or wakes early on agent issues)

### LLM Tools

The orchestrator can call:
- `nudge_agent(id, message)` — One-time suggestion
- `set_directive(id, directive)` — Persistent mission change
- `record_memory(key, fact, importance)` — Store learning
- `message_all(message)` — Broadcast to all agents
- `do_nothing(reason)` — Log reasoning for no action

### Database

SQLite schema:
- `memories` — Persistent facts (key, value, importance, timestamps)
- `decision_log` — All orchestrator cycles (reasoning, actions, agents observed)

## Strategic Examples

### Example 1: Unstuck an Agent

**Cycle 50**: Agent Zephyr stuck for 2+ hours (timeout issues)

**Action**: Nudge Zephyr to return to safe dock, check connection, resume exploration after 10 min

**Reasoning**: Network issues, not logic failure; short break + restart usually resolves

### Example 2: Coordinate Agents

**Cycle 100**: Agents Kratos (combat) and Vex (stealth) in same system, enemy faction declares war

**Actions**:
- Nudge Kratos + Vex toward faction HQ
- Record memory: "war_faction_X_ongoing"
- Suggest coordinated timing

**Reasoning**: 3x effectiveness with joint assault

### Example 3: Do Nothing

**Cycle 75**: All agents stable, making progress on directives

**Action**: `do_nothing(reason: "All systems nominal...")`

**Reasoning**: Success is quiet; forcing action introduces risk

## Troubleshooting

### Admiral Connection Failed
- Check `ADMIRAL_URL` in config
- Ensure Admiral is running
- Check CORS settings

### LLM Errors
- Verify API key in `.env`
- Check base URL is correct
- Confirm model name is valid for endpoint

### Agents Not Updating
- Check agent is running (not errored)
- Check Admiral logs for nudge/directive acceptance
- Verify agent LLM can accept nudges

## Development

```bash
# Type check
bun run type-check

# Code organization
src/
├── index.ts           # Entry point
├── types.ts           # TypeScript definitions
├── config.ts          # Config loader
├── llm.ts             # OpenAI-compat client
├── admiral-client.ts  # Admiral API wrapper
├── log-monitor.ts     # Per-agent SSE monitor
├── orchestrator.ts    # LLM loop + decision engine
├── db.ts              # SQLite layer
└── server.ts          # Hono API + HTML dashboard
```

## Notes

- **Stateless** — CHAPERON can be restarted mid-cycle without losing state (all state in Admiral + SQLite)
- **Observable** — Full decision audit trail in database
- **Extensible** — Easy to add new tools/capabilities
- **Non-Invasive** — Zero changes to Admiral required

## License

MIT
