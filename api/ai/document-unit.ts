import { handleUnitAnalysisRequest } from '../../src/features/document-intelligence/unitAnalysisContract'
import { createGroqDocumentUnitProviderFromEnv } from './groqDocumentUnit'

export default async function handler(request: { method?: string; body?: unknown }, response: { status: (code: number) => { json: (body: unknown) => void } }) {
  const result = await handleUnitAnalysisRequest(request, createGroqDocumentUnitProviderFromEnv(process.env))
  response.status(result.status).json(result.body)
}
