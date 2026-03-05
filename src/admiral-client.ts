import { AgentSnapshot, LogEntry, Profile } from './types'
import { getConfig } from './config'

export class AdmiralClient {
  private baseUrl: string

  constructor() {
    this.baseUrl = getConfig().admiral_url
  }

  async listProfiles(): Promise<AgentSnapshot[]> {
    try {
      const response = await fetch(`${this.baseUrl}/api/profiles`)
      if (!response.ok) {
        throw new Error(`Failed to list profiles: ${response.statusText}`)
      }
      const profiles = (await response.json()) as Profile[]
      return profiles.map((p) => ({
        ...p,
        connected: true,
        running: true,
      }))
    } catch (error) {
      console.error('Error listing profiles:', error)
      return []
    }
  }

  async getProfile(id: string): Promise<AgentSnapshot | null> {
    try {
      const response = await fetch(`${this.baseUrl}/api/profiles/${id}`)
      if (!response.ok) {
        if (response.status === 404) return null
        throw new Error(`Failed to get profile: ${response.statusText}`)
      }
      const profile = (await response.json()) as Profile
      return {
        ...profile,
        connected: true,
        running: true,
      }
    } catch (error) {
      console.error(`Error getting profile ${id}:`, error)
      return null
    }
  }

  async updateDirective(id: string, directive: string): Promise<void> {
    try {
      const response = await fetch(`${this.baseUrl}/api/profiles/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ directive }),
      })

      if (!response.ok) {
        throw new Error(`Failed to update directive: ${response.statusText}`)
      }
    } catch (error) {
      console.error(`Error updating directive for ${id}:`, error)
      throw error
    }
  }

  async sendNudge(id: string, message: string): Promise<void> {
    try {
      const response = await fetch(`${this.baseUrl}/api/profiles/${id}/nudge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
      })

      if (response.status === 400) {
        // Agent not running, silently skip
        console.warn(`Cannot nudge agent ${id}: agent not running`)
        return
      }

      if (!response.ok) {
        throw new Error(`Failed to send nudge: ${response.statusText}`)
      }
    } catch (error) {
      console.error(`Error sending nudge to ${id}:`, error)
      throw error
    }
  }

  streamLogs(
    id: string,
    onEntry: (entry: LogEntry) => void,
    onError?: (error: Error) => void,
  ): AbortController {
    const controller = new AbortController()

    const connect = () => {
      fetch(`${this.baseUrl}/api/profiles/${id}/logs?stream=true`, {
        signal: controller.signal,
      })
        .then(async (response) => {
          if (!response.ok) {
            throw new Error(`Failed to stream logs: ${response.statusText}`)
          }

          const reader = response.body?.getReader()
          if (!reader) {
            throw new Error('Response body is not readable')
          }

          const decoder = new TextDecoder()
          let buffer = ''

          while (true) {
            const { done, value } = await reader.read()
            if (done) break

            buffer += decoder.decode(value, { stream: true })
            const lines = buffer.split('\n')
            buffer = lines.pop() || ''

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                try {
                  const entry = JSON.parse(line.slice(6)) as LogEntry
                  onEntry(entry)
                } catch (e) {
                  // Silently skip incomplete JSON (happens when data arrives in chunks)
                  // Only log if it looks like a complete but malformed JSON object
                  const json = line.slice(6)
                  if (json.endsWith('}') || json.endsWith(']')) {
                    console.error('Failed to parse log entry:', e)
                  }
                }
              }
            }
          }
        })
        .catch((error) => {
          if (error instanceof Error && error.name === 'AbortError') {
            // Normal abort, don't retry
            return
          }
          onError?.(error instanceof Error ? error : new Error(String(error)))
          // Attempt reconnect in 5 seconds if not aborted
          if (!controller.signal.aborted) {
            setTimeout(connect, 5000)
          }
        })
    }

    connect()
    return controller
  }

  async getLogs(id: string, limit = 50): Promise<LogEntry[]> {
    try {
      const response = await fetch(`${this.baseUrl}/api/profiles/${id}/logs?limit=${limit}`)
      if (!response.ok) {
        throw new Error(`Failed to get logs: ${response.statusText}`)
      }
      return (await response.json()) as LogEntry[]
    } catch (error) {
      console.error(`Error getting logs for ${id}:`, error)
      return []
    }
  }
}

export const admiralClient = new AdmiralClient()
