import { useState } from 'react'
import { EmptyState } from '../../components/ui/EmptyState'
import { formatDateTime } from '../../lib/formatters'
import {
  ALL_RISK_IMPACTS,
  ALL_RISK_LIKELIHOODS,
  ALL_RISK_STATUSES,
  filterAndSortRisks,
  type RiskImpactFilter,
  type RiskLikelihoodFilter,
  type RiskStatusFilter,
} from './riskFilters'
import { RiskForm } from './RiskForm'
import {
  RISK_IMPACTS,
  RISK_LIKELIHOODS,
  RISK_STATUSES,
  type Risk,
  type RiskFormValues,
  type RiskImpact,
  type RiskLikelihood,
  type RiskStatus,
} from './riskTypes'

type RisksPageProps = {
  risks: Risk[]
  onChange: (risks: Risk[]) => void
}

function createRiskId() {
  const randomId = globalThis.crypto?.randomUUID?.()

  if (randomId) {
    return randomId
  }

  return `risk-${Date.now()}`
}

function getStatusTone(status: RiskStatus) {
  switch (status) {
    case 'Resolved':
      return 'positive'
    case 'Mitigating':
    case 'Open':
      return 'warning'
    case 'Accepted':
    default:
      return 'neutral'
  }
}

function getImpactTone(impact: RiskImpact) {
  switch (impact) {
    case 'Critical':
      return 'critical'
    case 'High':
      return 'warning'
    case 'Medium':
      return 'neutral'
    case 'Low':
    default:
      return 'positive'
  }
}

function getLikelihoodTone(likelihood: RiskLikelihood) {
  switch (likelihood) {
    case 'High':
      return 'warning'
    case 'Medium':
      return 'neutral'
    case 'Low':
    default:
      return 'positive'
  }
}

