import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from 'react'
import { formatDateTime } from '../../lib/formatters'
import { PdfPageReview } from '../document-intelligence/PdfPageReview'
import { ProductEvidenceImport } from '../product-evidence/ProductEvidenceImport'
import {
  EMPTY_QA_SOURCE_FORM_VALUES,
  QA_SOURCE_STATUSES,
  QA_SOURCE_TYPES,
  type QaSource,
  type QaSourceFormErrors,
  type QaSourceFormValues,
} from './qaSourceTypes'
import {
  extractQaSourceTextFromFile,
  QA_SOURCE_FILE_IMPORT_CANCELED_MESSAGE,
  QA_SOURCE_PDF_PARTIAL_TEXT_WARNING,
  type QaSourcePdfImportProgress,
} from './qaSourceFileImport'

type QaSourceFormProps = {
  mode: 'create' | 'edit'
  initialValues?: QaSource | null
  onSubmit: (values: QaSourceFormValues) => void
  onCancel: () => void
  headingId?: string
}

const FIELD_ERROR_IDS = {
  title: 'qa-source-title-error',
  content: 'qa-source-content-error',
} as const

const FILE_IMPORT_STATUS_ID = 'qa-source-file-import-status'
const FILE_IMPORT_HELPER_ID = 'qa-source-file-import-helper'

function getFormValues(initialValues?: QaSource | null): QaSourceFormValues {
  if (!initialValues) {
    return EMPTY_QA_SOURCE_FORM_VALUES
  }

  return {
    title: initialValues.title,
    sourceType: initialValues.sourceType,
    status: initialValues.status,
    content: initialValues.content,
    notes: initialValues.notes,
    ...(initialValues.documentImport ? { documentImport: initialValues.documentImport } : {}),
  }
}

function normalizeValues(values: QaSourceFormValues): QaSourceFormValues {
  return {
    ...values,
    title: values.title.trim(),
    notes: values.notes.trim(),
  }
}

function validate(values: QaSourceFormValues): QaSourceFormErrors {
  const errors: QaSourceFormErrors = {}

  if (!values.title.trim()) {
    errors.title = 'Source title is required.'
  }

  if (!values.content.trim()) {
    errors.content = 'Source content is required.'
  }

  return errors
}

function formatImportCount(value: number) {
  return new Intl.NumberFormat('en-US').format(value)
}

