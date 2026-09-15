import { useState } from 'react'
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createQaSource } from '../../test/qaSourceFactory'
import { resolveAiSectionCoveragePlanContext } from '../ai-suggestions/aiSectionCoveragePlanContext'
import type {
  AiSectionCoveragePlanProvider,
  AiSectionCoveragePlanProviderResult,
  PersistedSectionCoveragePlanRecord,
} from '../ai-suggestions/aiSectionCoveragePlanTypes'
import { parseAiSectionCoveragePlanResponse } from '../ai-suggestions/aiSectionCoveragePlanValidation'
import {
  createPersistedSectionCoveragePlanRecord,
  type SaveSectionCoveragePlansResult,
} from '../../lib/storage/sectionCoveragePlanStorage'
import {
  createQaSourceSectionIndex,
  type QaSourceSectionIndex,
} from './qaSourceSections'
import {
  QA_SOURCE_DOCX_IMPORT_WARNING,
  QA_SOURCE_DOCX_UNREADABLE_MESSAGE,
  QA_SOURCE_FILE_EMPTY_MESSAGE,
  QA_SOURCE_FILE_IMPORT_CANCELED_MESSAGE,
  QA_SOURCE_FILE_TOO_LARGE_MESSAGE,
  QA_SOURCE_FILE_UNSUPPORTED_MESSAGE,
  QA_SOURCE_LEGACY_DOC_UNSUPPORTED_MESSAGE,
  QA_SOURCE_TEXT_FILE_MAX_BYTES,
  QA_SOURCE_PDF_IMPORT_WARNING,
  QA_SOURCE_PDF_INVALID_MESSAGE,
  QA_SOURCE_PDF_PARTIAL_TEXT_WARNING,
  QA_SOURCE_PDF_UNREADABLE_MESSAGE,
} from './qaSourceFileImport'
import type { QaSource } from './qaSourceTypes'
import { QaSourcesPage } from './QaSourcesPage'

const mockExtractRawText = vi.hoisted(() => vi.fn())
const mockGetDocument = vi.hoisted(() => vi.fn())

vi.mock('mammoth', () => ({
  default: {
    extractRawText: mockExtractRawText,
  },
  extractRawText: mockExtractRawText,
}))

vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: {
    workerSrc: '',
  },
  getDocument: mockGetDocument,
}))

vi.mock('pdfjs-dist/build/pdf.worker.mjs?url', () => ({
  default: '/assets/pdf.worker.mjs',
}))

function renderQaSourcesPage({
  initialSources = [],
  sourceSectionIndexes = [],
  sectionCoveragePlanRecords = [],
  sectionCoveragePlanProvider,
  onUpsertSectionCoveragePlan = () => ({ ok: true, error: null }),
  onBuildGlobalCoveragePlan,
}: {
  initialSources?: QaSource[]
  sourceSectionIndexes?: QaSourceSectionIndex[]
  sectionCoveragePlanRecords?: PersistedSectionCoveragePlanRecord[]
  sectionCoveragePlanProvider?: AiSectionCoveragePlanProvider
  onUpsertSectionCoveragePlan?: (
    record: PersistedSectionCoveragePlanRecord,
    replacedRecordId?: string,
  ) => SaveSectionCoveragePlansResult
  onBuildGlobalCoveragePlan?: (
    sourceId: string,
    records: PersistedSectionCoveragePlanRecord[],
  ) => void
} = {}) {
  const provider =
    sectionCoveragePlanProvider ??
    ({
      isAvailable: true,
      generateSectionCoveragePlan: vi.fn(),
    } satisfies AiSectionCoveragePlanProvider)

  function Harness() {
    const [qaSources, setQaSources] = useState(initialSources)
    const [selectedMergeRecords, setSelectedMergeRecords] = useState<
      PersistedSectionCoveragePlanRecord[]
    >([])

    return (
      <QaSourcesPage
        qaSources={qaSources}
        sourceSectionIndexes={sourceSectionIndexes}
        sectionCoveragePlanRecords={sectionCoveragePlanRecords}
        sectionCoveragePlanProvider={provider}
        onUpsertSectionCoveragePlan={onUpsertSectionCoveragePlan}
        selectedMergeRecords={selectedMergeRecords}
        onSelectedMergeRecordsChange={setSelectedMergeRecords}
        onBuildGlobalCoveragePlan={onBuildGlobalCoveragePlan}
        onChange={setQaSources}
      />
    )
  }

  render(<Harness />)
}

function createDeferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })

  return { promise, resolve, reject }
}

function createSavedSectionRecord(
  qaSource: QaSource,
  sectionTitle: string,
  analyzedAt = '2026-07-18T08:01:00.000Z',
) {
  const sectionIndex = createQaSourceSectionIndex(qaSource)
  const section = sectionIndex.sections.find(
    (candidate) => candidate.title === sectionTitle,
  )

  if (!section) {
    throw new Error('Expected section ' + sectionTitle + '.')
  }

  const contextResult = resolveAiSectionCoveragePlanContext({
    qaSource,
    sectionIndex,
    selectedSection: {
      sectionId: section.id,
      stableKey: section.stableKey,
    },
  })

  if (!contextResult.ok) {
    throw new Error(contextResult.error)
  }

  const normalized = parseAiSectionCoveragePlanResponse(
    {
      schemaVersion: 'section-coverage-plan-json-v1',
      coverageAreas: [],
      actors: [],
      states: [],
      inputs: [],
      failureModes: [],
      integrationRisks: [],
      permissionsSecurity: [],
      dataPersistenceConcerns: [],
      ambiguities: [],
      nextCoverage: [],
      warnings: [],
    },
    { visibleSectionContent: contextResult.context.visibleSection.content },
  )

  if (!normalized.ok || !normalized.plan) {
    throw new Error(normalized.error ?? 'Expected a normalized section plan.')
  }

  return {
    sectionIndex,
    section,
    record: createPersistedSectionCoveragePlanRecord({
      context: contextResult.context,
      plan: normalized.plan,
      analyzedAt,
    }),
  }
}

