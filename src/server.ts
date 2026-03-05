import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { getDecisionLog, getAllMemories, getLastCycleNumber, getHumanGoals, setHumanGoals } from './db'
import { admiralClient } from './admiral-client'
import { Orchestrator } from './orchestrator'

export function createServer(orchestrator: Orchestrator) {
  const app = new Hono()

  // Enable CORS
  app.use('*', cors())

  // API routes
  app.get('/api/health', (c) => {
    return c.json({ status: 'ok', timestamp: new Date().toISOString() })
  })

  app.get('/api/stats', async (c) => {
    const cycleNumber = await getLastCycleNumber()
    const memories = await getAllMemories()
    return c.json({
      cycle_number: cycleNumber,
      memory_count: memories.length,
      timestamp: new Date().toISOString(),
    })
  })

  app.get('/api/agents', async (c) => {
    const agents = await admiralClient.listProfiles()
    return c.json(agents)
  })

  app.get('/api/decisions', async (c) => {
    const limit = c.req.query('limit') ? parseInt(c.req.query('limit') as string) : 50
    const decisions = await getDecisionLog(limit)
    return c.json(decisions)
  })

  app.get('/api/decisions/stream', (c) => {
    // Server-sent events for decision log streaming
    return c.streamText(async (write) => {
      let lastCycle = await getLastCycleNumber()

      while (true) {
        const newCycle = await getLastCycleNumber()
        if (newCycle > lastCycle) {
          const decisions = await getDecisionLog(1)
          if (decisions.length > 0) {
            const decision = decisions[0]
            await write(`data: ${JSON.stringify(decision)}\n\n`)
            lastCycle = newCycle
          }
        }

        // Check every 5 seconds
        await new Promise((resolve) => setTimeout(resolve, 5000))
      }
    })
  })

  app.get('/api/memories', async (c) => {
    const memories = await getAllMemories()
    return c.json(memories)
  })

  app.get('/api/goals', async (c) => {
    const goals = await getHumanGoals()
    return c.json({ goals })
  })

  app.post('/api/goals', async (c) => {
    const { goals } = await c.req.json<{ goals: string }>()
    await setHumanGoals(goals ?? '')
    return c.json({ ok: true })
  })

  // Default route: serve frontend
  app.get('/', (c) => {
    return c.html(`
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>CHAPERON - SpaceMolt Orchestrator</title>
  <script type="importmap">
    {
      "imports": {
        "react": "https://esm.sh/react@19",
        "react-dom": "https://esm.sh/react-dom@19",
        "react-dom/client": "https://esm.sh/react-dom@19/client"
      }
    }
  </script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #0f0f0f;
      color: #e0e0e0;
      line-height: 1.5;
    }
    .container {
      max-width: 1400px;
      margin: 0 auto;
      padding: 20px;
    }
    h1 { margin-bottom: 30px; font-size: 32px; }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
      gap: 20px;
      margin-bottom: 40px;
      align-items: stretch;
    }
    .card {
      background: #1a1a1a;
      border: 1px solid #333;
      border-radius: 8px;
      padding: 20px;
      display: flex;
      flex-direction: column;
      height: 100%;
    }
    .card-header {
      flex-shrink: 0;
    }
    .card-content {
      flex: 1;
      display: flex;
      flex-direction: column;
      justify-content: flex-end;
    }
    .card-footer {
      flex-shrink: 0;
      margin-top: auto;
      padding-top: 12px;
      border-top: 1px solid #333;
    }
    .card h2 {
      font-size: 18px;
      margin-bottom: 12px;
      color: #00d4ff;
    }
    .card p {
      font-size: 14px;
      margin-bottom: 8px;
      color: #999;
    }
    .badge {
      display: inline-block;
      background: #333;
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 12px;
      margin-right: 8px;
    }
    .log-section {
      margin-top: 40px;
      border-top: 1px solid #333;
      padding-top: 20px;
    }
    .log-entry {
      background: #1a1a1a;
      border-left: 3px solid #00d4ff;
      padding: 12px;
      margin-bottom: 12px;
      border-radius: 4px;
      font-family: 'Monaco', monospace;
      font-size: 12px;
    }
    .status-online { color: #4ade80; }
    .status-offline { color: #ef4444; }
    .status-stuck { color: #eab308; }
    .todo-box {
      background: #0d0d0d;
      border: 1px solid #444;
      border-radius: 4px;
      padding: 12px;
      margin-top: 8px;
      font-family: 'Monaco', monospace;
      font-size: 12px;
      line-height: 1.4;
      max-height: 200px;
      overflow-y: auto;
      white-space: pre-wrap;
      word-wrap: break-word;
      color: #bbb;
    }
    .todo-box::-webkit-scrollbar {
      width: 6px;
    }
    .todo-box::-webkit-scrollbar-track {
      background: #1a1a1a;
      border-radius: 3px;
    }
    .todo-box::-webkit-scrollbar-thumb {
      background: #444;
      border-radius: 3px;
    }
    .todo-box::-webkit-scrollbar-thumb:hover {
      background: #555;
    }
    .goals-section {
      background: #1a1a1a;
      border: 1px solid #444;
      border-radius: 8px;
      padding: 20px;
      margin-bottom: 30px;
    }
    .goals-section h2 {
      font-size: 16px;
      color: #e0e0e0;
      margin-bottom: 10px;
    }
    .goals-section p {
      font-size: 13px;
      color: #666;
      margin-bottom: 12px;
    }
    .goals-textarea {
      width: 100%;
      background: #0d0d0d;
      border: 1px solid #444;
      border-radius: 4px;
      color: #e0e0e0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-size: 14px;
      line-height: 1.5;
      padding: 10px 12px;
      resize: vertical;
      min-height: 80px;
      outline: none;
    }
    .goals-textarea:focus {
      border-color: #00d4ff;
    }
    .goals-footer {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-top: 10px;
    }
    .save-btn {
      background: #00d4ff;
      color: #000;
      border: none;
      border-radius: 4px;
      padding: 6px 16px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
    }
    .save-btn:hover { background: #00b8d9; }
    .save-btn:disabled { background: #444; color: #888; cursor: default; }
    .save-status { font-size: 13px; color: #666; }
  </style>
</head>
<body>
  <div class="container">
    <h1>⚙️ CHAPERON</h1>
    <p style="margin-bottom: 30px; color: #666;">Orchestration layer for SpaceMolt agents</p>

    <div class="goals-section">
      <h2>Commander Goals</h2>
      <p>Set high-level objectives for the fleet. CHAPERON will use these to guide agent decisions each cycle.</p>
      <textarea class="goals-textarea" id="goals-input" placeholder="e.g. Focus on building up credits. Prioritize mining and trading. Avoid combat for now."></textarea>
      <div class="goals-footer">
        <button class="save-btn" id="save-goals-btn">Save</button>
        <span class="save-status" id="save-status"></span>
      </div>
    </div>

    <h2 style="margin-bottom: 20px; font-size: 20px;">Connected Agents</h2>
    <div class="grid" id="agents-grid">
      <p>Loading agents...</p>
    </div>

    <div class="log-section">
      <h2 style="margin-bottom: 20px; font-size: 20px;">Decision Log</h2>
      <div id="decisions-log">
        <p>Loading decisions...</p>
      </div>
    </div>
  </div>

  <script type="module">
    // Simple client-side app without React (for now)
    async function loadAgents() {
      try {
        const res = await fetch('/api/agents')
        const agents = await res.json()
        const grid = document.getElementById('agents-grid')
        grid.innerHTML = agents.map(agent => \`
          <div class="card">
            <div class="card-header">
              <h2>\${agent.name}</h2>
              <p><strong>Directive:</strong> \${agent.directive || '(none)'}</p>
            </div>
            <div class="card-content">
              \${agent.todo ? \`
                <div style="margin-top: 8px;">
                  <strong style="font-size: 13px;">TODO:</strong>
                  <div class="todo-box">\${agent.todo}</div>
                </div>
              \` : '<p style="color: #666; font-size: 13px; margin-top: 8px;"><strong>TODO:</strong> (none)</p>'}
            </div>
            <div class="card-footer">
              <span class="badge status-online">connected</span>
            </div>
          </div>
        \`).join('')
      } catch (error) {
        console.error('Error loading agents:', error)
      }
    }

    async function loadDecisions() {
      try {
        const res = await fetch('/api/decisions?limit=5')
        const decisions = await res.json()
        const log = document.getElementById('decisions-log')
        log.innerHTML = decisions.map(d => {
          const actionsList = d.actions_taken.map(a => {
            if (a.type === 'nudge_agent') {
              return \`• nudge \${a.agent_id}: "\${a.data.message}"\`
            } else if (a.type === 'set_directive') {
              return \`• set_directive \${a.agent_id}: "\${a.data.directive}"\`
            } else if (a.type === 'record_memory') {
              return \`• record_memory \${a.data.key}\`
            } else if (a.type === 'do_nothing') {
              return \`• do_nothing\`
            } else {
              return \`• \${a.type}\`
            }
          }).join('<br>')
          return \`
            <div class="log-entry">
              <strong>Cycle \${d.cycle_number}</strong> @ \${new Date(d.cycle_ts).toLocaleTimeString()}
              <br><br>
              <strong>Reasoning:</strong> \${d.reasoning.substring(0, 200)}...
              <br><br>
              <strong>Actions:</strong><br>
              \${actionsList || '(none)'}
            </div>
          \`
        }).join('')
      } catch (error) {
        console.error('Error loading decisions:', error)
      }
    }

    async function loadGoals() {
      try {
        const res = await fetch('/api/goals')
        const { goals } = await res.json()
        document.getElementById('goals-input').value = goals || ''
      } catch (error) {
        console.error('Error loading goals:', error)
      }
    }

    async function saveGoals() {
      const btn = document.getElementById('save-goals-btn')
      const status = document.getElementById('save-status')
      const goals = document.getElementById('goals-input').value
      btn.disabled = true
      status.textContent = 'Saving...'
      try {
        await fetch('/api/goals', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ goals }),
        })
        status.textContent = 'Saved ✓'
        setTimeout(() => { status.textContent = '' }, 2000)
      } catch (error) {
        status.textContent = 'Error saving'
      } finally {
        btn.disabled = false
      }
    }

    document.getElementById('save-goals-btn').addEventListener('click', saveGoals)

    loadGoals()
    loadAgents()
    loadDecisions()

    // Refresh every 10 seconds
    setInterval(loadAgents, 10000)
    setInterval(loadDecisions, 10000)
  </script>
</body>
</html>
    `)
  })

  return app
}
