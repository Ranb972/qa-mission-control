import type { QaSourceStatus, QaSourceType } from '../qa-sources/qaSourceTypes'
import type {
  TestCasePriority,
  TestCaseStep,
  TestCaseType,
} from '../test-cases/testCaseTypes'

export const AI_SUGGESTION_STATUSES = [
  'ready',
  'needs_review',
  'rejected',
] as const

export type AiSuggestionStatus = (typeof AI_SUGGESTION_STATUSES)[number]

export type PackedQaSourceContext = {
  qaSourceId: string
  title: string
  sourceType: QaSourceType
  status: QaSourceStatus
  updatedAt: string
  content: string
  originalCharacterCount: number
  packedCharacterCount: number
  maxCharacterCount: number
  truncated: boolean
  preview: string
  privacySummary: {
    included: string[]
    excluded: string[]
    message: string
  }
}

export type AiSuggestionRequest = {
  source: PackedQaSourceContext
  prompt: string
  responseSchema: string
}

export type AiTestCaseSuggestion = {
  id: string
  qaSourceId: string
  status: AiSuggestionStatus
  title: string
  area: string
  priority: TestCasePriority
  type: TestCaseType
  preconditions: string
  structuredSteps: TestCaseStep[]
  evidence: string[]
  assumptions: string[]
  warnings: string[]
}

export type ParseAiSuggestionResult = {
  ok: boolean
  suggestions: AiTestCaseSuggestion[]
  error: string | null
  warnings: string[]
}

export type AiSuggestionProvider = {
  isAvailable: boolean
  unavailableReason?: string
  generateTestCaseSuggestions: (
    request: AiSuggestionRequest,
    options?: { signal?: AbortSignal },
  ) => Promise<unknown>
}
