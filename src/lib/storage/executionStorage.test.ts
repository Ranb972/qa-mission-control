import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createExecution } from '../../test/executionFactory'
import {
  EXECUTION_STORAGE_KEY,
  loadExecutions,
  saveExecutions,
} from './executionStorage'

describe('executionStorage', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    window.localStorage.clear()
  })

  it('saves and loads valid executions', () => {
    const execution = createExecution()

    expect(saveExecutions([execution])).toEqual({ ok: true, error: null })
    expect(loadExecutions()).toEqual({ executions: [execution], error: null })
  })
  it('restores app-owned design fingerprints while preserving legacy runs and rejecting invalid authority', () => {
    const execution = createExecution({ testDesignFingerprint: 'a'.repeat(64) })
    expect(saveExecutions([execution]).ok).toBe(true)
    expect(loadExecutions().executions[0].testDesignFingerprint).toBe('a'.repeat(64))
    window.localStorage.setItem(EXECUTION_STORAGE_KEY, JSON.stringify([{ ...execution, testDesignFingerprint: 'provider-controlled' }]))
    expect(loadExecutions().executions).toHaveLength(0)
    window.localStorage.setItem(EXECUTION_STORAGE_KEY, JSON.stringify([{ ...execution, result: 'Not Run', executedAt: undefined }]))
    expect(loadExecutions().executions).toHaveLength(0)
  })

  it('returns a non-destructive error for corrupt JSON', () => {
    window.localStorage.setItem(EXECUTION_STORAGE_KEY, '{not valid json')

    const result = loadExecutions()

    expect(result.executions).toEqual([])
    expect(result.error).toContain('could not be read')
    expect(window.localStorage.getItem(EXECUTION_STORAGE_KEY)).toBe(
      '{not valid json',
    )
  })

  it('returns a non-destructive error for invalid saved data shape', () => {
    window.localStorage.setItem(
      EXECUTION_STORAGE_KEY,
      JSON.stringify({ executions: [] }),
    )

    const result = loadExecutions()

    expect(result.executions).toEqual([])
    expect(result.error).toContain('not in the expected format')
    expect(window.localStorage.getItem(EXECUTION_STORAGE_KEY)).toBe(
      JSON.stringify({ executions: [] }),
    )
  })

  it('loads valid records and reports invalid records without rewriting storage', () => {
    const validExecution = createExecution({ id: 'valid-execution' })
    const savedPayload = [validExecution, { id: 'missing-fields' }]

    window.localStorage.setItem(
      EXECUTION_STORAGE_KEY,
      JSON.stringify(savedPayload),
    )

    const result = loadExecutions()

    expect(result.executions).toEqual([validExecution])
    expect(result.error).toContain('Some saved executions could not be loaded')
    expect(window.localStorage.getItem(EXECUTION_STORAGE_KEY)).toBe(
      JSON.stringify(savedPayload),
    )
  })

  it('rejects missing required ids and invalid results without rewriting storage', () => {
    const validExecution = createExecution({ id: 'valid-execution' })
    const savedPayload = [
      validExecution,
      createExecution({ id: 'blank-release', releaseId: '   ' }),
      createExecution({ id: 'blank-test-case', testCaseId: '   ' }),
      { ...createExecution({ id: 'invalid-result' }), result: 'Skipped' },
    ]

    window.localStorage.setItem(
      EXECUTION_STORAGE_KEY,
      JSON.stringify(savedPayload),
    )

    const result = loadExecutions()

    expect(result.executions).toEqual([validExecution])
    expect(result.error).toContain('Some saved executions could not be loaded')
    expect(window.localStorage.getItem(EXECUTION_STORAGE_KEY)).toBe(
      JSON.stringify(savedPayload),
    )
  })

  it('rejects invalid createdAt, updatedAt, and executedAt values', () => {
    const validExecution = createExecution({ id: 'valid-execution' })
    const savedPayload = [
      validExecution,
      createExecution({ id: 'invalid-created-at', createdAt: 'not-a-date' }),
      createExecution({ id: 'invalid-updated-at', updatedAt: 'not-a-date' }),
      createExecution({ id: 'missing-executed-at', executedAt: undefined }),
      createExecution({ id: 'invalid-executed-at', executedAt: 'not-a-date' }),
      {
        ...createExecution({
          id: 'not-run-with-executed-at',
          result: 'Not Run',
        }),
        executedAt: '2026-05-07T09:00:00.000Z',
      },
    ]

    window.localStorage.setItem(
      EXECUTION_STORAGE_KEY,
      JSON.stringify(savedPayload),
    )

    const result = loadExecutions()

    expect(result.executions).toEqual([validExecution])
    expect(result.error).toContain('Some saved executions could not be loaded')
    expect(window.localStorage.getItem(EXECUTION_STORAGE_KEY)).toBe(
      JSON.stringify(savedPayload),
    )
  })

  it('defaults missing notes to an empty string', () => {
    const execution = createExecution()
    const executionWithoutNotes: Partial<typeof execution> = { ...execution }
    delete executionWithoutNotes.notes

    window.localStorage.setItem(
      EXECUTION_STORAGE_KEY,
      JSON.stringify([executionWithoutNotes]),
    )

    const result = loadExecutions()

    expect(result.executions).toEqual([
      {
        ...execution,
        notes: '',
      },
    ])
    expect(result.error).toBeNull()
  })

  it('does not throw when localStorage save fails', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => {
      throw new Error('storage blocked')
    })

    let result: ReturnType<typeof saveExecutions> | null = null

    expect(() => {
      result = saveExecutions([createExecution()])
    }).not.toThrow()
    expect(result).toEqual({
      ok: false,
      error:
        'Execution changes are visible in this session, but they could not be saved to browser storage.',
    })
  })
})
