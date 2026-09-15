import { handleAiSuggestionBackendRequest } from '../../src/features/ai-suggestions/aiSuggestionBackendContract'
import { createGroqAiSuggestionProviderFromEnv } from './groqProvider'

type VercelLikeRequest = {
  method?: string
  headers?: Record<string, string | string[] | undefined>
  body?: unknown
}

type VercelLikeResponse = {
  status: (statusCode: number) => {
    json: (body: unknown) => void
  }
}

export default async function handler(
  request: VercelLikeRequest,
  response: VercelLikeResponse,
) {
  const { provider, sourceMaxCharacters } =
    createGroqAiSuggestionProviderFromEnv(process.env)
  const result = await handleAiSuggestionBackendRequest(
    {
      method: request.method,
      headers: request.headers,
      body: request.body,
    },
    {
      provider,
      sourceMaxCharacters,
    },
  )

  response.status(result.status).json(result.body)
}
