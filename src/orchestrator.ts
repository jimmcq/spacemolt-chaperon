import { AgentSnapshot, OrchestratorAction, LogEntry } from './types'
import { admiralClient } from './admiral-client'
import { completeWithRetry, getLLMClient } from './llm'
import { getConfig, getPrompt } from './config'
import { LogMonitor } from './log-monitor'
import {
  insertMemory,
  getAllMemories,
  insertDecisionLog,
  getLastCycleNumber,
} from './db'
import OpenAI from 'openai'

export class Orchestrator {
  private monitors: Map<string, LogMonitor> = new Map()
  private cycleInterval: number
  private cycleNumber = 0
  private running = false
  private wakeupSignal: AbortController | null = null

  constructor() {
    this.cycleInterval = getConfig().cycle_interval_ms
  }

  async initialize() {
    console.log('[Orchestrator] Initializing...')

    // Recover cycle number from database
    this.cycleNumber = await getLastCycleNumber()

    // Start log monitors for all agents
    const profiles = await admiralClient.listProfiles()
    for (const profile of profiles) {
      this.startMonitorForAgent(profile)
    }

    console.log(`[Orchestrator] Initialized with ${profiles.length} agents`)
  }

  private startMonitorForAgent(agent: AgentSnapshot) {
    if (this.monitors.has(agent.id)) {
      return
    }

    const monitor = new LogMonitor(agent.id, agent.name)

    // Early wakeup triggers
    monitor.on('stuck', () => this.wakeup())
    monitor.on('error', () => this.wakeup())

    monitor.start()
    this.monitors.set(agent.id, monitor)
  }

  async run() {
    if (this.running) {
      console.warn('[Orchestrator] Already running')
      return
    }

    this.running = true
    console.log('[Orchestrator] Starting main loop')

    while (this.running) {
      try {
        await this.executeCycle()
      } catch (error) {
        console.error('[Orchestrator] Cycle error:', error)
      }

      // Wait for next cycle or early wakeup
      await this.sleep()
    }
  }

  private async executeCycle() {
    this.cycleNumber++
    console.log(`\n[Orchestrator] === Cycle ${this.cycleNumber} ===`)

    const cycleTs = new Date().toISOString()

    try {
      // 1. Observe: Get current world snapshot
      const snapshot = await this.buildWorldSnapshot()

      // 2. Decide: LLM call with world state
      const { reasoning, actions } = await this.decide(snapshot)

      // 3. Act: Execute tool calls
      const agentsObserved = await this.executeActions(actions)

      // 4. Log: Record decision
      await insertDecisionLog({
        id: crypto.randomUUID(),
        cycle_number: this.cycleNumber,
        cycle_ts: cycleTs,
        reasoning,
        world_snapshot: JSON.stringify(snapshot),
        actions_taken: actions,
        agents_observed: agentsObserved,
        created_at: cycleTs,
      })

      console.log(
        `[Orchestrator] Cycle ${this.cycleNumber} complete: ${actions.length} actions`,
      )
    } catch (error) {
      console.error(`[Orchestrator] Failed to execute cycle ${this.cycleNumber}:`, error)
    }
  }

  private async buildWorldSnapshot() {
    const snapshot: Record<string, any> = {}

    for (const [agentId, monitor] of this.monitors.entries()) {
      const agent = await admiralClient.getProfile(agentId)
      if (!agent) continue

      snapshot[agent.name] = {
        id: agent.id,
        empire: agent.empire,
        status: agent.connected ? 'connected' : 'offline',
        running: agent.running,
        directive: agent.directive,
        isStuck: monitor.isStuck,
        hasPendingError: monitor.hasPendingError,
        digest: monitor.getDigest(),
      }
    }

    return snapshot
  }

