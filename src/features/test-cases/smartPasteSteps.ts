export type SmartPasteConfidence =
  | 'High confidence'
  | 'Medium confidence'
  | 'Needs review'

export type SmartPasteParsedStep = {
  action: string
  expectedResult: string
  warnings: string[]
  confidence: SmartPasteConfidence
}

export type SmartPasteParseResult = {
  steps: SmartPasteParsedStep[]
  warnings: string[]
  invalidLines: string[]
}

const STRONG_SEPARATORS = ['|', '=>', '->', '—'] as const
const SPACED_DASH_SEPARATOR = ' - '
const MISSING_EXPECTED_WARNING =
  'Expected result is missing. Fill it in before saving this test case.'

function normalizeInput(input: string) {
  return input
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
}

function getMeaningfulLines(input: string) {
  return normalizeInput(input)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}

function stripNumberedPrefix(line: string) {
  const numericMatch = line.match(/^\s*\d+\s*[.)]\s*(.+)$/u)

  if (numericMatch?.[1]) {
    return numericMatch[1].trim()
  }

  const labeledMatch = line.match(/^\s*(?:Step|צעד)\s*\d+\s*[:.)]?\s*(.+)$/iu)

  if (labeledMatch?.[1]) {
    return labeledMatch[1].trim()
  }

  return null
}

function parseActionLabel(line: string) {
  const match = line.match(/^\s*(?:Step|צעד)\s*\d+\s*[:.)]?\s*(.+)$/iu)
  return match?.[1]?.trim() ?? null
}

function parseExpectedLabel(line: string) {
  const match = line.match(
    /^\s*(?:Expected(?:\s+Result)?|תוצאה צפויה)\s*:?\s*(.+)$/iu,
  )
  return match?.[1]?.trim() ?? null
}

function splitWithSeparator(value: string, separator: string) {
  const separatorIndex = value.indexOf(separator)

  if (separatorIndex < 0) {
    return null
  }

  const action = value.slice(0, separatorIndex).trim()
  const expectedResult = value
    .slice(separatorIndex + separator.length)
    .trim()

  if (!action || !expectedResult) {
    return null
  }

  return {
    action,
    expectedResult,
  }
}

function splitActionAndExpected(value: string) {
  for (const separator of STRONG_SEPARATORS) {
    const result = splitWithSeparator(value, separator)

    if (result) {
      return result
    }
  }

  return splitWithSeparator(value, SPACED_DASH_SEPARATOR)
}

function parseTabDelimitedLine(line: string) {
  if (!line.includes('\t')) {
    return null
  }

  const fields = line.split('\t').map((field) => field.trim())
  const populatedFields = fields.filter(Boolean)

  if (populatedFields.length < 2) {
    return null
  }

  if (/^\d+[.)]?$/.test(populatedFields[0]) && populatedFields.length >= 3) {
    const action = populatedFields[1]
    const expectedResult = populatedFields.slice(2).join(' ').trim()

    if (action && expectedResult) {
      return createCompleteStep(action, expectedResult, 'High confidence')
    }
  }

  const action = populatedFields[0]
  const expectedResult = populatedFields.slice(1).join(' ').trim()

  if (!action || !expectedResult) {
    return null
  }

  return createCompleteStep(action, expectedResult, 'Medium confidence')
}

function createCompleteStep(
  action: string,
  expectedResult: string,
  confidence: SmartPasteConfidence,
): SmartPasteParsedStep {
  return {
    action,
    expectedResult,
    warnings: [],
    confidence,
  }
}

function createStepNeedingReview(action: string): SmartPasteParsedStep {
  return {
    action,
    expectedResult: '',
    warnings: [MISSING_EXPECTED_WARNING],
    confidence: 'Needs review',
  }
}

function summarizeWarnings(
  steps: SmartPasteParsedStep[],
  invalidLines: string[],
) {
  const warnings: string[] = []
  const stepsNeedingReview = steps.filter(
    (step) => step.expectedResult.trim() === '',
  ).length

  if (stepsNeedingReview > 0) {
    warnings.push(
      `${stepsNeedingReview} ${stepsNeedingReview === 1 ? 'step needs' : 'steps need'} expected results before saving.`,
    )
  }

  if (invalidLines.length > 0) {
    warnings.push(
      `${invalidLines.length} ${invalidLines.length === 1 ? 'line was' : 'lines were'} not recognized.`,
    )
  }

  return warnings
}

export function parseSmartPasteSteps(input: string): SmartPasteParseResult {
  const lines = getMeaningfulLines(input)
  const steps: SmartPasteParsedStep[] = []
  const invalidLines: string[] = []

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    const tabDelimitedStep = parseTabDelimitedLine(line)

    if (tabDelimitedStep) {
      steps.push(tabDelimitedStep)
      continue
    }

    const labeledAction = parseActionLabel(line)

    if (labeledAction) {
      const expectedResult =
        index + 1 < lines.length ? parseExpectedLabel(lines[index + 1]) : null

      if (expectedResult) {
        steps.push(
          createCompleteStep(labeledAction, expectedResult, 'High confidence'),
        )
        index += 1
        continue
      }

      const separatorResult = splitActionAndExpected(labeledAction)

      if (separatorResult) {
        steps.push(
          createCompleteStep(
            separatorResult.action,
            separatorResult.expectedResult,
            'Medium confidence',
          ),
        )
        continue
      }

      steps.push(createStepNeedingReview(labeledAction))
      continue
    }

    if (parseExpectedLabel(line)) {
      invalidLines.push(line)
      continue
    }

    const numberedContent = stripNumberedPrefix(line)
    const separatorSource = numberedContent ?? line
    const separatorResult = splitActionAndExpected(separatorSource)

    if (separatorResult) {
      steps.push(
        createCompleteStep(
          separatorResult.action,
          separatorResult.expectedResult,
          numberedContent ? 'High confidence' : 'Medium confidence',
        ),
      )
      continue
    }

    if (numberedContent) {
      steps.push(createStepNeedingReview(numberedContent))
      continue
    }

    invalidLines.push(line)
  }

  return {
    steps,
    warnings: summarizeWarnings(steps, invalidLines),
    invalidLines,
  }
}
