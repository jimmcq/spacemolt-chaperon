# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

**CHAPERON** is an autonomous orchestration service for SpaceMolt that observes all AI agents, makes intelligent decisions via an LLM, and guides them through nudges and directives. It acts as a centralized coordinator ("the guy in the chair") for multi-agent fleet management without requiring changes to Admiral.

## Common Commands

```bash
# Development (with hot reload)
bun run dev

# Type checking (TypeScript validation)
bun run type-check

# Production build (creates dist/ and standalone binary)
bun run build

# Run production binary
./chaperon

# Install dependencies
bun install
```

## Architecture

CHAPERON uses a **cycle-based decision loop** with three main layers:

### 1. LogMonitor (per-agent streaming)
- File: `src/log-monitor.ts`
- Subscribes to SSE log streams from Admiral for each agent
- Maintains a ring buffer of recent log entries (default 50)
- Detects stuck agents (no tool_call in 5+ minutes)
- Detects errors and triggers early wakeup on issues
- Emits `'stuck'` and `'error'` events to signal orchestrator

### 2. Orchestrator (LLM decision engine)
- File: `src/orchestrator.ts`
- Main loop runs every 30s (configurable via `chaperon.config.json`)
- Each cycle: observe agent state → LLM decision → execute actions
- Loads current world state: agent snapshots, activity digests, memories
- Calls LLM with system prompt (from `prompt.md`) + tool definitions
- Executes tool calls returned by LLM (nudge, directive, memory, etc.)
- Logs all decisions to SQLite for audit trail
- Can be woken early by LogMonitor on agent issues

### 3. Server & API (dashboard + REST endpoints)
- File: `src/server.ts`
- Hono web framework on configurable port (default 9000)
- Serves React frontend dashboard + REST API
- API endpoints: `/api/agents`, `/api/decisions`, `/api/memories`, `/api/stats`
- SSE stream at `/api/decisions/stream` for live decision updates

### Database
- File: `src/db.ts`
- Bun SQLite (bundled, no external DB needed)
- Location: `data/chaperon.db` (auto-created)
- Tables: `memories`, `decision_log`
- WAL mode enabled for concurrent access

## Key Files

| File | Purpose |
|------|---------|
| `src/index.ts` | Entry point; initializes orchestrator, server, and signal handlers |
| `src/types.ts` | TypeScript definitions (shared with Admiral) |
| `src/config.ts` | Loads `chaperon.config.json` and `.env` variables |
| `src/admiral-client.ts` | HTTP/SSE client for Admiral API |
| `src/llm.ts` | OpenAI-compatible client with retry logic |
| `src/orchestrator.ts` | Decision loop + tool handlers |
| `src/log-monitor.ts` | Per-agent SSE log subscription + stuck/error detection |
| `src/db.ts` | SQLite migrations and queries |
| `src/server.ts` | Hono server, API routes, and React dashboard |
| `prompt.md` | System prompt for LLM decisions (edit without code restart) |
| `chaperon.config.json` | Config: Admiral URL, cycle interval, port, buffer size |

## Configuration

### `chaperon.config.json`
Controls orchestrator behavior:
- `admiral_url` — Admiral instance URL (default: `http://localhost:3031`)
- `cycle_interval_ms` — Time between decision cycles (default: 30000ms)
- `port` — Dashboard port (default: 9000)
- `log_monitor_buffer_size` — Entries kept per agent (default: 50)

### `.env`
LLM connection (required):
- `OPENAI_COMPAT_BASE_URL` — API endpoint (e.g., https://api.openai.com/v1)
- `OPENAI_COMPAT_API_KEY` — API key
- `OPENAI_COMPAT_MODEL` — Model name (e.g., gpt-4o-mini, claude-3-haiku-20240307)

Supports any OpenAI-compatible endpoint: OpenAI, Anthropic, Groq, Ollama, etc.

### `prompt.md`
The orchestrator system prompt. Edit to change CHAPERON's strategic philosophy without code changes. Defines:
- Decision criteria and nudge vs directive policies
- Strategic goals and fallback behaviors

## Development Setup

1. Prerequisites: Bun v1.1+, Admiral running on configured URL
2. Install: `bun install`
3. Configure `.env` with LLM credentials
4. Run: `bun run dev`
5. Dashboard: http://localhost:9000

## How the Decision Loop Works

1. **Observe** (orchestrator.ts:50+)
   - Fetch all agent profiles from Admiral
   - Get activity digest from each agent's LogMonitor
   - Load all stored memories from SQLite

2. **Decide** (orchestrator.ts:80+)
   - Build world snapshot JSON with agent states
   - Call LLM with prompt + snapshot + tool definitions
   - Parse returned tool calls

3. **Act** (orchestrator.ts:120+)
   - Execute nudge_agent → Admiral nudge API
   - Execute set_directive → Admiral directive API
   - Execute record_memory → insert into SQLite
   - Execute message_all → send to all agents
   - Execute do_nothing → just log reasoning

4. **Log** (orchestrator.ts:150+)
   - Insert decision_log entry with cycle number, reasoning, actions, agents observed
   - Update decision_log SQLite table

## Testing and Debugging

- **Type checking**: `bun run type-check`
- **Console output**: Watch for `[Orchestrator]`, `[LogMonitor]`, `[LLM]` prefixes
- **Decision log**: Check SQLite (`data/chaperon.db`) or `/api/decisions` endpoint
- **Agent activity**: View `/api/agents` for agent snapshots with error counts
- **Dashboard**: http://localhost:9000 shows live agent cards, decisions, and memories
- **Stuck detection**: LogMonitor emits if no tool_call for 5+ minutes
- **Early wakeup**: On agent stuck/error, orchestrator breaks sleep and cycles immediately

## Key Integration Points

- **Admiral API**: HTTP calls to fetch profiles, stream logs, send nudges/directives (admiral-client.ts)
- **LLM API**: OpenAI-compatible messages endpoint with retries (llm.ts)
- **Database**: Bun SQLite for persistent memories and audit trail (db.ts)
- **Frontend**: React + Tailwind dashboard built with Vite, served by Hono

## Notes

- **Stateless on restart**: All state in Admiral + SQLite; CHAPERON can be restarted mid-cycle
- **No Admiral changes needed**: Works as external service alongside Admiral
- **Observable decisions**: Full audit trail in decision_log; reasoning stored for inspection
- **Extensible tools**: Easy to add new tool handlers in orchestrator.ts
