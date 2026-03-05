import { Orchestrator } from './orchestrator'
import { createServer } from './server'
import { getConfig } from './config'

async function main() {
  console.log('🎯 CHAPERON - SpaceMolt Orchestrator')
  console.log('====================================\n')

  const config = getConfig()
  console.log('Configuration:')
  console.log(`  Admiral URL: ${config.admiral_url}`)
  console.log(`  Cycle Interval: ${config.cycle_interval_ms}ms`)
  console.log(`  Port: ${config.port}`)
  console.log(`  Log Buffer Size: ${config.log_monitor_buffer_size}\n`)

  // Initialize orchestrator
  const orchestrator = new Orchestrator()
  await orchestrator.initialize()

  // Start server
  const app = createServer(orchestrator)
  const server = Bun.serve({
    port: config.port,
    fetch: app.fetch,
    onError: (error) => {
      console.error('Server error:', error)
    },
  })

  console.log(`✓ Server running at http://localhost:${config.port}`)

  // Start orchestrator loop
  orchestrator.run().catch(console.error)

  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\n\nShutting down gracefully...')
    orchestrator.stop()
    server.stop()
    process.exit(0)
  })
}

main().catch(console.error)
