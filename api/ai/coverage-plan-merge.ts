import { handleAiCoveragePlanMergeBackendRequest } from '../../src/features/ai-suggestions/aiCoveragePlanMergeBackendContract'
import { createGroqAiCoveragePlanMergeProviderFromEnv } from './groqProvider'

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
  const { provider } = createGroqAiCoveragePlanMergeProviderFromEnv(
    process.env,
  )
  const result = await handleAiCoveragePlanMergeBackendRequest(
    {
      method: request.method,
      headers: request.headers,
      body: request.body,
    },
    { provider },
  )

  response.status(result.status).json(result.body)
}
