import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from 'react'
import { formatDateTime } from '../../lib/formatters'
import type { TestCase } from '../test-cases/testCaseTypes'
import { getUniqueTestCaseIds } from './testSuiteFilters'
import {
  EMPTY_TEST_SUITE_FORM_VALUES,
  TEST_SUITE_TYPES,
  type TestSuite,
  type TestSuiteFormErrors,
  type TestSuiteFormValues,
} from './testSuiteTypes'

type TestSuiteFormProps = {
  mode: 'create' | 'edit'
  initialValues?: TestSuite | null
  testCases: TestCase[]
  onSubmit: (values: TestSuiteFormValues) => void
  onCancel: () => void
  headingId?: string
}

const FIELD_ERROR_IDS = {
  name: 'test-suite-name-error',
} as const

function getFormValues(initialValues?: TestSuite | null): TestSuiteFormValues {
  if (!initialValues) {
    return EMPTY_TEST_SUITE_FORM_VALUES
  }

  return {
    name: initialValues.name,
    description: initialValues.description,
    type: initialValues.type,
    testCaseIds: initialValues.testCaseIds,
  }
}

function normalizeValues(values: TestSuiteFormValues): TestSuiteFormValues {
  return {
    ...values,
    name: values.name.trim(),
    description: values.description.trim(),
    testCaseIds: getUniqueTestCaseIds(values.testCaseIds),
  }
}

function validate(values: TestSuiteFormValues): TestSuiteFormErrors {
  const errors: TestSuiteFormErrors = {}

  if (!values.name) {
    errors.name = 'Suite name is required.'
  }

  return errors
}

