import { useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { formatDateTime } from '../../lib/formatters'
import {
  EMPTY_RISK_FORM_VALUES,
  RISK_IMPACTS,
  RISK_LIKELIHOODS,
  RISK_STATUSES,
  type Risk,
  type RiskFormErrors,
  type RiskFormValues,
} from './riskTypes'

type RiskFormProps = {
  mode: 'create' | 'edit'
  initialValues?: Risk | null
  onSubmit: (values: RiskFormValues) => void
  onCancel: () => void
}

type RequiredRiskFormField = 'title' | 'description' | 'mitigationPlan'

const REQUIRED_FIELD_ORDER: RequiredRiskFormField[] = [
  'title',
  'description',
  'mitigationPlan',
]

const FIELD_ERROR_IDS: Record<RequiredRiskFormField, string> = {
  title: 'risk-title-error',
  description: 'risk-description-error',
  mitigationPlan: 'risk-mitigation-plan-error',
}

function getFormValues(initialValues?: Risk | null): RiskFormValues {
  if (!initialValues) {
    return EMPTY_RISK_FORM_VALUES
  }

  return {
    title: initialValues.title,
    description: initialValues.description,
    impact: initialValues.impact,
    likelihood: initialValues.likelihood,
    status: initialValues.status,
    mitigationPlan: initialValues.mitigationPlan,
  }
}

function normalizeValues(values: RiskFormValues): RiskFormValues {
  return {
    ...values,
    title: values.title.trim(),
    description: values.description.trim(),
    mitigationPlan: values.mitigationPlan.trim(),
  }
}

function validate(values: RiskFormValues): RiskFormErrors {
  const errors: RiskFormErrors = {}

  if (!values.title) {
    errors.title = 'Title is required.'
  }

  if (!values.description) {
    errors.description = 'Description is required.'
  }

  if (!values.mitigationPlan) {
    errors.mitigationPlan = 'Mitigation plan is required.'
  }

  return errors
}

export function RiskForm({
  mode,
  initialValues,
  onSubmit,
  onCancel,
}: RiskFormProps) {
  const titleRef = useRef<HTMLInputElement>(null)
  const descriptionRef = useRef<HTMLTextAreaElement>(null)
  const mitigationPlanRef = useRef<HTMLTextAreaElement>(null)
  const [values, setValues] = useState<RiskFormValues>(() =>
    getFormValues(initialValues),
  )
  const [errors, setErrors] = useState<RiskFormErrors>({})

  const heading = mode === 'edit' ? 'Edit Risk' : 'Create Risk'
  const submitLabel = mode === 'edit' ? 'Save changes' : 'Create risk'

  function handleFieldChange(
    event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) {
    const field = event.target.name as keyof RiskFormValues

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
      const fieldRefs: Record<
        RequiredRiskFormField,
        HTMLInputElement | HTMLTextAreaElement | null
      > = {
        title: titleRef.current,
        description: descriptionRef.current,
        mitigationPlan: mitigationPlanRef.current,
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
          <p>Capture the risk, its probability, and the current response plan.</p>
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
          <label className="field-label" htmlFor="risk-title">
            Title
          </label>
          <input
            id="risk-title"
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
          <label className="field-label" htmlFor="risk-impact">
            Risk impact
          </label>
          <select
            id="risk-impact"
            name="impact"
            className="select"
            value={values.impact}
            onChange={handleFieldChange}
          >
            {RISK_IMPACTS.map((impact) => (
              <option key={impact} value={impact}>
                {impact}
              </option>
            ))}
          </select>
        </div>

        <div className="field-group">
          <label className="field-label" htmlFor="risk-likelihood">
            Risk likelihood
          </label>
          <select
            id="risk-likelihood"
            name="likelihood"
            className="select"
            value={values.likelihood}
            onChange={handleFieldChange}
          >
            {RISK_LIKELIHOODS.map((likelihood) => (
              <option key={likelihood} value={likelihood}>
                {likelihood}
              </option>
            ))}
          </select>
        </div>

        <div className="field-group field-group--full">
          <label className="field-label" htmlFor="risk-status">
            Risk status
          </label>
          <select
            id="risk-status"
            name="status"
            className="select"
            value={values.status}
            onChange={handleFieldChange}
          >
            {RISK_STATUSES.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </div>

        <div className="field-group field-group--full">
          <label className="field-label" htmlFor="risk-description">
            Description
          </label>
          <textarea
            id="risk-description"
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
          <label className="field-label" htmlFor="risk-mitigation-plan">
            Mitigation Plan
          </label>
          <textarea
            id="risk-mitigation-plan"
            ref={mitigationPlanRef}
            name="mitigationPlan"
            className="textarea"
            value={values.mitigationPlan}
            onChange={handleFieldChange}
            aria-invalid={Boolean(errors.mitigationPlan)}
            aria-describedby={
              errors.mitigationPlan
                ? FIELD_ERROR_IDS.mitigationPlan
                : undefined
            }
          />
          {errors.mitigationPlan ? (
            <p id={FIELD_ERROR_IDS.mitigationPlan} className="field-error">
              {errors.mitigationPlan}
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