export function RisksPage({ risks, onChange }: RisksPageProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] =
    useState<RiskStatusFilter>(ALL_RISK_STATUSES)
  const [impactFilter, setImpactFilter] =
    useState<RiskImpactFilter>(ALL_RISK_IMPACTS)
  const [likelihoodFilter, setLikelihoodFilter] =
    useState<RiskLikelihoodFilter>(ALL_RISK_LIKELIHOODS)
  const [formMode, setFormMode] = useState<'create' | 'edit' | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)

  const filteredRisks = filterAndSortRisks(risks, {
    searchTerm,
    statusFilter,
    impactFilter,
    likelihoodFilter,
  })
  const editingRisk =
    editingId === null
      ? null
      : risks.find((risk) => risk.id === editingId) ?? null
  const hasActiveFilters =
    searchTerm.trim() !== '' ||
    statusFilter !== ALL_RISK_STATUSES ||
    impactFilter !== ALL_RISK_IMPACTS ||
    likelihoodFilter !== ALL_RISK_LIKELIHOODS
  const visibleCountLabel =
    filteredRisks.length === risks.length
      ? `${filteredRisks.length} total`
      : `${filteredRisks.length} of ${risks.length} shown`

  function openCreateForm() {
    setFormMode('create')
    setEditingId(null)
  }

  function openEditForm(risk: Risk) {
    setFormMode('edit')
    setEditingId(risk.id)
  }

  function closeForm() {
    setFormMode(null)
    setEditingId(null)
  }

  function clearFilters() {
    setSearchTerm('')
    setStatusFilter(ALL_RISK_STATUSES)
    setImpactFilter(ALL_RISK_IMPACTS)
    setLikelihoodFilter(ALL_RISK_LIKELIHOODS)
  }

  function handleSubmit(values: RiskFormValues) {
    const timestamp = new Date().toISOString()

    if (formMode === 'edit' && editingRisk) {
      onChange(
        risks.map((risk) =>
          risk.id === editingRisk.id
            ? {
                ...risk,
                ...values,
                updatedAt: timestamp,
              }
            : risk,
        ),
      )
      closeForm()
      return
    }

    const nextRisk: Risk = {
      id: createRiskId(),
      createdAt: timestamp,
      updatedAt: timestamp,
      ...values,
    }

    onChange([nextRisk, ...risks])
    closeForm()
  }

  function handleDelete(riskId: string) {
    const target = risks.find((risk) => risk.id === riskId)

    if (!target) {
      return
    }

    const confirmed = window.confirm(`Delete "${target.title}"?`)

    if (!confirmed) {
      return
    }

    onChange(risks.filter((risk) => risk.id !== riskId))

    if (editingId === riskId) {
      closeForm()
    }
  }

  return (
    <section className="page page--records">
      <div className="page-heading page-heading--split">
        <div className="page-heading">
          <h2>Risks</h2>
          <p>
            Track project risks, likelihood, impact, and mitigation plans before
            they turn into release blockers.
          </p>
        </div>

        <div className="button-row">
          <button
            type="button"
            className="button button--primary"
            onClick={openCreateForm}
          >
            New risk
          </button>
        </div>
      </div>

      <section
        className="panel toolbar"
        aria-labelledby="risk-filters-heading"
      >
        <div className="panel-heading">
          <div className="panel-heading__content">
            <h3 id="risk-filters-heading">Risk Search and Filters</h3>
            <p>Find risks quickly by title, status, impact, or likelihood.</p>
          </div>
          {hasActiveFilters ? (
            <button
              type="button"
              className="button button--secondary"
              onClick={clearFilters}
            >
              Clear filters
            </button>
          ) : null}
        </div>

        <div className="filter-grid">
          <div className="field-group">
            <label className="field-label" htmlFor="risk-search">
              Search by title
            </label>
            <input
              id="risk-search"
              className="input"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search risks"
            />
          </div>

          <div className="field-group">
            <label className="field-label" htmlFor="risk-status-filter">
              Filter by status
            </label>
            <select
              id="risk-status-filter"
              className="select"
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(event.target.value as RiskStatusFilter)
              }
            >
              <option value={ALL_RISK_STATUSES}>{ALL_RISK_STATUSES}</option>
              {RISK_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </div>

          <div className="field-group">
            <label className="field-label" htmlFor="risk-impact-filter">
              Filter by impact
            </label>
            <select
              id="risk-impact-filter"
              className="select"
              value={impactFilter}
              onChange={(event) =>
                setImpactFilter(event.target.value as RiskImpactFilter)
              }
            >
              <option value={ALL_RISK_IMPACTS}>{ALL_RISK_IMPACTS}</option>
              {RISK_IMPACTS.map((impact) => (
                <option key={impact} value={impact}>
                  {impact}
                </option>
              ))}
            </select>
          </div>

          <div className="field-group">
            <label className="field-label" htmlFor="risk-likelihood-filter">
              Filter by likelihood
            </label>
            <select
              id="risk-likelihood-filter"
              className="select"
              value={likelihoodFilter}
              onChange={(event) =>
                setLikelihoodFilter(event.target.value as RiskLikelihoodFilter)
              }
            >
              <option value={ALL_RISK_LIKELIHOODS}>
                {ALL_RISK_LIKELIHOODS}
              </option>
              {RISK_LIKELIHOODS.map((likelihood) => (
                <option key={likelihood} value={likelihood}>
                  {likelihood}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      <div className={`test-cases-layout${formMode ? ' record-layout--editing' : ' record-layout'}`}>
        <section className="panel list-panel">
          <div className="panel-heading">
            <div className="panel-heading__content">
              <h3>Saved Risks</h3>
              <p>Saved automatically in this browser.</p>
            </div>
            <span className="panel-caption">{visibleCountLabel}</span>
          </div>

          {risks.length === 0 ? (
            <EmptyState
              title="No risks yet"
              description="Create the first risk when a project concern needs tracking."
              actionLabel="Create first risk"
              onAction={openCreateForm}
            />
          ) : filteredRisks.length === 0 ? (
            <EmptyState
              title="No matching risks"
              description="Try a different title search or reset the filters to see more risks."
              actionLabel="Clear filters"
              onAction={clearFilters}
            />
          ) : (
            <div className="test-case-list">
              {filteredRisks.map((risk) => (
                <article key={risk.id} className="test-case-card">
                  <div className="test-case-card__header">
                    <div>
                      <p className="meta-kicker">{risk.status}</p>
                      <h3>{risk.title}</h3>
                    </div>

                    <div className="card-actions">
                      <button
                        type="button"
                        className="button button--secondary"
                        onClick={() => openEditForm(risk)}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="button button--danger"
                        onClick={() => handleDelete(risk.id)}
                      >
                        Delete
                      </button>
                    </div>
                  </div>

                  <div className="badge-row">
                    <span className={`badge badge--${getStatusTone(risk.status)}`}>
                      {risk.status}
                    </span>
                    <span className={`badge badge--${getImpactTone(risk.impact)}`}>
                      Impact: {risk.impact}
                    </span>
                    <span
                      className={`badge badge--${getLikelihoodTone(
                        risk.likelihood,
                      )}`}
                    >
                      Likelihood: {risk.likelihood}
                    </span>
                  </div>

                  <details className="record-details"><summary>Description & mitigation</summary>
                  <div className="description-grid">
                    <div className="description-block">
                      <span className="field-label">Description</span>
                      <p>{risk.description}</p>
                    </div>
                    <div className="description-block">
                      <span className="field-label">Mitigation Plan</span>
                      <p>{risk.mitigationPlan}</p>
                    </div>
                  </div>

                  <div className="card-footer">
                    <span>Created {formatDateTime(risk.createdAt)}</span>
                    <span>Updated {formatDateTime(risk.updatedAt)}</span>
                  </div>
                  </details>
                </article>
              ))}
            </div>
          )}
        </section>

        {formMode ? (
          <RiskForm
            key={formMode === 'edit' && editingRisk ? editingRisk.id : 'create-risk'}
            mode={formMode}
            initialValues={editingRisk}
            onSubmit={handleSubmit}
            onCancel={closeForm}
          />
        ) : null}
      </div>
    </section>
  )
}
