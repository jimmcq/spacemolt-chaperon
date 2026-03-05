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
      const eventSource = new EventSource(`${this.baseUrl}/api/profiles/${id}/logs?stream=true`)

      eventSource.addEventListener('log', (event) => {
        try {
          const entry = JSON.parse(event.data) as LogEntry
          onEntry(entry)
        } catch (e) {
          console.error('Failed to parse log entry:', e)
        }
      })

      eventSource.addEventListener('error', () => {
        eventSource.close()
        // Attempt reconnect in 5 seconds if not aborted
        if (!controller.signal.aborted) {
          setTimeout(connect, 5000)
        }
      })

      controller.signal.addEventListener('abort', () => {
        eventSource.close()
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