export function QaSourceForm({
  mode,
  initialValues,
  onSubmit,
  onCancel,
  headingId,
}: QaSourceFormProps) {
  const titleRef = useRef<HTMLInputElement>(null)
  const contentRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const cancelImportButtonRef = useRef<HTMLButtonElement>(null)
  const fileImportControllerRef = useRef<AbortController | null>(null)
  const fileImportRequestIdRef = useRef(0)
  const wasImportingFileRef = useRef(false)
  const [values, setValues] = useState<QaSourceFormValues>(() =>
    getFormValues(initialValues),
  )
  const [errors, setErrors] = useState<QaSourceFormErrors>({})
  const [fileImportMessage, setFileImportMessage] = useState<{
    type: 'success' | 'error' | 'info' | 'warning'
    text: string
  } | null>(null)
  const [activeImportFileName, setActiveImportFileName] = useState('')
  const [fileImportProgress, setFileImportProgress] =
    useState<QaSourcePdfImportProgress | null>(null)
  const [isImportingFile, setIsImportingFile] = useState(false)
  const [pdfFile, setPdfFile] = useState<File | null>(null)

  const heading = mode === 'edit' ? 'Edit QA Source' : 'Create QA Source'
  const submitLabel = mode === 'edit' ? 'Save changes' : 'Create QA Source'

  useEffect(() => {
    titleRef.current?.focus()

    return () => {
      fileImportRequestIdRef.current += 1
      fileImportControllerRef.current?.abort()
    }
  }, [])

  useEffect(() => {
    if (isImportingFile) {
      wasImportingFileRef.current = true
      cancelImportButtonRef.current?.focus()
      return
    }

    if (wasImportingFileRef.current) {
      wasImportingFileRef.current = false
      fileInputRef.current?.focus()
    }
  }, [isImportingFile])

  function handleFieldChange(
    event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) {
    const field = event.target.name as keyof QaSourceFormValues
    if (field === 'content' && values.documentImport) {
      setPdfFile(null)
      setFileImportMessage({ type: 'warning', text: 'Source text was edited. Historical file locations were detached; re-import the original file to restore canonical page or table locations.' })
    }

    setValues((currentValues) => ({
      ...currentValues,
      [field]: event.target.value,
      ...(field === 'content' ? { documentImport: undefined } : {}),
    }))

    if (field in errors) {
      setErrors((currentErrors) => ({
        ...currentErrors,
        [field]: undefined,
      }))
    }
  }

  async function handleFileImportChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]

    if (!file) {
      return
    }

    const input = event.target
    const controller = new AbortController()
    const requestId = fileImportRequestIdRef.current + 1

    fileImportRequestIdRef.current = requestId
    fileImportControllerRef.current?.abort()
    fileImportControllerRef.current = controller
    setActiveImportFileName(file.name)
    setFileImportProgress(null)
    setIsImportingFile(true)
    setFileImportMessage(null)

    const importResult = await extractQaSourceTextFromFile(file, {
      signal: controller.signal,
      onPdfProgress: (progress) => {
        if (fileImportRequestIdRef.current === requestId) {
          setFileImportProgress(progress)
        }
      },
    })

    if (fileImportRequestIdRef.current !== requestId) {
      return
    }

    fileImportControllerRef.current = null
    setIsImportingFile(false)

    input.value = ''

    if (!importResult.ok) {
      setFileImportMessage({
        type:
          importResult.error === QA_SOURCE_FILE_IMPORT_CANCELED_MESSAGE
            ? 'info'
            : 'error',
        text: importResult.error,
      })
      return
    }

    const currentContent = contentRef.current?.value ?? values.content

    if (currentContent.trim().length > 0) {
      const importWarning = importResult.warning
        ? `\n\n${importResult.warning}`
        : ''
      const confirmed = window.confirm(
        `Replace current source content with text from "${importResult.fileName}"?${importWarning}`,
      )

      if (!confirmed) {
        setFileImportMessage({
          type: 'info',
          text: 'Import canceled. Existing source content was kept.',
        })
        return
      }
    }

    setPdfFile(importResult.documentImport?.format === 'pdf' ? file : null)
    setValues((currentValues) => ({
      ...currentValues,
      title:
        currentValues.title.trim().length === 0
          ? importResult.title
          : currentValues.title,
      content: importResult.content,
      documentImport: importResult.documentImport,
    }))
    setErrors((currentErrors) => ({
      ...currentErrors,
      title: undefined,
      content: undefined,
    }))
    let statusText = `Imported ${importResult.fileName}. Review the content before saving.`

    if (importResult.warning) {
      if (importResult.metadata?.sourceType === 'pdf') {
        const partialTextWarning =
          importResult.metadata.pagesWithText < importResult.metadata.pageCount
            ? ` ${QA_SOURCE_PDF_PARTIAL_TEXT_WARNING}`
            : ''

        statusText =
          `Extracted readable text from ${importResult.fileName}: ` +
          `${importResult.metadata.pagesWithText} of ${importResult.metadata.pageCount} pages contained selectable text, ` +
          `${formatImportCount(importResult.metadata.characterCount)} characters. ` +
          `${importResult.warning}${partialTextWarning}`
      } else {
        statusText = `Extracted readable text from ${importResult.fileName}. ${importResult.warning}`
      }
    }

    setFileImportMessage({
      type: importResult.warning ? 'warning' : 'success',
      text: statusText,
    })
  }

  function handleCancelFileImport() {
    fileImportControllerRef.current?.abort()
  }

  function handleCancelForm() {
    fileImportRequestIdRef.current += 1
    fileImportControllerRef.current?.abort()
    onCancel()
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (isImportingFile) {
      return
    }

    const normalizedValues = normalizeValues(values)
    const nextErrors = validate(normalizedValues)

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors)

      if (nextErrors.title) {
        titleRef.current?.focus()
      } else if (nextErrors.content) {
        contentRef.current?.focus()
      }

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
            Store requirement, story, PRD, LLD, or notes text for coverage
            analysis and test design.
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
            <h4>Source Details</h4>
            <p>Classify the source so it is easy to find later.</p>
          </div>
        </div>

        <div className="form-grid">
          <div className="field-group field-group--full">
            <label className="field-label" htmlFor="qa-source-title">
              Source title
            </label>
            <input
              id="qa-source-title"
              ref={titleRef}
              name="title"
              className="input"
              value={values.title}
              onChange={handleFieldChange}
              aria-invalid={Boolean(errors.title)}
              aria-describedby={
                errors.title ? FIELD_ERROR_IDS.title : undefined
              }
            />
            {errors.title ? (
              <p id={FIELD_ERROR_IDS.title} className="field-error">
                {errors.title}
              </p>
            ) : null}
          </div>

          <div className="field-group">
            <label className="field-label" htmlFor="qa-source-type">
              Source type
            </label>
            <select
              id="qa-source-type"
              name="sourceType"
              className="select"
              value={values.sourceType}
              onChange={handleFieldChange}
            >
              {QA_SOURCE_TYPES.map((sourceType) => (
                <option key={sourceType} value={sourceType}>
                  {sourceType}
                </option>
              ))}
            </select>
          </div>

          <div className="field-group">
            <label className="field-label" htmlFor="qa-source-status">
              Source status
            </label>
            <select
              id="qa-source-status"
              name="status"
              className="select"
              value={values.status}
              onChange={handleFieldChange}
            >
              {QA_SOURCE_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      <section className="modal-form-section">
        <div className="panel-heading">
          <div className="panel-heading__content">
            <h4>Source Content</h4>
            <p>
              Import or paste the plain-text requirement, user story, PRD, LLD,
              or notes.
            </p>
          </div>
        </div>

        {!isImportingFile && <ProductEvidenceImport onApply={({ content, imported }) => {
          if (values.content.trim() && !window.confirm('Replace this unsaved source content with the reviewed product-evidence projection? The saved source stays unchanged until you save.')) return false
          setPdfFile(null); setValues((current) => ({ ...current, content, documentImport: imported, title: current.title.trim() || imported.fileName, sourceType: 'Other' })); setFileImportMessage({ type: 'warning', text: 'Product evidence projection applied. Review its scope and limitations, then save explicitly. No AI or Test Cases were created.' })
          return true
        }} />}

        <div className="field-group">
          <label className="field-label" htmlFor="qa-source-file-import">
            Import .txt, .md, .docx, or .pdf file
          </label>
          <p id={FILE_IMPORT_HELPER_ID} className="helper-text">
            Import plain text, Markdown, Word .docx, or text-based PDF files.
            TXT/Markdown and DOCX files can be up to 16 MB, and PDF up
            to 32 MB and 1,200 pages; extracted text is limited to 16 MB. PDF import
            accounts for pages without selectable text. Use page review for local
            OCR where supported, or manual transcription. Review before saving.
          </p>
          <input
            id="qa-source-file-import"
            ref={fileInputRef}
            className="input"
            type="file"
            accept=".txt,.md,.docx,.pdf,text/plain,text/markdown,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/pdf"
            aria-describedby={
              fileImportMessage
                ? `${FILE_IMPORT_HELPER_ID} ${FILE_IMPORT_STATUS_ID}`
                : FILE_IMPORT_HELPER_ID
            }
            disabled={isImportingFile}
            onChange={handleFileImportChange}
          />
          {isImportingFile ? (
            <div className="qa-source-import-progress">
              <div
                className="qa-source-import-progress__status"
                role="status"
                aria-live="polite"
              >
                {fileImportProgress ? (
                  <>
                    <label htmlFor="qa-source-file-import-progress">
                      Extracting {activeImportFileName}: page{' '}
                      {fileImportProgress.processedPages} of{' '}
                      {fileImportProgress.totalPages} ({fileImportProgress.pagesWithText}{' '}
                      with selectable text). Existing source content stays
                      unchanged until confirmation.
                    </label>
                    <progress
                      id="qa-source-file-import-progress"
                      value={fileImportProgress.processedPages}
                      max={fileImportProgress.totalPages}
                    />
                  </>
                ) : (
                  <span>
                    Preparing {activeImportFileName}… Existing source content
                    stays unchanged until confirmation.
                  </span>
                )}
              </div>
              <button
                ref={cancelImportButtonRef}
                type="button"
                className="button button--secondary button--compact"
                onClick={handleCancelFileImport}
              >
                Cancel import
              </button>
            </div>
          ) : null}
          {fileImportMessage ? (
            <p
              id={FILE_IMPORT_STATUS_ID}
              className={
                fileImportMessage.type === 'error'
                  ? 'field-error'
                  : fileImportMessage.type === 'warning'
                    ? 'qa-source-import-warning'
                    : 'helper-text'
              }
              role={fileImportMessage.type === 'error' ? 'alert' : 'status'}
              aria-live="polite"
            >
              {fileImportMessage.text}
            </p>
          ) : null}
        </div>

        {values.documentImport?.format === 'pdf' && !isImportingFile && <PdfPageReview key={values.documentImport.contentFingerprint} file={pdfFile} content={values.content} imported={values.documentImport} onAttach={setPdfFile} onApply={(value) => { setValues((current) => ({ ...current, ...value })); setFileImportMessage({ type: 'success', text: 'Reviewed page applied to this unsaved source. Save the source to keep it; no AI or Test Cases were created.' }) }} />}

        <div className="field-group">
          <label className="field-label" htmlFor="qa-source-content">
            Source content
          </label>
          <textarea
            id="qa-source-content"
            ref={contentRef}
            name="content"
            className="textarea qa-source-content-input"
            value={values.content}
            onChange={handleFieldChange}
            aria-invalid={Boolean(errors.content)}
            aria-describedby={
              errors.content ? FIELD_ERROR_IDS.content : undefined
            }
            placeholder="Paste reviewed source material here as plain text."
          />
          {errors.content ? (
            <p id={FIELD_ERROR_IDS.content} className="field-error">
              {errors.content}
            </p>
          ) : null}
        </div>
      </section>

      <section className="modal-form-section">
        <div className="panel-heading">
          <div className="panel-heading__content">
            <h4>QA Notes</h4>
            <p>Capture review notes, assumptions, or testing concerns.</p>
          </div>
        </div>

        <div className="field-group">
          <label className="field-label" htmlFor="qa-source-notes">
            Notes
          </label>
          <textarea
            id="qa-source-notes"
            name="notes"
            className="textarea textarea--compact"
            value={values.notes}
            onChange={handleFieldChange}
            placeholder="Optional QA notes."
          />
        </div>
      </section>

      <div className="modal-footer button-row">
        <button
          type="submit"
          className="button button--primary"
          disabled={isImportingFile}
        >
          {submitLabel}
        </button>
        <button
          type="button"
          className="button button--secondary"
          onClick={handleCancelForm}
        >
          Cancel
        </button>
      </div>
    </form>
  )
}
