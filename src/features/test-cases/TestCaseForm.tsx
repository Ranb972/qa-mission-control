import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from 'react'
import { formatDateTime } from '../../lib/formatters'
import { SmartPasteStepsPanel } from './SmartPasteStepsPanel'
import {
  createTestCaseStepId,
  deriveLegacyStepFields,
  getEditableTestCaseSteps,
  normalizeTestCaseSteps,
} from './testCaseContent'
import type { SmartPasteParsedStep } from './smartPasteSteps'
import {
  TEST_CASE_PRIORITIES,
  TEST_CASE_STATUSES,
  TEST_CASE_TYPES,
  type TestCase,
  type TestCaseFormErrors,
  type TestCaseFormValues,
  type TestCaseStep,
  type TestCaseStepFormErrors,
} from './testCaseTypes'

type TestCaseFormProps = {
  mode: 'create' | 'edit'
  initialValues?: TestCase | null
  onSubmit: (values: TestCaseFormValues) => void
  onCancel: () => void
  headingId?: string
}

type RequiredTestCaseFormField = 'title' | 'area'
type StepField = 'action' | 'expectedResult'

const FIELD_ERROR_IDS: Record<RequiredTestCaseFormField, string> = {
  title: 'test-case-title-error',
  area: 'test-case-area-error',
}

function getStepErrorId(stepId: string, field: StepField) {
  return `test-case-step-${stepId}-${field}-error`
}

function getFormValues(initialValues?: TestCase | null): TestCaseFormValues {
  return {
    title: initialValues?.title ?? '',
    area: initialValues?.area ?? '',
    priority: initialValues?.priority ?? 'Medium',
    status: initialValues?.status ?? 'Not Run',
    type: initialValues?.type ?? 'Functional',
    steps: initialValues?.steps ?? '',
    expectedResult: initialValues?.expectedResult ?? '',
    preconditions: initialValues?.preconditions ?? '',
    structuredSteps: getEditableTestCaseSteps(initialValues),
  }
}

function createBlankStep(): TestCaseStep {
  return {
    id: createTestCaseStepId(),
    action: '',
    expectedResult: '',
  }
}

function isBlankStep(step: TestCaseStep) {
  return step.action.trim() === '' && step.expectedResult.trim() === ''
}

function normalizeValues(values: TestCaseFormValues): TestCaseFormValues {
  const structuredSteps = normalizeTestCaseSteps(values.structuredSteps)
  const legacyFields = deriveLegacyStepFields(structuredSteps)

  return {
    ...values,
    title: values.title.trim(),
    area: values.area.trim(),
    preconditions: values.preconditions.trim(),
    structuredSteps,
    ...legacyFields,
  }
}

function validate(values: TestCaseFormValues): TestCaseFormErrors {
  const errors: TestCaseFormErrors = {}

  if (!values.title) {
    errors.title = 'Title is required.'
  }

  if (!values.area) {
    errors.area = 'Area is required.'
  }

  values.structuredSteps.forEach((step) => {
    const stepErrors: TestCaseStepFormErrors = {}

    if (!step.action) {
      stepErrors.action = 'Step action is required.'
    }

    if (!step.expectedResult) {
      stepErrors.expectedResult = 'Step expected result is required.'
    }

    if (Object.keys(stepErrors).length > 0) {
      errors.structuredSteps = {
        ...errors.structuredSteps,
        [step.id]: stepErrors,
      }
    }
  })

  return errors
}

function hasErrors(errors: TestCaseFormErrors) {
  return (
    Boolean(errors.title) ||
    Boolean(errors.area) ||
    Boolean(errors.structuredSteps)
  )
}

