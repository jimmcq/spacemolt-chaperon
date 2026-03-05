import OpenAI from 'openai'
import { getLLMConfig } from './config'

let llmClient: OpenAI | null = null

export function createLLMClient(): OpenAI {
  if (llmClient) return llmClient

  const config = getLLMConfig()

  if (!config.apiKey) {
    throw new Error('OPENAI_COMPAT_API_KEY environment variable is required')
  }

  llmClient = new OpenAI({
    baseURL: config.baseURL,
    apiKey: config.apiKey,
  })

  return llmClient
}

export function getLLMClient(): OpenAI {
  return createLLMClient()
}

export async function completeWithRetry(
  messages: OpenAI.ChatCompletionMessageParam[],
  tools: OpenAI.ChatCompletionTool[],
  maxRetries = 3,
): Promise<OpenAI.ChatCompletion> {
  const config = getLLMConfig()
  const client = createLLMClient()
  let lastError: Error | null = null

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await client.chat.completions.create({
        model: config.model,
        messages,
        tools,
        tool_choice: 'auto',
        stream: false,
        temperature: 0.7,
        timeout: 300_000, // 5 minutes
      })

      return response
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))

      // Calculate backoff: 1s, 2s, 4s
      const backoffMs = Math.pow(2, attempt) * 1000
      console.error(
        `LLM call failed (attempt ${attempt + 1}/${maxRetries}): ${lastError.message}. Retrying in ${backoffMs}ms...`,
      )

      if (attempt < maxRetries - 1) {
        await new Promise((resolve) => setTimeout(resolve, backoffMs))
      }
    }
  }

  throw new Error(`LLM call failed after ${maxRetries} retries: ${lastError?.message}`)
}
