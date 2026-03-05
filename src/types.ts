/**
 * Shared types between CHAPERON and Admiral
 */

// Copied from Admiral src/shared/types.ts
export type LogType =
  | 'llm_call'
  | 'tool_call'
  | 'server_response'
  | 'error'
  | 'system'

export interface LogEntry {
  id: string
  profile_id: string
  timestamp: string
  type: LogType
  title: string
  content: string
  metadata?: Record<string, unknown>
}

export interface Profile {
  id: string
  name: string
  username: string
  password: string
  provider: string
  model: string
  empire: 'solarian' | 'voidborn' | 'crimson' | 'nebula' | 'outerrim'
  directive: string
  server_url: string
  connection_mode: string
  context_budget?: number
  todo?: string
  created_at: string
  updated_at: string
}

// CHAPERON-specific extensions
export interface AgentSnapshot extends Profile {
  connected: boolean
  running: boolean
  activity?: string
  last_activity_at?: string
  error_count?: number
  is_stuck?: boolean
  has_pending_error?: boolean
}

// Orchestrator decision types
export type OrchestratorActionType =
  | 'nudge_agent'
  | 'set_directive'
  | 'record_memory'
  | 'message_all'
  | 'do_nothing'

export interface OrchestratorAction {
  type: OrchestratorActionType
  agent_id?: string
  data: Record<string, unknown>
}

export interface DecisionLogEntry {
  id: string
  cycle_number: number
  cycle_ts: string
  reasoning: string
  world_snapshot: string
  actions_taken: OrchestratorAction[]
  agents_observed: string[]
  created_at: string
}

export interface Memory {
  id: string
  key: string
  value: string
  importance: number
  last_updated: string
  created_at: string
}

export interface ChaperonConfig {
  admiral_url: string
  cycle_interval_ms: number
  port: number
  log_monitor_buffer_size: number
}