  private async decide(snapshot: Record<string, any>) {
    const systemPrompt = getPrompt()
    const memories = await getAllMemories()

    const memoryContext = memories
      .map((m) => `[${m.key}] ${m.value}`)
      .join('\n')

    const worldSummary = Object.entries(snapshot)
      .map(([name, info]: [string, any]) => {
        return `${name}:
  Status: ${info.status}
  Running: ${info.running}
  Empire: ${info.empire}
  Directive: ${info.directive}
  Stuck: ${info.isStuck}
  Errors: ${info.hasPendingError}
  Activity:\n${info.digest
          .split('\n')
          .map((line: string) => '    ' + line)
          .join('\n')}`
      })
      .join('\n\n')

    const userMessage = `
WORLD STATE (Cycle ${this.cycleNumber})
─────────────────────────────────
${worldSummary}

REMEMBERED FACTS
────────────────
${memoryContext || '(no memories yet)'}

MAKE YOUR DECISION: Observe the world state above. Decide whether to nudge agents, update directives, record memories, or do nothing. Use your tools to execute actions.
`

    const tools: OpenAI.ChatCompletionTool[] = [
      {
        type: 'function',
        function: {
          name: 'nudge_agent',
          description: 'Send a one-time suggestion/nudge to an agent',
          parameters: {
            type: 'object' as const,
            properties: {
              agent_id: { type: 'string', description: 'Agent ID from world snapshot' },
              message: {
                type: 'string',
                description: 'Brief suggestion (e.g., "try mining at the northern asteroid belt")',
              },
            },
            required: ['agent_id', 'message'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'set_directive',
          description: 'Change an agent\'s persistent mission statement',
          parameters: {
            type: 'object' as const,
            properties: {
              agent_id: { type: 'string' },
              directive: {
                type: 'string',
                description: 'New mission statement (e.g., "focus on combat and dominate Crimson faction")',
              },
            },
            required: ['agent_id', 'directive'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'record_memory',
          description: 'Store a fact for future orchestrator cycles',
          parameters: {
            type: 'object' as const,
            properties: {
              key: {
                type: 'string',
                description: 'Memory key (e.g., "agent_strategy_solarian", "war_status_faction_x")',
              },
              fact: {
                type: 'string',
                description: 'The fact to remember',
              },
              importance: {
                type: 'number',
                description: 'Importance score (0-10)',
              },
            },
            required: ['key', 'fact'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'message_all',
          description: 'Broadcast a message to all agents (use sparingly)',
          parameters: {
            type: 'object' as const,
            properties: {
              message: {
                type: 'string',
                description: 'Message to broadcast',
              },
            },
            required: ['message'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'do_nothing',
          description: 'Take no action this cycle',
          parameters: {
            type: 'object' as const,
            properties: {
              reason: {
                type: 'string',
                description: 'Reasoning for taking no action',
              },
            },
            required: ['reason'],
          },
        },
      },
    ]

    const completion = await completeWithRetry(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      tools,
    )

    // Extract reasoning and tool calls
    let reasoning = 'No reasoning provided'
    const actions: OrchestratorAction[] = []

    for (const content of completion.content) {
      if (content.type === 'text') {
        reasoning = content.text
      }
    }

    if (completion.tool_calls) {
      for (const toolCall of completion.tool_calls) {
        if (toolCall.type === 'function') {
          const args = toolCall.function.arguments as any

          switch (toolCall.function.name) {
            case 'nudge_agent':
              actions.push({
                type: 'nudge_agent',
                agent_id: args.agent_id,
                data: { message: args.message },
              })
              break

            case 'set_directive':
              actions.push({
                type: 'set_directive',
                agent_id: args.agent_id,
                data: { directive: args.directive },
              })
              break

            case 'record_memory':
              actions.push({
                type: 'record_memory',
                data: {
                  key: args.key,
                  fact: args.fact,
                  importance: args.importance ?? 5,
                },
              })
              break

            case 'message_all':
              actions.push({
                type: 'message_all',
                data: { message: args.message },
              })
              break

            case 'do_nothing':
              actions.push({
                type: 'do_nothing',
                data: { reason: args.reason },
              })
              break
          }
        }
      }
    }

    return { reasoning, actions }
  }

  private async executeActions(actions: OrchestratorAction[]): Promise<string[]> {
    const agentsObserved = new Set<string>()

    for (const action of actions) {
      try {
        switch (action.type) {
          case 'nudge_agent': {
            const agentId = action.agent_id!
            const message = action.data.message as string
            console.log(`  → nudge ${agentId}: "${message}"`)
            await admiralClient.sendNudge(agentId, message)
            agentsObserved.add(agentId)
            break
          }

          case 'set_directive': {
            const agentId = action.agent_id!
            const directive = action.data.directive as string
            console.log(`  → set_directive ${agentId}: "${directive}"`)
            await admiralClient.updateDirective(agentId, directive)
            agentsObserved.add(agentId)
            break
          }

          case 'record_memory': {
            const key = action.data.key as string
            const fact = action.data.fact as string
            const importance = (action.data.importance as number) ?? 5
            console.log(`  → record_memory: ${key}`)
            await insertMemory(key, fact, importance)
            break
          }

          case 'message_all': {
            const message = action.data.message as string
            console.log(`  → message_all: "${message}"`)
            // TODO: implement if Admiral supports broadcast
            break
          }

          case 'do_nothing': {
            const reason = action.data.reason as string
            console.log(`  → do_nothing: ${reason}`)
            break
          }
        }
      } catch (error) {
        console.error(`Failed to execute action ${action.type}:`, error)
      }
    }

    return Array.from(agentsObserved)
  }

  private async sleep() {
    // Create a new abort controller for this sleep
    this.wakeupSignal = new AbortController()

    try {
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => resolve(), this.cycleInterval)
        this.wakeupSignal!.signal.addEventListener('abort', () => {
          clearTimeout(timeout)
          resolve()
        })
      })
    } catch (error) {
      console.error('[Orchestrator] Sleep interrupted:', error)
    }
  }

  private wakeup() {
    if (this.wakeupSignal) {
      this.wakeupSignal.abort()
    }
  }

  stop() {
    this.running = false
    for (const monitor of this.monitors.values()) {
      monitor.stop()
    }
    console.log('[Orchestrator] Stopped')
  }
}
