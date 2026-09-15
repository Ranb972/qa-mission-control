import { useMemo, useState, type ChangeEvent } from 'react'
import { EmptyState } from '../../components/ui/EmptyState'
import { SummaryCard } from '../../components/ui/SummaryCard'
import { useWorkspace } from '../../lib/workspace/workspaceContext'
import { WorkspaceDataPanel } from '../workspace-data/WorkspaceDataPanel'
import type { TestCase } from '../test-cases/testCaseTypes'
import {
  createInitialColumnMapping,
  detectColumnMapping,
  findMappingConflicts,
} from './columnDetection'
import { parseCsv } from './csvParser'
import {
  buildImportedTestCases,
  mergeImportedTestCases,
} from './importConversion'
import { classifyImportRows, getImportCounts } from './importValidation'
import {
  IMPORT_FIELD_LABELS,
  IMPORT_FIELDS,
  type DetectedColumnMapping,
  type ImportColumnMapping,
  type ImportField,
  type ImportPreviewRow,
  type ImportRowStatus,
  type MappingConfidence,
  type ParsedCsv,
} from './testCaseImportTypes'

type TestCaseImportPageProps = {
  testCases: TestCase[]
  onChange: (testCases: TestCase[]) => void
  onViewTestCases: () => void
}

type ImportSummary = {
  importedCount: number
  defaultedCount: number
  skippedCount: number
}

const STATUS_LABELS: Record<ImportRowStatus, string> = {
  ready: 'Ready',
  warning: 'Needs attention',
  blocked: 'Blocked',
}

const STATUS_TONES: Record<ImportRowStatus, string> = {
  ready: 'positive',
  warning: 'warning',
  blocked: 'critical',
}

let fallbackImportId = 0

function createImportedTestCaseId() {
  const randomId = globalThis.crypto?.randomUUID?.()

  if (randomId) {
    return randomId
  }

  fallbackImportId += 1
  return `imported-test-case-${Date.now()}-${fallbackImportId}`
}

function getDelimiterLabel(delimiter: string) {
  switch (delimiter) {
    case ';':
      return 'semicolon'
    case '\t':
      return 'tab'
    case ',':
    default:
      return 'comma'
  }
}

function getConfidenceLabel(
  field: ImportField,
  mapping: ImportColumnMapping,
  detectedMapping: Partial<Record<ImportField, DetectedColumnMapping>>,
): MappingConfidence {
  const selectedHeader = mapping[field]
  const detectedColumn = detectedMapping[field]

  if (!selectedHeader) {
    return 'Needs review'
  }

  if (detectedColumn?.header === selectedHeader) {
    return detectedColumn.confidence
  }

  return 'Needs review'
}

