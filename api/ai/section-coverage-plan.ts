import { handleAiSectionCoveragePlanBackendRequest } from '../../src/features/ai-suggestions/aiSectionCoveragePlanBackendContract'
import { createGroqAiSectionCoveragePlanProviderFromEnv } from './groqProvider'

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
    createGroqAiSectionCoveragePlanProviderFromEnv(process.env)
  const result = await handleAiSectionCoveragePlanBackendRequest(
    {
      method: request.method,
      headers: request.headers,
      body: request.body,
    },
    { provider, sourceMaxCharacters },
  )

  response.status(result.status).json(result.body)
}
