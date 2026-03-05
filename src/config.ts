import { ChaperonConfig } from './types'
import { readFileSync } from 'fs'
import { join } from 'path'

let cachedConfig: ChaperonConfig | null = null

export function getConfig(): ChaperonConfig {
  if (cachedConfig) return cachedConfig

  try {
    const configPath = join(process.cwd(), 'chaperon.config.json')
    const configFile = readFileSync(configPath, 'utf-8')
    cachedConfig = JSON.parse(configFile) as ChaperonConfig
  } catch (e) {
    // Fallback to defaults if config file not found
    cachedConfig = {
      admiral_url: process.env.ADMIRAL_URL || 'http://localhost:3031',
      cycle_interval_ms: parseInt(process.env.CYCLE_INTERVAL_MS || '30000'),
      port: parseInt(process.env.CHAPERON_PORT || '9000'),
      log_monitor_buffer_size: parseInt(process.env.LOG_MONITOR_BUFFER_SIZE || '50'),
    }
  }

  return cachedConfig
}

export function getLLMConfig() {
  return {
    baseURL: process.env.OPENAI_COMPAT_BASE_URL || 'https://api.openai.com/v1',
    apiKey: process.env.OPENAI_COMPAT_API_KEY || '',
    model: process.env.OPENAI_COMPAT_MODEL || 'gpt-4o-mini',
  }
}

export function getPrompt(): string {
  try {
    const promptPath = join(process.cwd(), 'prompt.md')
    return readFileSync(promptPath, 'utf-8')
  } catch (e) {
    return 'You are CHAPERON, the orchestrator for AI agents playing SpaceMolt.'
  }
}