function formatCount(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`
}

function getRowsByStatus(rows: ImportPreviewRow[], status: ImportRowStatus) {
  return rows.filter((row) => row.status === status)
}

function PreviewSection({
  title,
  description,
  rows,
}: {
  title: string
  description: string
  rows: ImportPreviewRow[]
}) {
  return (
    <section className="panel">
      <div className="panel-heading">
        <div className="panel-heading__content">
          <h3>{title}</h3>
          <p>{description}</p>
        </div>
        <span className="panel-caption">{formatCount(rows.length, 'row')}</span>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="No rows in this group"
          description="Rows will appear here when the CSV preview matches this status."
        />
      ) : (
        <div className="test-case-list">
          {rows.map((row) => (
            <article
              key={row.rowNumber}
              className="test-case-card"
              aria-label={`Source row ${row.rowNumber}`}
            >
              <div className="test-case-card__header">
                <div>
                  <p className="meta-kicker">Source row {row.rowNumber}</p>
                  <h3>{row.values.title || 'Missing title'}</h3>
                </div>

                <span
                  className={`badge badge--${STATUS_TONES[row.status]}`}
                >
                  {STATUS_LABELS[row.status]}
                </span>
              </div>

              <div className="badge-row">
                <span className="badge badge--outline">
                  Area: {row.values.area}
                </span>
                <span className="badge badge--outline">
                  Priority: {row.values.priority}
                </span>
                <span className="badge badge--outline">
                  Type: {row.values.type}
                </span>
                <span className="badge badge--neutral">
                  Status: Not Run
                </span>
              </div>

              <div className="description-grid">
                <div className="description-block">
                  <span className="field-label">Steps</span>
                  <p>{row.values.steps || 'Missing steps'}</p>
                </div>
                <div className="description-block">
                  <span className="field-label">Expected Result</span>
                  <p>{row.values.expectedResult || 'Missing expected result'}</p>
                </div>
              </div>

              {row.messages.length > 0 ? (
                <ul className="roadmap-list">
                  {row.messages.map((message) => (
                    <li key={`${message.type}-${message.text}`}>
                      {message.text}
                    </li>
                  ))}
                </ul>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </section>
  )
}

export function TestCaseImportPage({
  testCases,
  onChange,
  onViewTestCases,
}: TestCaseImportPageProps) {
  const workspace = useWorkspace()
  const [workspaceMode, setWorkspaceMode] = useState(false)
  const [fileName, setFileName] = useState('')
  const [parsedCsv, setParsedCsv] = useState<ParsedCsv | null>(null)
  const [detectedMapping, setDetectedMapping] = useState<
    Partial<Record<ImportField, DetectedColumnMapping>>
  >({})
  const [mapping, setMapping] = useState<ImportColumnMapping>({})
  const [importSummary, setImportSummary] = useState<ImportSummary | null>(null)

  const previewRows = useMemo(
    () => (parsedCsv ? classifyImportRows(parsedCsv.rows, mapping) : []),
    [mapping, parsedCsv],
  )
  const counts = getImportCounts(previewRows)
  const mappingConflicts = findMappingConflicts(mapping)

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]

    if (!file) {
      return
    }

    const text = await file.text()
    const nextParsedCsv = parseCsv(text)
    const nextDetectedMapping = detectColumnMapping(nextParsedCsv.headers)

    setFileName(file.name)
    setParsedCsv(nextParsedCsv)
    setDetectedMapping(nextDetectedMapping)
    setMapping(createInitialColumnMapping(nextDetectedMapping))
    setImportSummary(null)
  }

  function handleMappingChange(field: ImportField, header: string) {
    setMapping((currentMapping) => ({
      ...currentMapping,
      [field]: header || undefined,
    }))
    setImportSummary(null)
  }

  function handleImport(includeWarnings: boolean) {
    const now = new Date().toISOString()
    const importedTestCases = buildImportedTestCases(previewRows, {
      includeWarnings,
      now,
      createId: createImportedTestCaseId,
    })
    const defaultedCount = includeWarnings
      ? previewRows.filter((row) => row.status === 'warning').length
      : 0

    onChange(mergeImportedTestCases(testCases, importedTestCases))
    setImportSummary({
      importedCount: importedTestCases.length,
      defaultedCount,
      skippedCount: previewRows.length - importedTestCases.length,
    })
  }

  if (workspaceMode && workspace) return <section className="page"><header className="page-heading page-heading--split"><div><h2>Workspace data</h2><p>Portable, validated backups for your local QA workspace.</p></div><button className="button button--secondary" onClick={() => setWorkspaceMode(false)}>Back to Test Case import</button></header><WorkspaceDataPanel /></section>
  return (
    <section className="page">
      <div className="page-heading">
        <h2>Import Test Cases</h2>
        <p>
          Bring test scripts from Excel by saving them as CSV, then review what
          QA Mission Control detected before importing.
        </p>
        {workspace && <button className="button button--secondary" onClick={() => setWorkspaceMode(true)}>Workspace backup & restore</button>}
      </div>

      <section className="panel">
        <div className="panel-heading">
          <div className="panel-heading__content">
            <h3>Import Steps</h3>
            <p>
              Upload, review detected columns, preview structured test cases,
              import, then confirm the summary.
            </p>
          </div>
        </div>

        <ol className="roadmap-list">
          <li>Upload Test Cases</li>
          <li>Review Detected Columns</li>
          <li>Review Test Cases</li>
          <li>Import</li>
          <li>Summary</li>
        </ol>
      </section>

      <section className="panel" aria-labelledby="upload-test-cases-heading">
        <div className="panel-heading">
          <div className="panel-heading__content">
            <h3 id="upload-test-cases-heading">1. Upload Test Cases</h3>
            <p>
              Use a CSV exported from Excel. Hebrew and English headers are
              both supported.
            </p>
          </div>
        </div>

        <div className="field-group">
          <label className="field-label" htmlFor="test-case-import-file">
            Upload CSV file
          </label>
          <input
            id="test-case-import-file"
            className="input"
            type="file"
            accept=".csv,text/csv"
            onChange={handleFileChange}
          />
          <p className="helper-text">
            XLSX upload is not supported. Export the spreadsheet as CSV before
            uploading it here.
          </p>
        </div>
      </section>

      {parsedCsv ? (
        <>
          <section className="panel" aria-labelledby="detected-columns-heading">
            <div className="panel-heading">
              <div className="panel-heading__content">
                <h3 id="detected-columns-heading">
                  2. Review Detected Columns
                </h3>
                <p>
                  Confirm the detected mapping or adjust it before previewing
                  the imported test cases.
                </p>
              </div>
              <span className="panel-caption">
                {fileName} · {formatCount(parsedCsv.rows.length, 'row')} ·{' '}
                {getDelimiterLabel(parsedCsv.delimiter)} separated
              </span>
            </div>

            {parsedCsv.errors.length > 0 ? (
              <div className="storage-alert" role="status">
                {parsedCsv.errors.join(' ')}
              </div>
            ) : null}

            {mappingConflicts.length > 0 ? (
              <div className="storage-alert" role="status">
                Some columns are mapped more than once. Fix those mappings
                before importing.
              </div>
            ) : null}

            <div className="form-grid">
              {IMPORT_FIELDS.map((field) => {
                const selectedHeader = mapping[field] ?? ''
                const detectedColumn = detectedMapping[field]
                const confidence = getConfidenceLabel(
                  field,
                  mapping,
                  detectedMapping,
                )

                return (
                  <div className="field-group" key={field}>
                    <label
                      className="field-label"
                      htmlFor={`mapping-${field}`}
                    >
                      Map {IMPORT_FIELD_LABELS[field]} column
                    </label>
                    <select
                      id={`mapping-${field}`}
                      className="select"
                      value={selectedHeader}
                      onChange={(event) =>
                        handleMappingChange(field, event.target.value)
                      }
                    >
                      <option value="">Not mapped</option>
                      {parsedCsv.headers.map((header) => (
                        <option key={header} value={header}>
                          {header}
                        </option>
                      ))}
                    </select>
                    <p className="helper-text">
                      {detectedColumn
                        ? `Detected "${detectedColumn.header}" as ${
                            IMPORT_FIELD_LABELS[field]
                          }.`
                        : 'No strong match was detected.'}{' '}
                      {confidence}
                    </p>
                  </div>
                )
              })}
            </div>
          </section>

          <section className="page" aria-labelledby="preview-heading">
            <div className="page-heading">
              <h3 id="preview-heading">3. Review Test Cases</h3>
              <p>
                Preview rows as test cases. Ready rows can import immediately;
                rows needing attention require explicit default approval.
              </p>
            </div>

            <div className="summary-grid">
              <SummaryCard
                label="Ready to import"
                value={counts.ready}
                description="Rows with all required values and supported fields."
                tone="positive"
              />
              <SummaryCard
                label="Needs attention"
                value={counts.warning}
                description="Rows that can import with clear defaults."
                tone="warning"
              />
              <SummaryCard
                label="Blocked"
                value={counts.blocked}
                description="Rows that will be skipped until fixed."
                tone="critical"
              />
            </div>

            <PreviewSection
              title="Ready to import"
              description="These rows will become test cases without defaults."
              rows={getRowsByStatus(previewRows, 'ready')}
            />
            <PreviewSection
              title="Needs attention, can import with defaults"
              description="These rows are missing optional values. Defaults are shown on each card."
              rows={getRowsByStatus(previewRows, 'warning')}
            />
            <PreviewSection
              title="Blocked, will not import"
              description="These rows have missing required values or unsupported values."
              rows={getRowsByStatus(previewRows, 'blocked')}
            />
          </section>

          <section className="panel" aria-labelledby="import-heading">
            <div className="panel-heading">
              <div className="panel-heading__content">
                <h3 id="import-heading">4. Import</h3>
                <p>
                  Blocked rows are never imported. Warning rows import only
                  when you explicitly approve defaults.
                </p>
              </div>
            </div>

            <div className="button-row">
              <button
                type="button"
                className="button button--primary"
                onClick={() => handleImport(false)}
                disabled={counts.ready === 0}
              >
                Import ready rows
              </button>
              {counts.warning > 0 ? (
                <button
                  type="button"
                  className="button button--secondary"
                  onClick={() => handleImport(true)}
                >
                  Import ready + rows with defaults
                </button>
              ) : null}
            </div>
          </section>
        </>
      ) : (
        <section className="panel">
          <EmptyState
            title="No CSV uploaded yet"
            description="Upload a CSV file to review detected columns and preview test cases before importing."
          />
        </section>
      )}

      {importSummary ? (
        <section className="panel" aria-labelledby="import-summary-heading">
          <div className="panel-heading">
            <div className="panel-heading__content">
              <h3 id="import-summary-heading">5. Summary</h3>
              <p>Import completed. Review the results below.</p>
            </div>
          </div>

          <div className="summary-grid">
            <SummaryCard
              label="Imported"
              value={importSummary.importedCount}
              description={formatCount(
                importSummary.importedCount,
                'test case',
              )}
              tone="positive"
            />
            <SummaryCard
              label="Defaulted"
              value={importSummary.defaultedCount}
              description={formatCount(importSummary.defaultedCount, 'row')}
              tone="warning"
            />
            <SummaryCard
              label="Skipped"
              value={importSummary.skippedCount}
              description={formatCount(importSummary.skippedCount, 'row')}
              tone="critical"
            />
          </div>

          <div className="button-row">
            <button
              type="button"
              className="button button--primary"
              onClick={onViewTestCases}
            >
              View imported test cases
            </button>
          </div>
        </section>
      ) : null}
    </section>
  )
}