function getSourceCard(title: string) {
  const heading = screen.getByRole('heading', { name: title })
  const card = heading.closest('article')

  if (!card) {
    throw new Error(`Could not find QA source card for "${title}"`)
  }

  return within(card)
}

function createSourceFile(name: string, content: string, type = 'text/plain') {
  return new File([content], name, { type })
}

function createDocxZipMetadata() {
  const encodedName = new TextEncoder().encode('word/document.xml')
  const centralDirectorySize = 46 + encodedName.length
  const buffer = new ArrayBuffer(centralDirectorySize + 22)
  const bytes = new Uint8Array(buffer)
  const view = new DataView(buffer)

  view.setUint32(0, 0x02014b50, true)
  view.setUint32(24, 1024, true)
  view.setUint16(28, encodedName.length, true)
  bytes.set(encodedName, 46)

  view.setUint32(centralDirectorySize, 0x06054b50, true)
  view.setUint16(centralDirectorySize + 8, 1, true)
  view.setUint16(centralDirectorySize + 10, 1, true)
  view.setUint32(centralDirectorySize + 12, centralDirectorySize, true)
  view.setUint32(centralDirectorySize + 16, 0, true)

  return buffer
}

const DOCX_EXTRACTED_TEXT =
  'Customer Notification LLD\n\nPayment authorization must handle approved, declined, and timeout responses.\n\nHebrew requirement line\n\nBullet: Send customer notification after approval.\n'
const PDF_EXTRACTED_TEXT =
  'QA Source PDF Fixture Payment authorization must handle approved, declined, and timeout responses.'

function createDocxFile(content: BlobPart = createDocxZipMetadata()) {
  return new File([content], 'customer-notification-lld.docx', {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  })
}

function createPdfFile(content: BlobPart = '%PDF-1.7\n') {
  return new File([content], 'customer-notification-lld.pdf', {
    type: 'application/pdf',
  })
}

function mockPdfExtraction({
  text,
  numPages = 1,
  pageTexts,
}: {
  text: string
  numPages?: number
  pageTexts?: string[]
}) {
  const destroy = vi.fn(() => Promise.resolve())

  mockGetDocument.mockReturnValueOnce({
    promise: Promise.resolve({
      numPages,
      getPage: (pageNumber: number) => {
        const pageText = pageTexts ? pageTexts[pageNumber - 1] ?? '' : text

        return Promise.resolve({
          getTextContent: () =>
            Promise.resolve({
              items: pageText ? [{ str: pageText }] : [],
            }),
        })
      },
    }),
    destroy,
  })
}

async function openCreateDialog(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'New QA Source' }))

  return within(screen.getByRole('dialog', { name: 'Create QA Source' }))
}

async function createSourceThroughPage(
  user: ReturnType<typeof userEvent.setup>,
  values: {
    title: string
    sourceType?: QaSource['sourceType']
    status?: QaSource['status']
    content: string
    notes?: string
  },
) {
  await user.click(screen.getByRole('button', { name: 'New QA Source' }))

  const dialog = within(screen.getByRole('dialog', { name: 'Create QA Source' }))

  await user.type(dialog.getByLabelText('Source title'), values.title)

  if (values.sourceType) {
    await user.selectOptions(
      dialog.getByLabelText('Source type'),
      values.sourceType,
    )
  }

  if (values.status) {
    await user.selectOptions(dialog.getByLabelText('Source status'), values.status)
  }

  await user.type(dialog.getByLabelText('Source content'), values.content)

  if (values.notes) {
    await user.type(dialog.getByLabelText('Notes'), values.notes)
  }

  await user.click(dialog.getByRole('button', { name: 'Create QA Source' }))
}

afterEach(() => {
  vi.restoreAllMocks()
  mockExtractRawText.mockReset()
  mockGetDocument.mockReset()
})

