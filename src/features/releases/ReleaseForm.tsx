import { useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { formatDateTime } from '../../lib/formatters'
import {
  EMPTY_RELEASE_FORM_VALUES,
  RELEASE_STATUSES,
  type Release,
  type ReleaseFormErrors,
  type ReleaseFormValues,
} from './releaseTypes'

type ReleaseFormProps = {
  mode: 'create' | 'edit'
  initialValues?: Release | null
  onSubmit: (values: ReleaseFormValues) => void
  onCancel: () => void
}

type RequiredReleaseFormField = 'name' | 'version' | 'targetDate'

const REQUIRED_FIELD_ORDER: RequiredReleaseFormField[] = [
  'name',
  'version',
  'targetDate',
]

const FIELD_ERROR_IDS: Record<RequiredReleaseFormField, string> = {
  name: 'release-name-error',
  version: 'release-version-error',
  targetDate: 'release-target-date-error',
}

function isValidDateInput(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false
  }

  const date = new Date(`${value}T00:00:00.000Z`)

  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value)
}

function getFormValues(initialValues?: Release | null): ReleaseFormValues {
  if (!initialValues) {
    return EMPTY_RELEASE_FORM_VALUES
  }

  return {
    name: initialValues.name,
    version: initialValues.version,
    targetDate: initialValues.targetDate,
    status: initialValues.status,
    notes: initialValues.notes,
  }
}

function normalizeValues(values: ReleaseFormValues): ReleaseFormValues {
  return {
    ...values,
    name: values.name.trim(),
    version: values.version.trim(),
    targetDate: values.targetDate.trim(),
    notes: values.notes.trim(),
  }
}

function validate(values: ReleaseFormValues): ReleaseFormErrors {
  const errors: ReleaseFormErrors = {}

  if (!values.name) {
    errors.name = 'Release name is required.'
  }

  if (!values.version) {
    errors.version = 'Version is required.'
  }

  if (!values.targetDate) {
    errors.targetDate = 'Target date is required.'
  } else if (!isValidDateInput(values.targetDate)) {
    errors.targetDate = 'Target date must be a valid YYYY-MM-DD date.'
  }

  return errors
}

export function ReleaseForm({
  mode,
  initialValues,
  onSubmit,
  onCancel,
}: ReleaseFormProps) {
  const nameRef = useRef<HTMLInputElement>(null)
  const versionRef = useRef<HTMLInputElement>(null)
  const targetDateRef = useRef<HTMLInputElement>(null)
  const [values, setValues] = useState<ReleaseFormValues>(() =>
    getFormValues(initialValues),
  )
  const [errors, setErrors] = useState<ReleaseFormErrors>({})

  const heading = mode === 'edit' ? 'Edit Release' : 'Create Release'
  const submitLabel = mode === 'edit' ? 'Save changes' : 'Create release'

  function handleFieldChange(
    event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) {
    const field = event.target.name as keyof ReleaseFormValues

    setValues((currentValues) => ({
      ...currentValues,
      [field]: event.target.value,
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
      const fieldRefs: Record<RequiredReleaseFormField, HTMLInputElement | null> =
        {
          name: nameRef.current,
          version: versionRef.current,
          targetDate: targetDateRef.current,
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
          <p>Track the target date, current status, and notes for a release.</p>
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
          <label className="field-label" htmlFor="release-name">
            Release name
          </label>
          <input
            id="release-name"
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
          <label className="field-label" htmlFor="release-version">
            Version
          </label>
          <input
            id="release-version"
            ref={versionRef}
            name="version"
            className="input"
            value={values.version}
            onChange={handleFieldChange}
            aria-invalid={Boolean(errors.version)}
            aria-describedby={
              errors.version ? FIELD_ERROR_IDS.version : undefined
            }
          />
          {errors.version ? (
            <p id={FIELD_ERROR_IDS.version} className="field-error">
              {errors.version}
            </p>
          ) : null}
        </div>

        <div className="field-group">
          <label className="field-label" htmlFor="release-target-date">
            Target date
          </label>
          <input
            id="release-target-date"
            ref={targetDateRef}
            name="targetDate"
            type="date"
            className="input"
            value={values.targetDate}
            onChange={handleFieldChange}
            aria-invalid={Boolean(errors.targetDate)}
            aria-describedby={
              errors.targetDate ? FIELD_ERROR_IDS.targetDate : undefined
            }
          />
          {errors.targetDate ? (
            <p id={FIELD_ERROR_IDS.targetDate} className="field-error">
              {errors.targetDate}
            </p>
          ) : null}
        </div>

        <div className="field-group field-group--full">
          <label className="field-label" htmlFor="release-status">
            Release status
          </label>
          <select
            id="release-status"
            name="status"
            className="select"
            value={values.status}
            onChange={handleFieldChange}
          >
            {RELEASE_STATUSES.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </div>

        <div className="field-group field-group--full">
          <label className="field-label" htmlFor="release-notes">
            Notes
          </label>
          <textarea
            id="release-notes"
            name="notes"
            className="textarea"
            value={values.notes}
            onChange={handleFieldChange}
          />
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