export function TestCaseForm({
  mode,
  initialValues,
  onSubmit,
  onCancel,
  headingId,
}: TestCaseFormProps) {
  const titleRef = useRef<HTMLInputElement>(null)
  const areaRef = useRef<HTMLInputElement>(null)
  const stepRefs = useRef<Record<string, HTMLTextAreaElement | null>>({})
  const [values, setValues] = useState<TestCaseFormValues>(() =>
    getFormValues(initialValues),
  )
  const [errors, setErrors] = useState<TestCaseFormErrors>({})
  const [isSmartPasteOpen, setIsSmartPasteOpen] = useState(false)

  const heading = mode === 'edit' ? 'Edit Test Case' : 'Create Test Case'
  const submitLabel = mode === 'edit' ? 'Save changes' : 'Create test case'

  useEffect(() => {
    titleRef.current?.focus()
  }, [])

  function handleFieldChange(
    event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) {
    const field = event.target.name as keyof Omit<
      TestCaseFormValues,
      'structuredSteps'
    >
    const nextValue = event.target.value

    setValues((currentValues) => ({
      ...currentValues,
      [field]: nextValue,
    }))

    setErrors((currentErrors) => {
      if (field !== 'title' && field !== 'area') {
        return currentErrors
      }

      if (!currentErrors[field]) {
        return currentErrors
      }

      const nextErrors = { ...currentErrors }
      delete nextErrors[field]
      return nextErrors
    })
  }

  function handleStepChange(
    stepId: string,
    field: StepField,
    nextValue: string,
  ) {
    setValues((currentValues) => ({
      ...currentValues,
      structuredSteps: currentValues.structuredSteps.map((step) =>
        step.id === stepId ? { ...step, [field]: nextValue } : step,
      ),
    }))

    setErrors((currentErrors) => {
      if (!currentErrors.structuredSteps?.[stepId]?.[field]) {
        return currentErrors
      }

      const nextStepErrors = { ...currentErrors.structuredSteps[stepId] }
      delete nextStepErrors[field]
      const nextStructuredStepErrors = {
        ...currentErrors.structuredSteps,
        [stepId]: nextStepErrors,
      }

      if (Object.keys(nextStepErrors).length === 0) {
        delete nextStructuredStepErrors[stepId]
      }

      return {
        ...currentErrors,
        structuredSteps:
          Object.keys(nextStructuredStepErrors).length > 0
            ? nextStructuredStepErrors
            : undefined,
      }
    })
  }

  function addStep() {
    setValues((currentValues) => ({
      ...currentValues,
      structuredSteps: [...currentValues.structuredSteps, createBlankStep()],
    }))
  }

  function insertStepBelow(stepId: string) {
    setValues((currentValues) => {
      const index = currentValues.structuredSteps.findIndex(
        (step) => step.id === stepId,
      )
      const insertAt = index === -1 ? currentValues.structuredSteps.length : index + 1
      const nextSteps = [...currentValues.structuredSteps]

      nextSteps.splice(insertAt, 0, createBlankStep())

      return {
        ...currentValues,
        structuredSteps: nextSteps,
      }
    })
  }

  function moveStep(stepId: string, direction: 'up' | 'down') {
    setValues((currentValues) => {
      const currentIndex = currentValues.structuredSteps.findIndex(
        (step) => step.id === stepId,
      )
      const targetIndex =
        direction === 'up' ? currentIndex - 1 : currentIndex + 1

      if (
        currentIndex === -1 ||
        targetIndex < 0 ||
        targetIndex >= currentValues.structuredSteps.length
      ) {
        return currentValues
      }

      const nextSteps = [...currentValues.structuredSteps]
      const [movedStep] = nextSteps.splice(currentIndex, 1)

      nextSteps.splice(targetIndex, 0, movedStep)

      return {
        ...currentValues,
        structuredSteps: nextSteps,
      }
    })
  }

  function deleteStep(stepId: string) {
    setValues((currentValues) => {
      const nextSteps = currentValues.structuredSteps.filter(
        (step) => step.id !== stepId,
      )

      return {
        ...currentValues,
        structuredSteps: nextSteps.length > 0 ? nextSteps : [createBlankStep()],
      }
    })

    setErrors((currentErrors) => {
      if (!currentErrors.structuredSteps?.[stepId]) {
        return currentErrors
      }

      const nextStructuredStepErrors = { ...currentErrors.structuredSteps }
      delete nextStructuredStepErrors[stepId]

      return {
        ...currentErrors,
        structuredSteps:
          Object.keys(nextStructuredStepErrors).length > 0
            ? nextStructuredStepErrors
            : undefined,
      }
    })
  }

  function handleSmartPasteInsert(
    mode: 'append' | 'replace',
    parsedSteps: SmartPasteParsedStep[],
  ) {
    const nextSteps = parsedSteps.map((step) => ({
      id: createTestCaseStepId(),
      action: step.action,
      expectedResult: step.expectedResult,
    }))

    setValues((currentValues) => {
      const shouldReplaceBlankPlaceholder =
        mode === 'append' &&
        currentValues.structuredSteps.length === 1 &&
        isBlankStep(currentValues.structuredSteps[0])

      return {
        ...currentValues,
        structuredSteps:
          mode === 'replace' || shouldReplaceBlankPlaceholder
            ? nextSteps
            : [...currentValues.structuredSteps, ...nextSteps],
      }
    })
    setErrors((currentErrors) => ({
      ...currentErrors,
      structuredSteps: undefined,
    }))
    setIsSmartPasteOpen(false)
  }

  function focusFirstInvalidField(nextErrors: TestCaseFormErrors) {
    if (nextErrors.title) {
      titleRef.current?.focus()
      return
    }

    if (nextErrors.area) {
      areaRef.current?.focus()
      return
    }

    const invalidStep = values.structuredSteps.find(
      (step) => nextErrors.structuredSteps?.[step.id],
    )

    if (!invalidStep) {
      return
    }

    const invalidField = nextErrors.structuredSteps?.[invalidStep.id]?.action
      ? 'action'
      : 'expectedResult'

    stepRefs.current[`${invalidStep.id}-${invalidField}`]?.focus()
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const normalizedValues = normalizeValues(values)
    const nextErrors = validate(normalizedValues)

    if (hasErrors(nextErrors)) {
      setErrors(nextErrors)
      focusFirstInvalidField(nextErrors)
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
            Capture setup conditions and ordered execution steps without hiding
            preconditions inside Step 1.
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
            <h4 id="basic-details-heading">Basic Details</h4>
            <p>Core metadata for organizing and filtering this test case.</p>
          </div>
        </div>

        <div className="form-grid">
          <div className="field-group field-group--full">
            <label className="field-label" htmlFor="title">
              Title
            </label>
            <input
              id="title"
              ref={titleRef}
              name="title"
              className="input"
              value={values.title}
              onChange={handleFieldChange}
              aria-invalid={Boolean(errors.title)}
              aria-describedby={errors.title ? FIELD_ERROR_IDS.title : undefined}
            />
            {errors.title ? (
              <p id={FIELD_ERROR_IDS.title} className="field-error">
                {errors.title}
              </p>
            ) : null}
          </div>

          <div className="field-group">
            <label className="field-label" htmlFor="area">
              Area
            </label>
            <input
              id="area"
              ref={areaRef}
              name="area"
              className="input"
              value={values.area}
              onChange={handleFieldChange}
              aria-invalid={Boolean(errors.area)}
              aria-describedby={errors.area ? FIELD_ERROR_IDS.area : undefined}
            />
            {errors.area ? (
              <p id={FIELD_ERROR_IDS.area} className="field-error">
                {errors.area}
              </p>
            ) : null}
          </div>

          <div className="field-group">
            <label className="field-label" htmlFor="priority">
              Priority
            </label>
            <select
              id="priority"
              name="priority"
              className="select"
              value={values.priority}
              onChange={handleFieldChange}
            >
              {TEST_CASE_PRIORITIES.map((priority) => (
                <option key={priority} value={priority}>
                  {priority}
                </option>
              ))}
            </select>
          </div>

          <div className="field-group">
            <label className="field-label" htmlFor="type">
              Type
            </label>
            <select
              id="type"
              name="type"
              className="select"
              value={values.type}
              onChange={handleFieldChange}
            >
              {TEST_CASE_TYPES.map((testCaseType) => (
                <option key={testCaseType} value={testCaseType}>
                  {testCaseType}
                </option>
              ))}
            </select>
          </div>

          <div className="field-group">
            <label className="field-label" htmlFor="status">
              Library status
            </label>
            <select
              id="status"
              name="status"
              className="select"
              value={values.status}
              onChange={handleFieldChange}
              aria-describedby="test-case-library-status-help"
            >
              {TEST_CASE_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
            <p id="test-case-library-status-help" className="helper-text">
              Release-specific outcomes are recorded in Executions.
            </p>
          </div>
        </div>
      </section>

      <section className="modal-form-section">
        <div className="panel-heading">
          <div className="panel-heading__content">
            <h4 id="preconditions-heading">Preconditions</h4>
            <p>Visible setup requirements that should not become Step 1.</p>
          </div>
        </div>

        <div className="field-group">
          <label className="field-label" htmlFor="preconditions">
            Preconditions
          </label>
          <textarea
            id="preconditions"
            name="preconditions"
            className="textarea"
            value={values.preconditions}
            onChange={handleFieldChange}
            placeholder="Example: user account exists, test data is prepared, and the environment is available."
          />
          <p className="helper-text">
            Optional setup or data requirements. This stays separate from Step 1.
          </p>
        </div>
      </section>

      <section className="modal-form-section step-editor">
        <div className="panel-heading">
          <div className="panel-heading__content">
            <h4 id="structured-steps-heading">Execution Steps</h4>
            <p>Keep each action paired with its expected result.</p>
          </div>
          <div className="button-row">
            <button
              type="button"
              className="button button--secondary"
              onClick={() => setIsSmartPasteOpen(true)}
            >
              Smart Paste steps
            </button>
            <button
              type="button"
              className="button button--secondary"
              onClick={addStep}
            >
              Add step
            </button>
          </div>
        </div>

        {isSmartPasteOpen ? (
          <SmartPasteStepsPanel
            onInsert={handleSmartPasteInsert}
            onCancel={() => setIsSmartPasteOpen(false)}
          />
        ) : null}

        <div className="structured-step-list">
          {values.structuredSteps.map((step, index) => {
            const actionError = errors.structuredSteps?.[step.id]?.action
            const expectedResultError =
              errors.structuredSteps?.[step.id]?.expectedResult

            return (
              <section key={step.id} className="step-editor-card">
                <div className="step-editor-card__header">
                  <h5>Step {index + 1}</h5>
                  <div className="card-actions">
                    <button
                      type="button"
                      className="button button--secondary"
                      aria-label={`Insert step below Step ${index + 1}`}
                      onClick={() => insertStepBelow(step.id)}
                    >
                      Insert step below
                    </button>
                    <button
                      type="button"
                      className="button button--secondary"
                      aria-label={`Move Step ${index + 1} up`}
                      onClick={() => moveStep(step.id, 'up')}
                      disabled={index === 0}
                    >
                      Move up
                    </button>
                    <button
                      type="button"
                      className="button button--secondary"
                      aria-label={`Move Step ${index + 1} down`}
                      onClick={() => moveStep(step.id, 'down')}
                      disabled={index === values.structuredSteps.length - 1}
                    >
                      Move down
                    </button>
                    <button
                      type="button"
                      className="button button--danger"
                      aria-label={`Delete Step ${index + 1}`}
                      onClick={() => deleteStep(step.id)}
                    >
                      Delete
                    </button>
                  </div>
                </div>

                <div className="form-grid">
                  <div className="field-group field-group--full">
                    <label
                      className="field-label"
                      htmlFor={`step-${step.id}-action`}
                    >
                      Step {index + 1} action
                    </label>
                    <textarea
                      id={`step-${step.id}-action`}
                      ref={(element) => {
                        stepRefs.current[`${step.id}-action`] = element
                      }}
                      className="textarea textarea--compact"
                      value={step.action}
                      onChange={(event) =>
                        handleStepChange(step.id, 'action', event.target.value)
                      }
                      aria-invalid={Boolean(actionError)}
                      aria-describedby={
                        actionError ? getStepErrorId(step.id, 'action') : undefined
                      }
                    />
                    {actionError ? (
                      <p
                        id={getStepErrorId(step.id, 'action')}
                        className="field-error"
                      >
                        {actionError}
                      </p>
                    ) : null}
                  </div>

                  <div className="field-group field-group--full">
                    <label
                      className="field-label"
                      htmlFor={`step-${step.id}-expected-result`}
                    >
                      Step {index + 1} expected result
                    </label>
                    <textarea
                      id={`step-${step.id}-expected-result`}
                      ref={(element) => {
                        stepRefs.current[`${step.id}-expectedResult`] = element
                      }}
                      className="textarea textarea--compact"
                      value={step.expectedResult}
                      onChange={(event) =>
                        handleStepChange(
                          step.id,
                          'expectedResult',
                          event.target.value,
                        )
                      }
                      aria-invalid={Boolean(expectedResultError)}
                      aria-describedby={
                        expectedResultError
                          ? getStepErrorId(step.id, 'expectedResult')
                          : undefined
                      }
                    />
                    {expectedResultError ? (
                      <p
                        id={getStepErrorId(step.id, 'expectedResult')}
                        className="field-error"
                      >
                        {expectedResultError}
                      </p>
                    ) : null}
                  </div>
                </div>
              </section>
            )
          })}
        </div>
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