describe('QaSourcesPage', () => {
  it('shows an empty state and creates a QA source', async () => {
    const user = userEvent.setup()

    renderQaSourcesPage()

    expect(screen.getByText('No QA sources yet')).toBeInTheDocument()

    await createSourceThroughPage(user, {
      title: 'Checkout LLD',
      sourceType: 'LLD',
      status: 'Draft',
      content: 'Checkout service validates card payments before capture.',
      notes: 'Review retry behavior.',
    })

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    const card = getSourceCard('Checkout LLD')

    expect(card.getAllByText('LLD').length).toBeGreaterThan(0)
    expect(card.getByText('Draft')).toBeInTheDocument()
    expect(
      card.getByText('Checkout service validates card payments before capture.'),
    ).toBeInTheDocument()
    expect(card.getByText('Review retry behavior.')).toBeInTheDocument()
  })

  it('shows Source Structure collapsed by default and expands section details', async () => {
    const user = userEvent.setup()
    const content = [
      '# Authentication',
      'Users sign in with valid credentials.',
      '',
      '## Locked accounts',
      'Locked accounts require support review.',
    ].join('\n')

    renderQaSourcesPage({
      initialSources: [
        createQaSource({
          id: 'source-1',
          title: 'Authentication LLD',
          content,
        }),
      ],
    })

    const card = getSourceCard('Authentication LLD')
    const sourceStructureSummary = card.getByText('Source Structure')
    const sourceStructurePanel = sourceStructureSummary.closest('details')

    expect(sourceStructurePanel).not.toHaveAttribute('open')
    expect(card.getByText('2 sections')).toBeVisible()
    expect(
      card.getByText(/Sections are deterministic source-structure helpers/),
    ).not.toBeVisible()

    await user.click(sourceStructureSummary)

    expect(
      card.getByText(/Sections are deterministic source-structure helpers/),
    ).toBeVisible()
    expect(card.getByText('1. Authentication')).toBeVisible()
    expect(card.getByText('2. Locked accounts')).toBeVisible()
    expect(card.getByText('Path: Authentication / Locked accounts')).toBeVisible()
    expect(card.getByText(/Lines 4-5/)).toBeVisible()
  })

  it('shows fallback source structure warnings for unheaded text', async () => {
    const user = userEvent.setup()

    renderQaSourcesPage({
      initialSources: [
        createQaSource({
          id: 'source-1',
          title: 'Unheaded Notes',
          content: 'Payment behavior.\nRetry behavior.\nNotification behavior.',
        }),
      ],
    })

    const card = getSourceCard('Unheaded Notes')

    await user.click(card.getByText('Source Structure'))

    expect(card.getByText('1 section')).toBeVisible()
    expect(card.getByText('1. Part 1')).toBeVisible()
    expect(
      card.getByText(
        'No reliable headings were detected; source structure uses fallback parts.',
      ),
    ).toBeVisible()
  })

  it('guides large-source review without contacting AI until analysis is explicit', async () => {
    const user = userEvent.setup()
    const generateSectionCoveragePlan = vi.fn()
    const content = [
      '# Authentication',
      'A'.repeat(24_100),
      '# Billing',
      'Billing retries require idempotency.',
    ].join('\n')

    renderQaSourcesPage({
      initialSources: [
        createQaSource({
          id: 'source-large',
          title: 'Enterprise PRD',
          content,
        }),
      ],
      sectionCoveragePlanProvider: {
        isAvailable: true,
        generateSectionCoveragePlan,
      },
    })

    const card = getSourceCard('Enterprise PRD')

    await user.click(card.getByText('Source Structure'))

    const guide = card.getByRole('region', {
      name: 'Large source — guided review',
    })
    const sectionGroup = card.getByRole('radiogroup', {
      name: 'Select one section from Enterprise PRD for analysis',
    })

    expect(guide).toHaveTextContent(/Analyze Entire Specification processes all .* characters/i)
    expect(guide).toHaveTextContent(/not coverage proof/i)
    expect(within(sectionGroup).getAllByRole('radio')).toHaveLength(2)

    await user.click(within(guide).getByRole('radio', { name: 'Oversized' }))

    expect(within(guide).getByText('Showing 1 of 2 sections.')).toBeVisible()
    expect(within(sectionGroup).getAllByRole('radio')).toHaveLength(1)
    expect(within(sectionGroup).getByRole('radio')).toHaveAccessibleName(
      /Authentication/,
    )

    await user.click(
      within(guide).getByRole('button', { name: 'Select next section' }),
    )

    const analyzeButton = card.getByRole('button', { name: 'Analyze section' })

    expect(within(sectionGroup).getByRole('radio')).toBeChecked()
    expect(analyzeButton).toBeVisible()
    expect(analyzeButton).toBeDisabled()
    expect(sectionGroup).toHaveClass('source-structure-selection--guided')
    expect(
      sectionGroup.compareDocumentPosition(analyzeButton) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(generateSectionCoveragePlan).not.toHaveBeenCalled()

    await user.click(within(guide).getByRole('radio', { name: 'Failed' }))

    expect(
      within(sectionGroup).getByText(/No sections match this review filter/),
    ).toBeVisible()
    expect(
      within(guide).getByRole('button', { name: 'Select next section' }),
    ).toBeDisabled()
    expect(generateSectionCoveragePlan).not.toHaveBeenCalled()
  })

  it('edits QA source metadata, content, and notes', async () => {
    const user = userEvent.setup()

    renderQaSourcesPage({
      initialSources: [
        createQaSource({
          id: 'source-1',
          title: 'Checkout requirement',
          sourceType: 'Requirement',
          status: 'Draft',
        }),
      ],
    })

    await user.click(getSourceCard('Checkout requirement').getByRole('button', {
      name: 'Edit',
    }))

    const dialog = within(screen.getByRole('dialog', { name: 'Edit QA Source' }))

    await user.clear(dialog.getByLabelText('Source title'))
    await user.type(dialog.getByLabelText('Source title'), 'Checkout reviewed LLD')
    await user.selectOptions(dialog.getByLabelText('Source type'), 'LLD')
    await user.selectOptions(
      dialog.getByLabelText('Source status'),
      'Ready for test design',
    )
    await user.clear(dialog.getByLabelText('Source content'))
    await user.type(
      dialog.getByLabelText('Source content'),
      'LLD now documents payment validation and timeout handling.',
    )
    await user.clear(dialog.getByLabelText('Notes'))
    await user.type(dialog.getByLabelText('Notes'), 'Ready to derive cases later.')
    await user.click(dialog.getByRole('button', { name: 'Save changes' }))

    const card = getSourceCard('Checkout reviewed LLD')

    expect(card.getAllByText('LLD').length).toBeGreaterThan(0)
    expect(card.getByText('Ready for test design')).toBeInTheDocument()
    expect(
      card.getByText('LLD now documents payment validation and timeout handling.'),
    ).toBeInTheDocument()
    expect(card.getByText('Ready to derive cases later.')).toBeInTheDocument()
  })

  it('validates title and content', async () => {
    const user = userEvent.setup()

    renderQaSourcesPage()

    await user.click(screen.getByRole('button', { name: 'New QA Source' }))

    const dialog = within(screen.getByRole('dialog', { name: 'Create QA Source' }))

    await user.click(dialog.getByRole('button', { name: 'Create QA Source' }))

    expect(dialog.getByLabelText('Source title')).toHaveFocus()
    expect(dialog.getByText('Source title is required.')).toBeInTheDocument()
    expect(dialog.getByText('Source content is required.')).toBeInTheDocument()
  })

  it('imports a txt file into an empty source form and saves it normally', async () => {
    const user = userEvent.setup()

    renderQaSourcesPage()

    const dialog = await openCreateDialog(user)
    const content =
      '  Login requirement: the user can sign in with valid data.\n    Preserve source indentation.\n'

    await user.upload(
      dialog.getByLabelText('Import .txt, .md, .docx, or .pdf file'),
      createSourceFile('login-requirement.txt', content),
    )

    expect(
      dialog.getByText(
        'Imported login-requirement.txt. Review the content before saving.',
      ),
    ).toBeInTheDocument()
    expect(dialog.getByLabelText('Source title')).toHaveValue(
      'login requirement',
    )
    expect(dialog.getByLabelText('Source content')).toHaveValue(content)

    await user.click(dialog.getByRole('button', { name: 'Create QA Source' }))

    await user.click(
      getSourceCard('login requirement').getByRole('button', { name: 'Edit' }),
    )

    const editDialog = within(
      screen.getByRole('dialog', { name: 'Edit QA Source' }),
    )

    expect(editDialog.getByLabelText('Source content')).toHaveValue(
      content,
    )
  })

  it('imports a markdown file and preserves Markdown text', async () => {
    const user = userEvent.setup()

    renderQaSourcesPage()

    const dialog = await openCreateDialog(user)
    const markdown = ['# Checkout LLD', '', '- Authorize card', '- Send receipt'].join(
      '\n',
    )

    await user.upload(
      dialog.getByLabelText('Import .txt, .md, .docx, or .pdf file'),
      createSourceFile('checkout-lld.md', markdown, 'text/markdown'),
    )

    expect(dialog.getByLabelText('Source title')).toHaveValue('checkout lld')
    expect(dialog.getByLabelText('Source content')).toHaveValue(markdown)
  })

  it('imports a docx file and shows extraction limitations before saving', async () => {
    const user = userEvent.setup()
    mockExtractRawText.mockResolvedValueOnce({
      value: DOCX_EXTRACTED_TEXT,
    })

    renderQaSourcesPage()

    const dialog = await openCreateDialog(user)

    await user.upload(
      dialog.getByLabelText('Import .txt, .md, .docx, or .pdf file'),
      createDocxFile(),
    )

    expect(dialog.getByLabelText('Source title')).toHaveValue(
      'customer notification lld',
    )
    expect(dialog.getByLabelText('Source content')).toHaveValue(
      DOCX_EXTRACTED_TEXT,
    )
    const warning = dialog.getByRole('status')

    expect(warning).toHaveTextContent(
      `Extracted readable text from customer-notification-lld.docx. ${QA_SOURCE_DOCX_IMPORT_WARNING}`,
    )
    expect(warning).toHaveClass('qa-source-import-warning')

    await user.click(dialog.getByRole('button', { name: 'Create QA Source' }))

    await user.click(
      getSourceCard('customer notification lld').getByRole('button', {
        name: 'Edit',
      }),
    )

    const editDialog = within(
      screen.getByRole('dialog', { name: 'Edit QA Source' }),
    )

    expect(editDialog.getByLabelText('Source content')).toHaveValue(
      DOCX_EXTRACTED_TEXT,
    )
  })

  it('imports a pdf file and shows extraction limitations before saving', async () => {
    const user = userEvent.setup()
    mockPdfExtraction({ text: PDF_EXTRACTED_TEXT })

    renderQaSourcesPage()

    const dialog = await openCreateDialog(user)

    await user.upload(
      dialog.getByLabelText('Import .txt, .md, .docx, or .pdf file'),
      createPdfFile(),
    )

    await waitFor(() => expect(dialog.getByLabelText('Source title')).toHaveValue(
      'customer notification lld',
    ))
    expect(dialog.getByLabelText('Source content')).toHaveValue(
      PDF_EXTRACTED_TEXT,
    )
    const warning = dialog.getByRole('status')

    expect(warning).toHaveTextContent(
      `Extracted readable text from customer-notification-lld.pdf: 1 of 1 pages contained selectable text, ${PDF_EXTRACTED_TEXT.length} characters. ${QA_SOURCE_PDF_IMPORT_WARNING}`,
    )
    expect(warning).toHaveClass('qa-source-import-warning')

    await user.click(dialog.getByRole('button', { name: 'Create QA Source' }))

    await user.click(
      getSourceCard('customer notification lld').getByRole('button', {
        name: 'Edit',
      }),
    )

    const editDialog = within(
      screen.getByRole('dialog', { name: 'Edit QA Source' }),
    )

    expect(editDialog.getByLabelText('Source content')).toHaveValue(
      PDF_EXTRACTED_TEXT,
    )
  })

  it('warns when only some pdf pages contain selectable text', async () => {
    const user = userEvent.setup()
    mockPdfExtraction({
      text: '',
      numPages: 3,
      pageTexts: ['First selectable page', '', 'Third selectable page'],
    })

    renderQaSourcesPage()

    const dialog = await openCreateDialog(user)

    await user.upload(
      dialog.getByLabelText('Import .txt, .md, .docx, or .pdf file'),
      createPdfFile(),
    )

    await waitFor(() => expect(dialog.getByRole('status')).toHaveTextContent(
      'Extracted readable text from customer-notification-lld.pdf: 2 of 3 pages contained selectable text',
    ))
    const warning = dialog.getByRole('status')
    expect(warning).toHaveTextContent(QA_SOURCE_PDF_IMPORT_WARNING)
    expect(warning).toHaveTextContent(QA_SOURCE_PDF_PARTIAL_TEXT_WARNING)
    expect(dialog.getByLabelText('Source content')).toHaveValue(
      [
        '--- Page 1 ---',
        'First selectable page',
        '',
        '--- Page 2 ---',
        '[Page 2: no selectable text — needs review]',
        '',
        '--- Page 3 ---',
        'Third selectable page',
      ].join('\n'),
    )
  })

  it('shows bounded pdf progress and cancels without replacing source content', async () => {
    const user = userEvent.setup()
    const textContent = createDeferred<{ items: Array<{ str: string }> }>()
    const destroy = vi.fn(() => Promise.resolve())

    mockGetDocument.mockReturnValueOnce({
      promise: Promise.resolve({
        numPages: 3,
        getPage: () =>
          Promise.resolve({
            getTextContent: () => textContent.promise,
            cleanup: vi.fn(),
          }),
      }),
      destroy,
    })

    renderQaSourcesPage()

    const dialog = await openCreateDialog(user)
    const sourceContent = dialog.getByLabelText('Source content')
    const fileInput = dialog.getByLabelText(
      'Import .txt, .md, .docx, or .pdf file',
    )

    await user.type(sourceContent, 'Existing reviewed source text.')
    fireEvent.change(fileInput, {
      target: { files: [createPdfFile()] },
    })

    expect(
      await dialog.findByText(
        /Extracting customer-notification-lld\.pdf: page 0 of 3/,
      ),
    ).toBeVisible()
    expect(fileInput).toBeDisabled()
    expect(
      dialog.getByRole('button', { name: 'Create QA Source' }),
    ).toBeDisabled()
    expect(dialog.getByRole('button', { name: 'Cancel import' })).toHaveFocus()
    expect(sourceContent).toHaveValue('Existing reviewed source text.')

    await user.click(dialog.getByRole('button', { name: 'Cancel import' }))

    expect(
      await dialog.findByText(QA_SOURCE_FILE_IMPORT_CANCELED_MESSAGE),
    ).toBeVisible()
    expect(fileInput).toBeEnabled()
    expect(fileInput).toHaveFocus()
    expect(
      dialog.getByRole('button', { name: 'Create QA Source' }),
    ).toBeEnabled()
    expect(sourceContent).toHaveValue('Existing reviewed source text.')
    expect(destroy).toHaveBeenCalledTimes(1)
  })

  it('does not overwrite an existing title when importing a file', async () => {
    const user = userEvent.setup()

    renderQaSourcesPage()

    const dialog = await openCreateDialog(user)

    await user.type(dialog.getByLabelText('Source title'), 'Custom source title')
    await user.upload(
      dialog.getByLabelText('Import .txt, .md, .docx, or .pdf file'),
      createSourceFile('file-name.md', 'Imported file content.'),
    )

    expect(dialog.getByLabelText('Source title')).toHaveValue(
      'Custom source title',
    )
    expect(dialog.getByLabelText('Source content')).toHaveValue(
      'Imported file content.',
    )
  })

  it('does not overwrite an existing title when importing a pdf file', async () => {
    const user = userEvent.setup()
    mockPdfExtraction({ text: PDF_EXTRACTED_TEXT })

    renderQaSourcesPage()

    const dialog = await openCreateDialog(user)

    await user.type(dialog.getByLabelText('Source title'), 'Custom PDF title')
    await user.upload(
      dialog.getByLabelText('Import .txt, .md, .docx, or .pdf file'),
      createPdfFile(),
    )

    await waitFor(() => expect(dialog.getByLabelText('Source content')).toHaveValue(PDF_EXTRACTED_TEXT))
    expect(dialog.getByLabelText('Source title')).toHaveValue('Custom PDF title')
  })

  it('does not replace existing content when file import confirmation is canceled', async () => {
    const user = userEvent.setup()
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)

    renderQaSourcesPage()

    const dialog = await openCreateDialog(user)

    await user.type(dialog.getByLabelText('Source content'), 'Existing source text.')
    await user.upload(
      dialog.getByLabelText('Import .txt, .md, .docx, or .pdf file'),
      createSourceFile('replacement.md', 'Replacement source text.'),
    )

    expect(confirmSpy).toHaveBeenCalledWith(
      'Replace current source content with text from "replacement.md"?',
    )
    expect(dialog.getByLabelText('Source content')).toHaveValue(
      'Existing source text.',
    )
    expect(
      dialog.getByText('Import canceled. Existing source content was kept.'),
    ).toBeInTheDocument()
  })

  it('does not replace existing content when pdf import confirmation is canceled', async () => {
    const user = userEvent.setup()
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    mockPdfExtraction({ text: PDF_EXTRACTED_TEXT })

    renderQaSourcesPage()

    const dialog = await openCreateDialog(user)

    await user.type(dialog.getByLabelText('Source content'), 'Existing source text.')
    await user.upload(
      dialog.getByLabelText('Import .txt, .md, .docx, or .pdf file'),
      createPdfFile(),
    )

    await waitFor(() => expect(confirmSpy).toHaveBeenCalledWith(
      `Replace current source content with text from "customer-notification-lld.pdf"?\n\n${QA_SOURCE_PDF_IMPORT_WARNING}`,
    ))
    expect(dialog.getByLabelText('Source content')).toHaveValue(
      'Existing source text.',
    )
    expect(
      dialog.getByText('Import canceled. Existing source content was kept.'),
    ).toBeInTheDocument()
  })

  it('replaces existing content when file import confirmation is accepted', async () => {
    const user = userEvent.setup()
    vi.spyOn(window, 'confirm').mockReturnValue(true)

    renderQaSourcesPage()

    const dialog = await openCreateDialog(user)

    await user.type(dialog.getByLabelText('Source title'), 'Manual title')
    await user.type(dialog.getByLabelText('Source content'), 'Existing source text.')
    await user.upload(
      dialog.getByLabelText('Import .txt, .md, .docx, or .pdf file'),
      createSourceFile('replacement.md', 'Replacement source text.'),
    )

    expect(dialog.getByLabelText('Source title')).toHaveValue('Manual title')
    expect(dialog.getByLabelText('Source content')).toHaveValue(
      'Replacement source text.',
    )
  })

  it('shows a clear error for unsupported source files', async () => {
    const user = userEvent.setup()

    renderQaSourcesPage()

    const dialog = await openCreateDialog(user)

    fireEvent.change(dialog.getByLabelText('Import .txt, .md, .docx, or .pdf file'), {
      target: {
        files: [createSourceFile('source.png', 'PNG data', 'image/png')],
      },
    })

    expect(
      await screen.findByText(QA_SOURCE_FILE_UNSUPPORTED_MESSAGE),
    ).toBeInTheDocument()
  })

  it('shows a clear error for legacy doc files', async () => {
    const user = userEvent.setup()

    renderQaSourcesPage()

    const dialog = await openCreateDialog(user)

    fireEvent.change(dialog.getByLabelText('Import .txt, .md, .docx, or .pdf file'), {
      target: {
        files: [createSourceFile('source.doc', 'Legacy DOC content')],
      },
    })

    expect(
      await screen.findByText(QA_SOURCE_LEGACY_DOC_UNSUPPORTED_MESSAGE),
    ).toBeInTheDocument()
  })

  it('shows a clear error for too-large source files', async () => {
    const user = userEvent.setup()

    renderQaSourcesPage()

    const dialog = await openCreateDialog(user)

    fireEvent.change(dialog.getByLabelText('Import .txt, .md, .docx, or .pdf file'), {
      target: {
        files: [{ name: 'large.md', size: QA_SOURCE_TEXT_FILE_MAX_BYTES + 1 }],
      },
    })

    expect(
      await screen.findByText(QA_SOURCE_FILE_TOO_LARGE_MESSAGE),
    ).toBeInTheDocument()
  })

  it('shows a clear error for empty source files', async () => {
    const user = userEvent.setup()

    renderQaSourcesPage()

    const dialog = await openCreateDialog(user)

    await user.upload(
      dialog.getByLabelText('Import .txt, .md, .docx, or .pdf file'),
      createSourceFile('empty.txt', '   '),
    )

    expect(
      await screen.findByText(QA_SOURCE_FILE_EMPTY_MESSAGE),
    ).toBeInTheDocument()
  })

  it('shows a clear error for corrupt docx files', async () => {
    const user = userEvent.setup()
    mockExtractRawText.mockRejectedValueOnce(new Error('corrupt docx'))

    renderQaSourcesPage()

    const dialog = await openCreateDialog(user)

    await user.upload(
      dialog.getByLabelText('Import .txt, .md, .docx, or .pdf file'),
      createSourceFile('corrupt.docx', 'not a real docx', 'application/octet-stream'),
    )

    expect(
      await screen.findByText(QA_SOURCE_DOCX_UNREADABLE_MESSAGE),
    ).toBeInTheDocument()
  })

  it('shows a clear error for renamed non-pdf content', async () => {
    const user = userEvent.setup()

    renderQaSourcesPage()

    const dialog = await openCreateDialog(user)

    await user.upload(
      dialog.getByLabelText('Import .txt, .md, .docx, or .pdf file'),
      createPdfFile('not really a PDF'),
    )

    expect(
      await screen.findByText(QA_SOURCE_PDF_INVALID_MESSAGE),
    ).toBeInTheDocument()
  })

  it('retains scan-only pages as explicit review material', async () => {
    const user = userEvent.setup()
    mockPdfExtraction({ text: '' })

    renderQaSourcesPage()

    const dialog = await openCreateDialog(user)

    await user.upload(
      dialog.getByLabelText('Import .txt, .md, .docx, or .pdf file'),
      createPdfFile(),
    )

    expect(
      await screen.findByText(/0 of 1 pages contained selectable text/),
    ).toBeInTheDocument()
    expect(dialog.getByLabelText('Source content')).toHaveValue('[Page 1: no selectable text — needs review]')
  })

  it('shows a clear error for corrupt pdf files', async () => {
    const user = userEvent.setup()

    mockGetDocument.mockImplementationOnce(() => {
      throw new Error('corrupt pdf')
    })

    renderQaSourcesPage()

    const dialog = await openCreateDialog(user)

    await user.upload(
      dialog.getByLabelText('Import .txt, .md, .docx, or .pdf file'),
      createPdfFile(),
    )

    expect(
      await screen.findByText(QA_SOURCE_PDF_UNREADABLE_MESSAGE),
    ).toBeInTheDocument()
  })

  it('deletes a QA source with confirmation', async () => {
    const user = userEvent.setup()
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)

    renderQaSourcesPage({
      initialSources: [
        createQaSource({ id: 'source-1', title: 'Checkout LLD' }),
        createQaSource({ id: 'source-2', title: 'Profile story' }),
      ],
    })

    await user.click(
      getSourceCard('Checkout LLD').getByRole('button', { name: 'Delete' }),
    )

    expect(confirmSpy).toHaveBeenCalledWith('Delete "Checkout LLD"?')
    expect(screen.queryByText('Checkout LLD')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Open source: Profile story' })).toBeInTheDocument()
    expect(screen.getByText('1 total')).toBeInTheDocument()
  })

  it('searches title, content, and notes', async () => {
    const user = userEvent.setup()

    renderQaSourcesPage({
      initialSources: [
        createQaSource({
          id: 'source-1',
          title: 'Checkout LLD',
          content: 'Payment timeout behavior.',
          notes: 'Review gateway assumptions.',
        }),
        createQaSource({
          id: 'source-2',
          title: 'Profile story',
          content: 'User can update profile details.',
          notes: 'Needs avatar coverage.',
        }),
      ],
    })

    const filters = within(
      screen.getByRole('region', { name: 'Source Search and Filters' }),
    )

    await user.type(filters.getByLabelText('Search sources'), 'avatar')

    expect(screen.queryByText('Checkout LLD')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Open source: Profile story' })).toBeInTheDocument()

    await user.click(filters.getByRole('button', { name: 'Clear filters' }))
    await user.type(filters.getByLabelText('Search sources'), 'timeout')

    expect(screen.getByRole('button', { name: 'Open source: Checkout LLD' })).toBeInTheDocument()
    expect(screen.queryByText('Profile story')).not.toBeInTheDocument()
  })

  it('filters by source type and status', async () => {
    const user = userEvent.setup()

    renderQaSourcesPage({
      initialSources: [
        createQaSource({
          id: 'source-1',
          title: 'Checkout LLD',
          sourceType: 'LLD',
          status: 'Ready for test design',
        }),
        createQaSource({
          id: 'source-2',
          title: 'Profile story',
          sourceType: 'User Story',
          status: 'Reviewed',
        }),
      ],
    })

    const filters = within(
      screen.getByRole('region', { name: 'Source Search and Filters' }),
    )

    await user.selectOptions(filters.getByLabelText('Filter by source type'), 'LLD')

    expect(screen.getByRole('button', { name: 'Open source: Checkout LLD' })).toBeInTheDocument()
    expect(screen.queryByText('Profile story')).not.toBeInTheDocument()

    await user.click(filters.getByRole('button', { name: 'Clear filters' }))
    await user.selectOptions(filters.getByLabelText('Filter by status'), 'Reviewed')

    expect(screen.queryByText('Checkout LLD')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Open source: Profile story' })).toBeInTheDocument()
  })

  it('shows long content as a preview and expands it read-only', async () => {
    const user = userEvent.setup()
    const longContent = [
      'This LLD describes the checkout authorization workflow.',
      'It includes timeout handling, retry limits, idempotency keys, webhook reconciliation, and receipt delivery.',
      'The tester must review edge cases before creating detailed test coverage.',
    ].join(' ')
    const previewOnlyText = 'This sentence is only visible after expanding the source card.'

    renderQaSourcesPage({
      initialSources: [
        createQaSource({
          id: 'source-1',
          title: 'Long Checkout LLD',
          content: `${longContent} ${previewOnlyText}`,
        }),
      ],
    })

    const card = getSourceCard('Long Checkout LLD')

    expect(card.getByText(/This LLD describes/)).toHaveTextContent('...')
    expect(card.queryByText(previewOnlyText)).not.toBeInTheDocument()

    await user.click(card.getByRole('button', { name: 'View full source' }))

    expect(card.getByText(/This LLD describes/)).toHaveTextContent(previewOnlyText)
    expect(
      card.getByRole('button', { name: 'Collapse source' }),
    ).toHaveAttribute('aria-expanded', 'true')

    await user.click(card.getByRole('button', { name: 'Collapse source' }))

    expect(card.queryByText(previewOnlyText)).not.toBeInTheDocument()
    expect(
      card.getByRole('button', { name: 'View full source' }),
    ).toHaveAttribute('aria-expanded', 'false')
  })

  it('uses one native radio group, supports keyboard selection with zero requests, and renders one shared panel', async () => {
    const user = userEvent.setup()
    const qaSource = createQaSource({
      id: 'source-mixed',
      title: 'Mixed Language LLD',
      content: [
        '# Before',
        'Previous section content.',
        '',
        '## Locked accounts — חשבונות נעולים with an intentionally long bilingual review heading',
        'Locked accounts require support review.',
        '',
        '# After',
        'Following section content.',
      ].join('\n'),
    })
    const generateSectionCoveragePlan = vi.fn()

    renderQaSourcesPage({
      initialSources: [qaSource],
      sourceSectionIndexes: [createQaSourceSectionIndex(qaSource)],
      sectionCoveragePlanProvider: {
        isAvailable: true,
        generateSectionCoveragePlan,
      },
    })

    const card = getSourceCard('Mixed Language LLD')
    await user.click(card.getByText('Source Structure'))

    const group = card.getByRole('radiogroup', {
      name: 'Select one section from Mixed Language LLD for analysis',
    })
    const radios = within(group).getAllByRole('radio')

    expect(radios).toHaveLength(3)
    expect(within(group).getAllByText('Not analyzed')).toHaveLength(3)
    expect(
      within(group).queryByRole('button', { name: /Analyze section/i }),
    ).not.toBeInTheDocument()
    expect(
      card.queryByRole('region', { name: /Section coverage analysis/i }),
    ).not.toBeInTheDocument()

    radios[0].focus()
    await user.keyboard('{ArrowDown}')

    expect(radios[1]).toBeChecked()
    expect(radios[1]).toHaveAccessibleName(
      /Locked accounts — חשבונות נעולים with an intentionally long bilingual review heading/,
    )
    expect(generateSectionCoveragePlan).not.toHaveBeenCalled()
    expect(
      card.getAllByRole('region', { name: /Section coverage analysis/i }),
    ).toHaveLength(1)
    expect(
      card.getAllByRole('button', { name: 'Analyze section' }),
    ).toHaveLength(1)
  })

  it('switches explicitly between unchanged radio analysis and transient merge selection', async () => {
    const user = userEvent.setup()
    const qaSource = createQaSource({
      id: 'source-merge-selection',
      title: 'Merge Selection LLD',
      createdAt: '2026-07-18T08:00:00.000Z',
      updatedAt: '2026-07-18T08:00:00.000Z',
      content: [
        '# Authentication',
        'Authentication behavior.',
        '',
        '# Authorization',
        'Authorization behavior.',
        '',
        '# Audit',
        'Audit behavior.',
      ].join('\n'),
    })
    const authentication = createSavedSectionRecord(qaSource, 'Authentication')
    const authorization = createSavedSectionRecord(qaSource, 'Authorization')
    const onBuildGlobalCoveragePlan = vi.fn()

    renderQaSourcesPage({
      initialSources: [qaSource],
      sourceSectionIndexes: [authentication.sectionIndex],
      sectionCoveragePlanRecords: [authentication.record, authorization.record],
      onBuildGlobalCoveragePlan,
    })

    const card = getSourceCard('Merge Selection LLD')
    await user.click(card.getByText('Source Structure'))

    expect(card.getAllByRole('radio')).toHaveLength(3)
    expect(card.queryByRole('checkbox')).not.toBeInTheDocument()
    await user.click(card.getAllByRole('radio')[1])
    expect(card.getAllByRole('radio')[1]).toBeChecked()
    await user.click(
      card.getByRole('button', { name: 'Select analyses to merge' }),
    )

    expect(card.queryByRole('radio')).not.toBeInTheDocument()
    const checkboxes = card.getAllByRole('checkbox')
    expect(checkboxes).toHaveLength(3)
    expect(checkboxes[0]).not.toBeChecked()
    expect(checkboxes[1]).not.toBeChecked()
    expect(checkboxes[2]).toBeDisabled()

    await user.click(checkboxes[0])
    await user.click(checkboxes[1])
    expect(onBuildGlobalCoveragePlan).not.toHaveBeenCalled()
    await user.click(
      card.getByRole('button', { name: 'Build global coverage plan' }),
    )

    expect(onBuildGlobalCoveragePlan).toHaveBeenCalledTimes(1)
    expect(onBuildGlobalCoveragePlan).toHaveBeenCalledWith(
      qaSource.id,
      expect.arrayContaining([authentication.record, authorization.record]),
    )

    await user.click(
      card.getByRole('button', { name: 'Exit merge selection' }),
    )
    expect(card.getAllByRole('radio')).toHaveLength(3)
    expect(card.getAllByRole('radio').every((item) => !item.hasAttribute('checked'))).toBe(
      true,
    )
    expect(card.queryByRole('checkbox')).not.toBeInTheDocument()

    await user.click(
      card.getByRole('button', { name: 'Select analyses to merge' }),
    )
    expect(card.getAllByRole('checkbox').every((item) => !item.hasAttribute('checked'))).toBe(
      true,
    )
  })
  it('keeps excluded sections visible but unavailable and non-selectable', async () => {
    const user = userEvent.setup()
    const qaSource = createQaSource({
      id: 'source-excluded',
      title: 'Included and Appendix',
      content: [
        '# Included',
        'Included behavior.',
        '',
        '# Appendix',
        'Reference material only.',
      ].join('\n'),
    })
    const canonicalIndex = createQaSourceSectionIndex(qaSource)
    const sectionIndex: QaSourceSectionIndex = {
      ...canonicalIndex,
      sections: canonicalIndex.sections.map((section) =>
        section.title === 'Appendix'
          ? { ...section, includedInCoverage: false }
          : section,
      ),
    }

    renderQaSourcesPage({
      initialSources: [qaSource],
      sourceSectionIndexes: [sectionIndex],
    })

    const card = getSourceCard('Included and Appendix')
    await user.click(card.getByText('Source Structure'))

    expect(card.getAllByRole('radio')).toHaveLength(1)
    expect(card.getByText('2. Appendix')).toBeVisible()
    expect(card.getByText('Unavailable for section analysis.')).toBeVisible()
    expect(
      card.queryByRole('radio', { name: /Appendix/ }),
    ).not.toBeInTheDocument()
  })

  it('derives Current, Stale, and Not analyzed badges from independent saved records', async () => {
    const user = userEvent.setup()
    const oldSource = createQaSource({
      id: 'source-statuses',
      title: 'Status LLD',
      createdAt: '2026-07-18T08:00:00.000Z',
      updatedAt: '2026-07-18T08:00:00.000Z',
      content: [
        '# Before',
        'Before behavior.',
        '',
        '# Selected',
        'Selected behavior.',
        '',
        '# After',
        'Old after behavior.',
      ].join('\n'),
    })
    const stale = createSavedSectionRecord(oldSource, 'Before')
    const currentSource = {
      ...oldSource,
      updatedAt: '2026-07-18T09:00:00.000Z',
      content: oldSource.content.replace(
        'Old after behavior.',
        'Changed after behavior.',
      ),
    }
    const current = createSavedSectionRecord(
      currentSource,
      'Selected',
      '2026-07-18T09:01:00.000Z',
    )

    renderQaSourcesPage({
      initialSources: [currentSource],
      sourceSectionIndexes: [current.sectionIndex],
      sectionCoveragePlanRecords: [stale.record, current.record],
    })

    const card = getSourceCard('Status LLD')
    await user.click(card.getByText('Source Structure'))

    const beforeRow = card.getByText('1. Before').closest('li')
    const selectedRow = card.getByText('2. Selected').closest('li')
    const afterRow = card.getByText('3. After').closest('li')

    expect(beforeRow).not.toBeNull()
    expect(selectedRow).not.toBeNull()
    expect(afterRow).not.toBeNull()
    expect(within(beforeRow!).getByText('Stale')).toBeVisible()
    expect(within(selectedRow!).getByText('Current')).toBeVisible()
    expect(within(afterRow!).getByText('Not analyzed')).toBeVisible()

    await user.click(within(selectedRow!).getByRole('radio'))
    expect(
      card.getByRole('heading', { name: 'Current section analysis' }),
    ).toBeVisible()
  })

  it('updates the selected row badge from Analyzing to Failed without duplicate requests', async () => {
    const user = userEvent.setup()
    const qaSource = createQaSource({
      id: 'source-request-state',
      title: 'Request State LLD',
      content: '# Selected\nSelected behavior.',
    })
    const deferred = createDeferred<AiSectionCoveragePlanProviderResult>()
    const generateSectionCoveragePlan = vi.fn(() => deferred.promise)

    renderQaSourcesPage({
      initialSources: [qaSource],
      sourceSectionIndexes: [createQaSourceSectionIndex(qaSource)],
      sectionCoveragePlanProvider: {
        isAvailable: true,
        generateSectionCoveragePlan,
      },
    })

    const card = getSourceCard('Request State LLD')
    await user.click(card.getByText('Source Structure'))
    const row = card.getByText('1. Selected').closest('li')

    expect(row).not.toBeNull()
    await user.click(within(row!).getByRole('radio'))
    await user.click(card.getByRole('button', { name: 'Analyze section' }))

    expect(within(row!).getByText('Analyzing')).toBeVisible()
    expect(card.getByRole('button', { name: 'Analyzing…' })).toBeDisabled()
    expect(generateSectionCoveragePlan).toHaveBeenCalledTimes(1)

    await user.click(card.getByRole('button', { name: 'Analyzing…' }))
    expect(generateSectionCoveragePlan).toHaveBeenCalledTimes(1)

    await act(async () => {
      deferred.reject(new Error('provider details must remain private'))
      await deferred.promise.catch(() => undefined)
    })

    await waitFor(() => {
      expect(within(row!).getByText('Failed')).toBeVisible()
    })
    expect(generateSectionCoveragePlan).toHaveBeenCalledTimes(1)
  })
})
