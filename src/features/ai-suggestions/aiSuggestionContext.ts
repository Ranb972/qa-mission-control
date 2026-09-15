import type { QaSource } from '../qa-sources/qaSourceTypes'
import type { PackedQaSourceContext } from './aiSuggestionTypes'

export const AI_SOURCE_CONTEXT_MAX_CHARACTERS = 12_000
const AI_SOURCE_CONTEXT_PREVIEW_CHARACTERS = 900

type PackQaSourceOptions = {
  maxCharacterCount?: number
  previewCharacterCount?: number
}

function truncateValue(value: string, maxLength: number) {
  if (value.length <= maxLength) {
    return {
      value,
      truncated: false,
    }
  }

  return {
    value: value.slice(0, maxLength).trimEnd(),
    truncated: true,
  }
}

export function packQaSourceForAiSuggestions(
  source: QaSource,
  options: PackQaSourceOptions = {},
): PackedQaSourceContext {
  const maxCharacterCount =
    options.maxCharacterCount ?? AI_SOURCE_CONTEXT_MAX_CHARACTERS
  const previewCharacterCount =
    options.previewCharacterCount ?? AI_SOURCE_CONTEXT_PREVIEW_CHARACTERS
  const packedContent = truncateValue(source.content, maxCharacterCount)
  const preview = truncateValue(packedContent.value, previewCharacterCount)

  return {
    qaSourceId: source.id,
    title: source.title,
    sourceType: source.sourceType,
    status: source.status,
    updatedAt: source.updatedAt,
    content: packedContent.value,
    originalCharacterCount: source.content.length,
    packedCharacterCount: packedContent.value.length,
    maxCharacterCount,
    truncated: packedContent.truncated,
    preview: preview.truncated ? `${preview.value}...` : preview.value,
    privacySummary: {
      included: [
        'selected QA Source title',
        'selected QA Source type and status',
        'selected QA Source updated date',
        'selected QA Source content',
      ],
      excluded: [
        'other QA Sources',
        'Test Cases',
        'Test Suites',
        'Executions',
        'Bugs',
        'Risks',
        'Releases',
        'Release Reports',
        'browser storage outside the selected source',
        'API keys',
      ],
      message:
        'AI generation sends only the selected saved QA Source content and metadata shown here to the secure backend provider. Review the source first because secrets pasted into this source text would be included.',
    },
  }
}
