import { useState } from 'react'
import { EmptyState } from '../../components/ui/EmptyState'
import { formatDateTime } from '../../lib/formatters'
import {
  ALL_RELEASE_STATUSES,
  filterAndSortReleases,
  type ReleaseStatusFilter,
} from './releaseFilters'
import { ReleaseForm } from './ReleaseForm'
import {
  RELEASE_STATUSES,
  type Release,
  type ReleaseFormValues,
  type ReleaseStatus,
} from './releaseTypes'

type ReleasesPageProps = {
  releases: Release[]
  onChange: (releases: Release[]) => void
}

function createReleaseId() {
  const randomId = globalThis.crypto?.randomUUID?.()

  if (randomId) {
    return randomId
  }

  return `release-${Date.now()}`
}

function getStatusTone(status: ReleaseStatus) {
  switch (status) {
    case 'Ready':
    case 'Released':
      return 'positive'
    case 'Blocked':
      return 'critical'
    case 'In Testing':
      return 'warning'
    case 'Planning':
    default:
      return 'neutral'
  }
}

export function ReleasesPage({ releases, onChange }: ReleasesPageProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] =
    useState<ReleaseStatusFilter>(ALL_RELEASE_STATUSES)
  const [formMode, setFormMode] = useState<'create' | 'edit' | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)

  const filteredReleases = filterAndSortReleases(releases, {
    searchTerm,
    statusFilter,
  })
  const editingRelease =
    editingId === null
      ? null
      : releases.find((release) => release.id === editingId) ?? null
  const hasActiveFilters =
    searchTerm.trim() !== '' || statusFilter !== ALL_RELEASE_STATUSES
  const visibleCountLabel =
    filteredReleases.length === releases.length
      ? `${filteredReleases.length} total`
      : `${filteredReleases.length} of ${releases.length} shown`

  function openCreateForm() {
    setFormMode('create')
    setEditingId(null)
  }

  function openEditForm(release: Release) {
    setFormMode('edit')
    setEditingId(release.id)
  }

  function closeForm() {
    setFormMode(null)
    setEditingId(null)
  }

  function clearFilters() {
    setSearchTerm('')
    setStatusFilter(ALL_RELEASE_STATUSES)
  }

  function handleSubmit(values: ReleaseFormValues) {
    const timestamp = new Date().toISOString()

    if (formMode === 'edit' && editingRelease) {
      onChange(
        releases.map((release) =>
          release.id === editingRelease.id
            ? {
                ...release,
                ...values,
                updatedAt: timestamp,
              }
            : release,
        ),
      )
      closeForm()
      return
    }

    const nextRelease: Release = {
      id: createReleaseId(),
      createdAt: timestamp,
      updatedAt: timestamp,
      ...values,
    }

    onChange([nextRelease, ...releases])
    closeForm()
  }

  function handleDelete(releaseId: string) {
    const target = releases.find((release) => release.id === releaseId)

    if (!target) {
      return
    }

    const confirmed = window.confirm(`Delete "${target.name}"?`)

    if (!confirmed) {
      return
    }

    onChange(releases.filter((release) => release.id !== releaseId))

    if (editingId === releaseId) {
      closeForm()
    }
  }

  return (
    <section className="page page--records">
      <div className="page-heading page-heading--split">
        <div className="page-heading">
          <h2>Releases</h2>
          <p>
            Track release targets, testing status, and notes while execution
            results stay in their dedicated workspace.
          </p>
        </div>

        <div className="button-row">
          <button
            type="button"
            className="button button--primary"
            onClick={openCreateForm}
          >
            New release
          </button>
        </div>
      </div>

      <section
        className="panel toolbar"
        aria-labelledby="release-filters-heading"
      >
        <div className="panel-heading">
          <div className="panel-heading__content">
            <h3 id="release-filters-heading">Release Search and Filters</h3>
            <p>Find releases by name, version, or status.</p>
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
            <label className="field-label" htmlFor="release-search">
              Search by name or version
            </label>
            <input
              id="release-search"
              className="input"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search releases"
            />
          </div>

          <div className="field-group">
            <label className="field-label" htmlFor="release-status-filter">
              Filter by status
            </label>
            <select
              id="release-status-filter"
              className="select"
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(event.target.value as ReleaseStatusFilter)
              }
            >
              <option value={ALL_RELEASE_STATUSES}>
                {ALL_RELEASE_STATUSES}
              </option>
              {RELEASE_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status}
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
              <h3>Saved Releases</h3>
              <p>Saved automatically in this browser.</p>
            </div>
            <span className="panel-caption">{visibleCountLabel}</span>
          </div>

          {releases.length === 0 ? (
            <EmptyState
              title="No releases yet"
              description="Create the first release when a target needs tracking."
              actionLabel="Create first release"
              onAction={openCreateForm}
            />
          ) : filteredReleases.length === 0 ? (
            <EmptyState
              title="No matching releases"
              description="Try a different name, version, or status filter."
              actionLabel="Clear filters"
              onAction={clearFilters}
            />
          ) : (
            <div className="test-case-list">
              {filteredReleases.map((release) => (
                <article key={release.id} className="test-case-card">
                  <div className="test-case-card__header">
                    <div>
                      <p className="meta-kicker">{release.version}</p>
                      <h3>{release.name}</h3>
                    </div>

                    <div className="card-actions">
                      <button
                        type="button"
                        className="button button--secondary"
                        onClick={() => openEditForm(release)}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="button button--danger"
                        onClick={() => handleDelete(release.id)}
                      >
                        Delete
                      </button>
                    </div>
                  </div>

                  <div className="badge-row">
                    <span
                      className={`badge badge--${getStatusTone(release.status)}`}
                    >
                      {release.status}
                    </span>
                    <span className="badge badge--outline">
                      Target: {release.targetDate}
                    </span>
                  </div>

                  {release.notes ? (
                    <div className="description-block">
                      <span className="field-label">Notes</span>
                      <p>{release.notes}</p>
                    </div>
                  ) : null}

                  <div className="card-footer">
                    <span>Created {formatDateTime(release.createdAt)}</span>
                    <span>Updated {formatDateTime(release.updatedAt)}</span>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        {formMode ? (
          <ReleaseForm
            key={
              formMode === 'edit' && editingRelease
                ? editingRelease.id
                : 'create-release'
            }
            mode={formMode}
            initialValues={editingRelease}
            onSubmit={handleSubmit}
            onCancel={closeForm}
          />
        ) : null}
      </div>
    </section>
  )
}
