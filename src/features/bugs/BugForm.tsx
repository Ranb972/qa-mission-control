import { useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { formatDateTime } from '../../lib/formatters'
import type { TestCase } from '../test-cases/testCaseTypes'
import {
  BUG_SEVERITIES,
  BUG_STATUSES,
  EMPTY_BUG_FORM_VALUES,
  type Bug,
  type BugFormErrors,
  type BugFormValues,
} from './bugTypes'

type BugFormProps = {
  mode: 'create' | 'edit'
  initialValues?: Bug | null
  testCases: TestCase[]
  onSubmit: (values: BugFormValues) => void
  onCancel: () => void
}

type RequiredBugFormField =
  | 'title'
  | 'description'
  | 'stepsToReproduce'
  | 'expectedBehavior'
  | 'actualBehavior'

const REQUIRED_FIELD_ORDER: RequiredBugFormField[] = [
  'title',
  'description',
  'stepsToReproduce',
  'expectedBehavior',
  'actualBehavior',
]

const FIELD_ERROR_IDS: Record<RequiredBugFormField, string> = {
  title: 'bug-title-error',
  description: 'bug-description-error',
  stepsToReproduce: 'bug-steps-to-reproduce-error',
  expectedBehavior: 'bug-expected-behavior-error',
  actualBehavior: 'bug-actual-behavior-error',
}

function getFormValues(initialValues?: Bug | null): BugFormValues {
  if (!initialValues) {
    return EMPTY_BUG_FORM_VALUES
  }

  return {
    title: initialValues.title,
    description: initialValues.description,
    severity: initialValues.severity,
    status: initialValues.status,
    testCaseId: initialValues.testCaseId,
    stepsToReproduce: initialValues.stepsToReproduce,
    expectedBehavior: initialValues.expectedBehavior,
    actualBehavior: initialValues.actualBehavior,
  }
}

function normalizeValues(values: BugFormValues): BugFormValues {
  return {
    ...values,
    title: values.title.trim(),
    description: values.description.trim(),
    testCaseId: values.testCaseId || undefined,
    stepsToReproduce: values.stepsToReproduce.trim(),
    expectedBehavior: values.expectedBehavior.trim(),
    actualBehavior: values.actualBehavior.trim(),
  }
}

function validate(values: BugFormValues): BugFormErrors {
  const errors: BugFormErrors = {}

  if (!values.title) {
    errors.title = 'Title is required.'
  }

  if (!values.description) {
    errors.description = 'Description is required.'
  }

  if (!values.stepsToReproduce) {
    errors.stepsToReproduce = 'Steps to reproduce are required.'
  }

  if (!values.expectedBehavior) {
    errors.expectedBehavior = 'Expected behavior is required.'
  }

  if (!values.actualBehavior) {
    errors.actualBehavior = 'Actual behavior is required.'
  }

  return errors
}

export function BugForm({
  mode,
  initialValues,
  testCases,
  onSubmit,
  onCancel,
}: BugFormProps) {
  const titleRef = useRef<HTMLInputElement>(null)
  const descriptionRef = useRef<HTMLTextAreaElement>(null)
  const stepsRef = useRef<HTMLTextAreaElement>(null)
  const expectedBehaviorRef = useRef<HTMLTextAreaElement>(null)
  const actualBehaviorRef = useRef<HTMLTextAreaElement>(null)
  const [values, setValues] = useState<BugFormValues>(() =>
    getFormValues(initialValues),
  )
  const [errors, setErrors] = useState<BugFormErrors>({})

  const heading = mode === 'edit' ? 'Edit Bug' : 'Create Bug'
  const submitLabel = mode === 'edit' ? 'Save changes' : 'Create bug'
  const unavailableLinkedTestCaseId =
    values.testCaseId &&
    !testCases.some((testCase) => testCase.id === values.testCaseId)
      ? values.testCaseId
      : null

  function handleFieldChange(
    event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) {
    const field = event.target.name as keyof BugFormValues
    const nextValue =
      field === 'testCaseId' && event.target.value === ''
        ? undefined
        : event.target.value

    setValues((currentValues) => ({
      ...currentValues,
      [field]: nextValue,
    }))

    setErrors((currentErrors) => {
      if (!currentErrors[field]) {
        return currentErrors
      }

      const nextErrors = { ...currentErrors }
      delete nextErrors[field]
      return nextErrors
    })
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const normalizedValues = normalizeValues(values)
    const nextErrors = validate(normalizedValues)

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors)

      const firstInvalidField = REQUIRED_FIELD_ORDER.find(
        (field) => nextErrors[field],
      )
      const fieldRefs: Record<
        RequiredBugFormField,
        HTMLInputElement | HTMLTextAreaElement | null
      > = {
        title: titleRef.current,
        description: descriptionRef.current,
        stepsToReproduce: stepsRef.current,
        expectedBehavior: expectedBehaviorRef.current,
        actualBehavior: actualBehaviorRef.current,
      }

      if (firstInvalidField) {
        fieldRefs[firstInvalidField]?.focus()
      }

      return
    }

    onSubmit(normalizedValues)
  }

  return (
    <form
      className="panel form-panel"
      aria-label={`${heading} form`}
      noValidate
      onSubmit={handleSubmit}
    >
      <div className="panel-heading">
        <div className="panel-heading__content">
          <h3>{heading}</h3>
          <p>Capture enough detail for triage without adding workflow overhead.</p>
        </div>
      </div>

      {initialValues ? (
        <div className="form-panel__meta">
          <span>Created {formatDateTime(initialValues.createdAt)}</span>
          <span>Updated {formatDateTime(initialValues.updatedAt)}</span>
        </div>
      ) : null}

      <div className="form-grid">
        <div className="field-group field-group--full">
          <label className="field-label" htmlFor="bug-title">
            Title
          </label>
          <input
            id="bug-title"
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
          <label className="field-label" htmlFor="bug-severity">
            Severity
          </label>
          <select
            id="bug-severity"
            name="severity"
            className="select"
            value={values.severity}
            onChange={handleFieldChange}
          >
            {BUG_SEVERITIES.map((severity) => (
              <option key={severity} value={severity}>
                {severity}
              </option>
            ))}
          </select>
        </div>

        <div className="field-group">
          <label className="field-label" htmlFor="bug-status">
            Status
          </label>
          <select
            id="bug-status"
            name="status"
            className="select"
            value={values.status}
            onChange={handleFieldChange}
          >
            {BUG_STATUSES.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </div>

        <div className="field-group field-group--full">
          <label className="field-label" htmlFor="bug-test-case">
            Linked Test Case
          </label>
          <select
            id="bug-test-case"
            name="testCaseId"
            className="select"
            value={values.testCaseId ?? ''}
            onChange={handleFieldChange}
          >
            <option value="">No linked test case</option>
            {unavailableLinkedTestCaseId ? (
              <option value={unavailableLinkedTestCaseId} disabled>
                Linked test case unavailable
              </option>
            ) : null}
            {testCases.map((testCase) => (
              <option key={testCase.id} value={testCase.id}>
                {testCase.title}
              </option>
            ))}
          </select>
        </div>

        <div className="field-group field-group--full">
          <label className="field-label" htmlFor="bug-description">
            Description
          </label>
          <textarea
            id="bug-description"
            ref={descriptionRef}
            name="description"
            className="textarea"
            value={values.description}
            onChange={handleFieldChange}
            aria-invalid={Boolean(errors.description)}
            aria-describedby={
              errors.description ? FIELD_ERROR_IDS.description : undefined
            }
          />
          {errors.description ? (
            <p id={FIELD_ERROR_IDS.description} className="field-error">
              {errors.description}
            </p>
          ) : null}
        </div>

        <div className="field-group field-group--full">
          <label className="field-label" htmlFor="bug-steps">
            Steps To Reproduce
          </label>
          <textarea
            id="bug-steps"
            ref={stepsRef}
            name="stepsToReproduce"
            className="textarea"
            value={values.stepsToReproduce}
            onChange={handleFieldChange}
            aria-invalid={Boolean(errors.stepsToReproduce)}
            aria-describedby={
              errors.stepsToReproduce
                ? FIELD_ERROR_IDS.stepsToReproduce
                : undefined
            }
          />
          {errors.stepsToReproduce ? (
            <p id={FIELD_ERROR_IDS.stepsToReproduce} className="field-error">
              {errors.stepsToReproduce}
            </p>
          ) : null}
        </div>

        <div className="field-group field-group--full">
          <label className="field-label" htmlFor="bug-expected-behavior">
            Expected Behavior
          </label>
          <textarea
            id="bug-expected-behavior"
            ref={expectedBehaviorRef}
            name="expectedBehavior"
            className="textarea"
            value={values.expectedBehavior}
            onChange={handleFieldChange}
            aria-invalid={Boolean(errors.expectedBehavior)}
            aria-describedby={
              errors.expectedBehavior
                ? FIELD_ERROR_IDS.expectedBehavior
                : undefined
            }
          />
          {errors.expectedBehavior ? (
            <p id={FIELD_ERROR_IDS.expectedBehavior} className="field-error">
              {errors.expectedBehavior}
            </p>
          ) : null}
        </div>

        <div className="field-group field-group--full">
          <label className="field-label" htmlFor="bug-actual-behavior">
            Actual Behavior
          </label>
          <textarea
            id="bug-actual-behavior"
            ref={actualBehaviorRef}
            name="actualBehavior"
            className="textarea"
            value={values.actualBehavior}
            onChange={handleFieldChange}
            aria-invalid={Boolean(errors.actualBehavior)}
            aria-describedby={
              errors.actualBehavior ? FIELD_ERROR_IDS.actualBehavior : undefined
            }
          />
          {errors.actualBehavior ? (
            <p id={FIELD_ERROR_IDS.actualBehavior} className="field-error">
              {errors.actualBehavior}
            </p>
          ) : null}
        </div>
      </div>

      <div className="button-row">
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
