import { LogEntry } from './types'
import { admiralClient } from './admiral-client'
import { EventEmitter } from 'node:events'

export class LogMonitor extends EventEmitter {
  agentId: string
  agentName: string
  buffer: LogEntry[] = []
  bufferSize: number
  isStuck = false
  hasPendingError = false
  lastToolCallTime = Date.now()
  sseController: AbortController | null = null
  private lastErrorEmitTime = 0
  private lastStuckEmitTime = 0

  constructor(agentId: string, agentName: string, bufferSize = 50) {
    super()
    this.agentId = agentId
    this.agentName = agentName
    this.bufferSize = bufferSize
  }

  start() {
    console.log(`[LogMonitor] Starting for agent ${this.agentName} (${this.agentId})`)

    // Initial fetch of recent logs
    this.fetchInitialLogs()

    // Start SSE stream
    this.sseController = admiralClient.streamLogs(
      this.agentId,
      (entry) => this.onLogEntry(entry),
      (error) => this.onStreamError(error),
    )
  }

  stop() {
    if (this.sseController) {
      this.sseController.abort()
      this.sseController = null
    }
  }

  private async fetchInitialLogs() {
    try {
      const logs = await admiralClient.getLogs(this.agentId, this.bufferSize)
      this.buffer = logs
      this.updateMetrics()
    } catch (error) {
      console.error(`[LogMonitor] Failed to fetch initial logs for ${this.agentName}:`, error)
    }
  }

  private onLogEntry(entry: LogEntry) {
    // Add to buffer (FIFO, keep last N)
    this.buffer.push(entry)
    if (this.buffer.length > this.bufferSize) {
      this.buffer.shift()
    }

    this.updateMetrics()
  }

  private onStreamError(error: Error) {
    console.error(`[LogMonitor] Stream error for ${this.agentName}:`, error)
  }

  private updateMetrics() {
    // Check for recent tool calls (last 5 minutes)
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000
    const recentToolCall = this.buffer.find(
      (e) => e.type === 'tool_call' && new Date(e.timestamp).getTime() > fiveMinutesAgo,
    )

    if (recentToolCall) {
      this.lastToolCallTime = new Date(recentToolCall.timestamp).getTime()
      if (this.isStuck) {
        this.isStuck = false
        console.log(`[LogMonitor] Agent ${this.agentName} is no longer stuck`)
      }
    } else {
      const timeSinceLastToolCall = Date.now() - this.lastToolCallTime
      const isNowStuck = timeSinceLastToolCall > 5 * 60 * 1000

      if (isNowStuck && !this.isStuck) {
        this.isStuck = true
        this.emit('stuck', this.agentId)

        // Rate limit stuck emissions (max once per 30s)
        const now = Date.now()
        if (now - this.lastStuckEmitTime > 30_000) {
          this.lastStuckEmitTime = now
          console.warn(`[LogMonitor] Agent ${this.agentName} appears stuck`)
        }
      }
    }

    // Check for recent errors
    const oneMinuteAgo = Date.now() - 60 * 1000
    const recentError = this.buffer.find(
      (e) => e.type === 'error' && new Date(e.timestamp).getTime() > oneMinuteAgo,
    )

    if (recentError) {
      if (!this.hasPendingError) {
        this.hasPendingError = true
        this.emit('error', this.agentId)

        // Rate limit error emissions (max once per 30s)
        const now = Date.now()
        if (now - this.lastErrorEmitTime > 30_000) {
          this.lastErrorEmitTime = now
          console.warn(`[LogMonitor] Agent ${this.agentName} has recent errors`)
        }
      }
    } else {
      this.hasPendingError = false
    }
  }

  getDigest(): string {
    if (this.buffer.length === 0) {
      return 'No activity recorded'
    }

    // Group by type and summarize
    const summary: Record<string, number> = {}
    const recentEntries: string[] = []

    for (const entry of this.buffer) {
      if (!entry.type || !entry.timestamp) continue
      summary[entry.type] = (summary[entry.type] || 0) + 1

      // Keep last 10 entries as text
      if (recentEntries.length < 10) {
        const ts = new Date(entry.timestamp)
        if (isNaN(ts.getTime())) continue
        const content = entry.content ? `: ${entry.content.slice(0, 80)}` : ''
        recentEntries.push(`[${ts.toLocaleTimeString()}] ${entry.type}${content}`)
      }
    }

    const summaryText = Object.entries(summary)
      .map(([type, count]) => `${count} ${type}`)
      .join(', ')

    const recentText = recentEntries.reverse().join('\n')

    return `Activity Summary: ${summaryText}\n\nRecent Activity:\n${recentText}`
  }

  getStatus() {
    return {
      agentId: this.agentId,
      agentName: this.agentName,
      isStuck: this.isStuck,
      hasPendingError: this.hasPendingError,
      bufferLength: this.buffer.length,
      lastActivity: this.buffer[this.buffer.length - 1]?.timestamp || 'never',
    }
  }
}