export function TestSuiteForm({
  mode,
  initialValues,
  testCases,
  onSubmit,
  onCancel,
  headingId,
}: TestSuiteFormProps) {
  const nameRef = useRef<HTMLInputElement>(null)
  const [values, setValues] = useState<TestSuiteFormValues>(() =>
    getFormValues(initialValues),
  )
  const [errors, setErrors] = useState<TestSuiteFormErrors>({})

  const heading = mode === 'edit' ? 'Edit Test Suite' : 'Create Test Suite'
  const submitLabel = mode === 'edit' ? 'Save changes' : 'Create suite'
  const selectedIds = getUniqueTestCaseIds(values.testCaseIds)
  const unavailableIds = selectedIds.filter(
    (testCaseId) => !testCases.some((testCase) => testCase.id === testCaseId),
  )

  useEffect(() => {
    nameRef.current?.focus()
  }, [])

  function handleFieldChange(
    event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) {
    const field = event.target.name as keyof Omit<
      TestSuiteFormValues,
      'testCaseIds'
    >

    setValues((currentValues) => ({
      ...currentValues,
      [field]: event.target.value,
    }))

    if (field === 'name' && errors.name) {
      setErrors({})
    }
  }

  function toggleTestCase(testCaseId: string) {
    setValues((currentValues) => {
      const hasTestCase = currentValues.testCaseIds.includes(testCaseId)

      return {
        ...currentValues,
        testCaseIds: hasTestCase
          ? currentValues.testCaseIds.filter((id) => id !== testCaseId)
          : [...currentValues.testCaseIds, testCaseId],
      }
    })
  }

  function removeTestCase(testCaseId: string) {
    setValues((currentValues) => ({
      ...currentValues,
      testCaseIds: currentValues.testCaseIds.filter((id) => id !== testCaseId),
    }))
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const normalizedValues = normalizeValues(values)
    const nextErrors = validate(normalizedValues)

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors)
      nameRef.current?.focus()
      return
    }

    onSubmit(normalizedValues)
  }

  return (
    <form
      className="test-case-editor-form"
      aria-label={`${heading} form`}
      noValidate
      onSubmit={handleSubmit}
    >
      <div className="panel-heading">
        <div className="panel-heading__content">
          <h3 id={headingId}>{heading}</h3>
          <p>
            Build a focused QA library such as smoke, regression, sanity, or
            feature coverage from existing test cases.
          </p>
        </div>
      </div>

      {initialValues ? (
        <div className="form-panel__meta">
          <span>Created {formatDateTime(initialValues.createdAt)}</span>
          <span>Updated {formatDateTime(initialValues.updatedAt)}</span>
        </div>
      ) : null}

      <section className="modal-form-section">
        <div className="panel-heading">
          <div className="panel-heading__content">
            <h4>Suite Details</h4>
            <p>Name the purpose of this coverage group.</p>
          </div>
        </div>

        <div className="form-grid">
          <div className="field-group field-group--full">
            <label className="field-label" htmlFor="test-suite-name">
              Suite name
            </label>
            <input
              id="test-suite-name"
              ref={nameRef}
              name="name"
              className="input"
              value={values.name}
              onChange={handleFieldChange}
              aria-invalid={Boolean(errors.name)}
              aria-describedby={errors.name ? FIELD_ERROR_IDS.name : undefined}
            />
            {errors.name ? (
              <p id={FIELD_ERROR_IDS.name} className="field-error">
                {errors.name}
              </p>
            ) : null}
          </div>

          <div className="field-group">
            <label className="field-label" htmlFor="test-suite-type">
              Suite type
            </label>
            <select
              id="test-suite-type"
              name="type"
              className="select"
              value={values.type}
              onChange={handleFieldChange}
            >
              {TEST_SUITE_TYPES.map((suiteType) => (
                <option key={suiteType} value={suiteType}>
                  {suiteType}
                </option>
              ))}
            </select>
          </div>

          <div className="field-group field-group--full">
            <label className="field-label" htmlFor="test-suite-description">
              Description
            </label>
            <textarea
              id="test-suite-description"
              name="description"
              className="textarea textarea--compact"
              value={values.description}
              onChange={handleFieldChange}
              placeholder="Example: quick confidence checks before release handoff."
            />
          </div>
        </div>
      </section>

      <section className="modal-form-section">
        <div className="panel-heading">
          <div className="panel-heading__content">
            <h4>Selected Coverage</h4>
            <p>Review the test cases currently included in this suite.</p>
          </div>
          <span className="panel-caption">
            {selectedIds.length} selected
          </span>
        </div>

        {selectedIds.length === 0 ? (
          <p className="helper-text">No test cases selected yet.</p>
        ) : (
          <div className="suite-membership-list">
            {selectedIds.map((testCaseId) => {
              const testCase = testCases.find(
                (currentTestCase) => currentTestCase.id === testCaseId,
              )
              const label = testCase?.title ?? 'Unavailable test case'

              return (
                <article key={testCaseId} className="suite-membership-item">
                  <div>
                    <span className="field-label">{label}</span>
                    {testCase ? (
                      <p className="helper-text">
                        {testCase.area} · {testCase.priority} · {testCase.type}
                      </p>
                    ) : (
                      <p className="helper-text">
                        This referenced test case no longer exists.
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    className="button button--secondary"
                    aria-label={`Remove ${label} from suite`}
                    onClick={() => removeTestCase(testCaseId)}
                  >
                    Remove
                  </button>
                </article>
              )
            })}
          </div>
        )}

        {unavailableIds.length > 0 ? (
          <p className="helper-text">
            Unavailable references are kept until you remove them from the
            suite.
          </p>
        ) : null}
      </section>

      <section className="modal-form-section">
        <div className="panel-heading">
          <div className="panel-heading__content">
            <h4>Available Test Cases</h4>
            <p>Select existing coverage to include in this suite.</p>
          </div>
        </div>

        {testCases.length === 0 ? (
          <p className="helper-text">
            Create test cases before building suite coverage.
          </p>
        ) : (
          <div className="suite-picker-list">
            {testCases.map((testCase, index) => {
              const inputId = `suite-test-case-${index}`

              return (
                <label key={testCase.id} className="suite-picker-item">
                  <input
                    id={inputId}
                    type="checkbox"
                    checked={selectedIds.includes(testCase.id)}
                    onChange={() => toggleTestCase(testCase.id)}
                  />
                  <span>
                    <span className="field-label">{testCase.title}</span>
                    <span className="helper-text">
                      {testCase.area} · {testCase.priority} · {testCase.type}
                    </span>
                  </span>
                </label>
              )
            })}
          </div>
        )}
      </section>

      <div className="modal-footer button-row">
        <button type="submit" className="button button--primary">
          {submitLabel}
        </button>
        <button
          type="button"
          className="button button--secondary"
          onClick={onCancel}
        >
          Cancel
        </button>
      </div>
    </form>
  )
}
