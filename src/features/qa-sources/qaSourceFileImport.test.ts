import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  deriveQaSourceTitleFromFileName,
  extractQaSourceTextFromFile,
  QA_SOURCE_DOCX_EMPTY_MESSAGE,
  QA_SOURCE_DOCX_FILE_TOO_LARGE_MESSAGE,
  QA_SOURCE_DOCX_IMPORT_WARNING,
  QA_SOURCE_DOCX_STRUCTURE_TOO_LARGE_MESSAGE,
  QA_SOURCE_DOCX_UNREADABLE_MESSAGE,
  QA_SOURCE_EXTRACTED_TEXT_TOO_LARGE_MESSAGE,
  QA_SOURCE_FILE_EMPTY_MESSAGE,
  QA_SOURCE_FILE_IMPORT_CANCELED_MESSAGE,
  QA_SOURCE_FILE_TOO_LARGE_MESSAGE,
  QA_SOURCE_FILE_UNREADABLE_MESSAGE,
  QA_SOURCE_FILE_UNSUPPORTED_MESSAGE,
  QA_SOURCE_LEGACY_DOC_UNSUPPORTED_MESSAGE,
  QA_SOURCE_PDF_EMPTY_MESSAGE,
  QA_SOURCE_PDF_FILE_TOO_LARGE_MESSAGE,
  QA_SOURCE_PDF_IMPORT_WARNING,
  QA_SOURCE_PDF_INVALID_MESSAGE,
  QA_SOURCE_PDF_TOO_MANY_PAGES_MESSAGE,
  QA_SOURCE_PDF_UNREADABLE_MESSAGE,
  validateDocxZipSafety,
  validateQaSourceFile,
  type QaSourceImportFile,
  QA_SOURCE_TEXT_FILE_MAX_BYTES,
  QA_SOURCE_DOCX_FILE_MAX_BYTES,
  QA_SOURCE_PDF_FILE_MAX_BYTES,
  QA_SOURCE_EXTRACTED_TEXT_MAX_BYTES,
  QA_SOURCE_DOCX_MAX_DOCUMENT_XML_BYTES,
  QA_SOURCE_DOCX_MAX_UNCOMPRESSED_BYTES,
  QA_SOURCE_PDF_MAX_PAGES,
  QA_SOURCE_DOCX_MAX_ZIP_ENTRIES,
} from './qaSourceFileImport'

const mockGetDocument = vi.hoisted(() => vi.fn())

vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: {
    workerSrc: '',
  },
  getDocument: mockGetDocument,
}))

vi.mock('pdfjs-dist/build/pdf.worker.mjs?url', () => ({
  default: '/assets/pdf.worker.mjs',
}))

function createFile(name: string, content: string, type = 'text/plain') {
  return new File([content], name, { type })
}

function createArrayBuffer(content: string) {
  const bytes = new TextEncoder().encode(content)

  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer
}

function createDocxFile(size = 1024): QaSourceImportFile {
  return {
    name: 'customer-notification-lld.docx',
    size,
    text: () => Promise.resolve(''),
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
  }
}

function createPdfFile(content = '%PDF-1.7\n', size = content.length): QaSourceImportFile {
  return {
    name: 'customer-notification-lld.pdf',
    size,
    text: () => Promise.resolve(''),
    arrayBuffer: () => Promise.resolve(createArrayBuffer(content)),
  }
}

type MockPdfTextItem = {
  str: string
  hasEOL?: boolean
}

function mockPdfDocument({
  numPages,
  getItems = (pageNumber) => [{ str: `Readable page ${pageNumber}` }],
}: {
  numPages: number
  getItems?: (pageNumber: number) => MockPdfTextItem[]
}) {
  const loadingTaskDestroy = vi.fn(() => Promise.resolve())
  const pageCleanups = Array.from({ length: numPages }, () => vi.fn())
  const getPage = vi.fn((pageNumber: number) =>
    Promise.resolve({
      getTextContent: () =>
        Promise.resolve({
          items: getItems(pageNumber),
        }),
      cleanup: pageCleanups[pageNumber - 1],
    }),
  )

  mockGetDocument.mockReturnValueOnce({
    promise: Promise.resolve({
      numPages,
      getPage,
    }),
    destroy: loadingTaskDestroy,
  })

  return {
    getPage,
    loadingTaskDestroy,
    pageCleanups,
  }
}

afterEach(() => {
  mockGetDocument.mockReset()
})

function createDocxZipMetadata(
  entries: Array<{ name: string; uncompressedSize: number }>,
) {
  const encoder = new TextEncoder()
  const encodedEntries = entries.map((entry) => ({
    ...entry,
    encodedName: encoder.encode(entry.name),
  }))
  const centralDirectorySize = encodedEntries.reduce(
    (totalSize, entry) => totalSize + 46 + entry.encodedName.length,
    0,
  )
  const endOfCentralDirectorySize = 22
  const buffer = new ArrayBuffer(
    centralDirectorySize + endOfCentralDirectorySize,
  )
  const bytes = new Uint8Array(buffer)
  const view = new DataView(buffer)
  let offset = 0

  for (const entry of encodedEntries) {
    view.setUint32(offset, 0x02014b50, true)
    view.setUint32(offset + 20, Math.min(entry.uncompressedSize, 1024), true)
    view.setUint32(offset + 24, entry.uncompressedSize, true)
    view.setUint16(offset + 28, entry.encodedName.length, true)
    bytes.set(entry.encodedName, offset + 46)
    offset += 46 + entry.encodedName.length
  }

  view.setUint32(offset, 0x06054b50, true)
  view.setUint16(offset + 8, entries.length, true)
  view.setUint16(offset + 10, entries.length, true)
  view.setUint32(offset + 12, centralDirectorySize, true)
  view.setUint32(offset + 16, 0, true)

  return buffer
}

describe('qaSourceFileImport', () => {
  it('accepts txt, md, docx, and pdf files without relying only on MIME type', () => {
    expect(validateQaSourceFile(createFile('source.txt', 'Plain text'))).toBeNull()
    expect(
      validateQaSourceFile(createFile('source.md', '# Markdown', 'text/markdown')),
    ).toBeNull()
    expect(
      validateQaSourceFile(
        createFile(
          'source.docx',
          'DOCX bytes',
          'application/octet-stream',
        ),
      ),
    ).toBeNull()
    expect(
      validateQaSourceFile(
        createFile('source.txt', 'Text with odd MIME', 'application/pdf'),
      ),
    ).toBeNull()
    expect(
      validateQaSourceFile(
        createFile('source.PDF', '%PDF-1.7', 'application/octet-stream'),
      ),
    ).toBeNull()
    expect(
      validateQaSourceFile(createFile('source', 'Text without extension')),
    ).toBe(QA_SOURCE_FILE_UNSUPPORTED_MESSAGE)
  })

  it('rejects unsupported source file formats', () => {
    expect(validateQaSourceFile(createFile('source.doc', 'DOC'))).toBe(
      QA_SOURCE_LEGACY_DOC_UNSUPPORTED_MESSAGE,
    )
    expect(validateQaSourceFile(createFile('source.png', 'PNG'))).toBe(
      QA_SOURCE_FILE_UNSUPPORTED_MESSAGE,
    )
    expect(validateQaSourceFile(createFile('source.xlsx', 'XLSX'))).toBe(
      QA_SOURCE_FILE_UNSUPPORTED_MESSAGE,
    )
  })

  it('rejects oversized text, docx, and pdf files', () => {
    const oversizedFile = { name: 'large.md', size: QA_SOURCE_TEXT_FILE_MAX_BYTES + 1 }

    expect(validateQaSourceFile(oversizedFile)).toBe(
      QA_SOURCE_FILE_TOO_LARGE_MESSAGE,
    )
    expect(validateQaSourceFile(createDocxFile(QA_SOURCE_DOCX_FILE_MAX_BYTES + 1))).toBe(
      QA_SOURCE_DOCX_FILE_TOO_LARGE_MESSAGE,
    )
    expect(validateQaSourceFile(createPdfFile('%PDF-1.7\n', QA_SOURCE_PDF_FILE_MAX_BYTES + 1)))
      .toBe(QA_SOURCE_PDF_FILE_TOO_LARGE_MESSAGE)
  })

  it('rejects empty content after reading the file', async () => {
    await expect(extractQaSourceTextFromFile(createFile('empty.txt', '   '))).resolves
      .toEqual({
        ok: false,
        error: QA_SOURCE_FILE_EMPTY_MESSAGE,
      })
  })

  it('returns a clear error if the text file cannot be read', async () => {
    const unreadableFile: QaSourceImportFile = {
      name: 'unreadable.md',
      size: 10,
      text: () => Promise.reject(new Error('read failed')),
    }

    await expect(extractQaSourceTextFromFile(unreadableFile)).resolves.toEqual({
      ok: false,
      error: QA_SOURCE_FILE_UNREADABLE_MESSAGE,
    })
  })

  it('extracts readable text from docx files with a mockable extractor', async () => {
    await expect(
      extractQaSourceTextFromFile(createDocxFile(), {
        extractDocxText: () =>
          Promise.resolve(
            'Customer Notification LLD\n\nשורת דרישה בעברית\n\nBullet: Send customer notification after approval.\n',
          ),
      }),
    ).resolves.toEqual({
      ok: true,
      fileName: 'customer-notification-lld.docx',
      title: 'customer notification lld',
      content:
        'Customer Notification LLD\n\nשורת דרישה בעברית\n\nBullet: Send customer notification after approval.\n',
      warning: QA_SOURCE_DOCX_IMPORT_WARNING,
      documentImport: { schemaVersion: 1, fileName: 'customer-notification-lld.docx', format: 'docx', contentFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/), pages: [], blocks: [] },
    })
  })

  it('returns clear docx extraction errors for empty or failed extraction', async () => {
    await expect(
      extractQaSourceTextFromFile(createDocxFile(), {
        extractDocxText: () => Promise.resolve('   '),
      }),
    ).resolves.toEqual({
      ok: false,
      error: QA_SOURCE_DOCX_EMPTY_MESSAGE,
    })

    await expect(
      extractQaSourceTextFromFile(createDocxFile(), {
        extractDocxText: () => Promise.reject(new Error('corrupt docx')),
      }),
    ).resolves.toEqual({
      ok: false,
      error: QA_SOURCE_DOCX_UNREADABLE_MESSAGE,
    })
  })

  it('extracts readable text from pdf files with a mockable extractor', async () => {
    await expect(
      extractQaSourceTextFromFile(createPdfFile(), {
        extractPdfText: () =>
          Promise.resolve({
            text: 'QA Source PDF Fixture\n\nPayment authorization requirement.',
            pageCount: 1,
            pagesWithText: 1,
          }),
      }),
    ).resolves.toEqual({
      ok: true,
      fileName: 'customer-notification-lld.pdf',
      title: 'customer notification lld',
      content: 'QA Source PDF Fixture\n\nPayment authorization requirement.',
      warning: QA_SOURCE_PDF_IMPORT_WARNING,
      documentImport: { schemaVersion: 1, fileName: 'customer-notification-lld.pdf', format: 'pdf', contentFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/), originalFileFingerprint: '0716f9264c9fe19f5d7455276107f3ddcc1d3497f63d60689a73558ae8a1bf5e', pages: [], blocks: [] },
      metadata: {
        sourceType: 'pdf',
        pageCount: 1,
        pagesWithText: 1,
        characterCount: 57,
      },
    })
  })

  it('accepts a selectable-text pdf with 150 pages', async () => {
    const pdf = mockPdfDocument({ numPages: 150 })

    const result = await extractQaSourceTextFromFile(createPdfFile())

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.metadata).toMatchObject({
        sourceType: 'pdf',
        pageCount: 150,
        pagesWithText: 150,
      })
      expect(result.content).toContain('--- Page 1 ---\nReadable page 1')
      expect(result.content).toContain('--- Page 150 ---\nReadable page 150')
    }
    expect(pdf.getPage).toHaveBeenCalledTimes(150)
    expect(pdf.loadingTaskDestroy).toHaveBeenCalledTimes(1)
  })

  it('keeps failed and empty pages in the document manifest while continuing safe extraction', async () => {
    const document = mockPdfDocument({ numPages: 3, getItems: (page) => page === 2 ? [] : [{ str: `Readable source requirements on page ${page}.` }] })
    document.getPage.mockRejectedValueOnce(new Error('PRIVATE PDF FAILURE DETAILS'))
    const result = await extractQaSourceTextFromFile(createPdfFile())
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.documentImport?.pages.map((page) => page.status)).toEqual(['failed', 'needs_visual_review', 'pending'])
    expect(result.content.includes('PRIVATE PDF FAILURE DETAILS')).toBe(false)
    expect(result.content.includes('page 3.')).toBe(true)
    expect(result.documentImport?.pages.at(-1)?.endOffset).toBe(result.content.length)
  })

  it('rejects a pdf above the bounded import limit before reading any page', async () => {
    const pdf = mockPdfDocument({ numPages: QA_SOURCE_PDF_MAX_PAGES + 1 })

    await expect(extractQaSourceTextFromFile(createPdfFile())).resolves.toEqual({
      ok: false,
      error: QA_SOURCE_PDF_TOO_MANY_PAGES_MESSAGE,
    })
    expect(pdf.getPage).not.toHaveBeenCalled()
    expect(pdf.loadingTaskDestroy).toHaveBeenCalledTimes(1)
  })

  it('reports bounded pdf extraction progress including pages without text', async () => {
    mockPdfDocument({
      numPages: 3,
      getItems: (pageNumber) =>
        pageNumber === 2 ? [] : [{ str: `Page ${pageNumber}` }],
    })
    const onPdfProgress = vi.fn()

    await expect(
      extractQaSourceTextFromFile(createPdfFile(), { onPdfProgress }),
    ).resolves.toMatchObject({ ok: true })

    expect(onPdfProgress.mock.calls.map(([progress]) => progress)).toEqual([
      { processedPages: 0, totalPages: 3, pagesWithText: 0 },
      { processedPages: 1, totalPages: 3, pagesWithText: 1 },
      { processedPages: 2, totalPages: 3, pagesWithText: 1 },
      { processedPages: 3, totalPages: 3, pagesWithText: 2 },
    ])
  })

  it('cancels pdf extraction safely and ignores unread pages', async () => {
    const controller = new AbortController()
    const pdf = mockPdfDocument({ numPages: 3 })

    const result = await extractQaSourceTextFromFile(createPdfFile(), {
      signal: controller.signal,
      onPdfProgress: ({ processedPages }) => {
        if (processedPages === 1) {
          controller.abort()
        }
      },
    })

    expect(result).toEqual({
      ok: false,
      error: QA_SOURCE_FILE_IMPORT_CANCELED_MESSAGE,
    })
    expect(pdf.getPage).toHaveBeenCalledTimes(1)
    expect(pdf.pageCleanups[0]).toHaveBeenCalledTimes(1)
    expect(pdf.loadingTaskDestroy).toHaveBeenCalledTimes(1)
  })

  it('returns promptly when cancellation interrupts pending pdf page work', async () => {
    const controller = new AbortController()
    const getTextContent = vi.fn(
      () => new Promise<{ items: MockPdfTextItem[] }>(() => undefined),
    )
    const loadingTaskDestroy = vi.fn(() => Promise.resolve())

    mockGetDocument.mockReturnValueOnce({
      promise: Promise.resolve({
        numPages: 2,
        getPage: () =>
          Promise.resolve({
            getTextContent,
            cleanup: vi.fn(),
          }),
      }),
      destroy: loadingTaskDestroy,
    })

    const result = extractQaSourceTextFromFile(createPdfFile(), {
      signal: controller.signal,
    })

    await vi.waitFor(() => expect(getTextContent).toHaveBeenCalledTimes(1))
    controller.abort()

    await expect(result).resolves.toEqual({
      ok: false,
      error: QA_SOURCE_FILE_IMPORT_CANCELED_MESSAGE,
    })
    expect(loadingTaskDestroy).toHaveBeenCalledTimes(1)
  })

  it('cleans up each processed pdf page when cleanup is available', async () => {
    const pdf = mockPdfDocument({ numPages: 2 })

    await expect(extractQaSourceTextFromFile(createPdfFile())).resolves.toMatchObject({
      ok: true,
    })

    expect(pdf.pageCleanups[0]).toHaveBeenCalledTimes(1)
    expect(pdf.pageCleanups[1]).toHaveBeenCalledTimes(1)
  })

  it('preserves pdf text-item line endings', async () => {
    mockPdfDocument({
      numPages: 1,
      getItems: () => [
        { str: 'AUTHENTICATION', hasEOL: true },
        { str: 'Valid credentials', hasEOL: false },
        { str: 'grant access.', hasEOL: true },
        { str: 'Locked accounts require support.' },
      ],
    })

    await expect(extractQaSourceTextFromFile(createPdfFile())).resolves.toMatchObject({
      ok: true,
      content:
        'AUTHENTICATION\nValid credentials grant access.\nLocked accounts require support.',
    })
  })

  it('stops before reading another pdf page when the byte limit is exceeded', async () => {
    const pdf = mockPdfDocument({
      numPages: 2,
      getItems: (pageNumber) => [
        {
          str:
            pageNumber === 1
              ? 'x'.repeat(QA_SOURCE_EXTRACTED_TEXT_MAX_BYTES + 1)
              : 'This page must not be read.',
        },
      ],
    })
    const onPdfProgress = vi.fn()

    await expect(
      extractQaSourceTextFromFile(createPdfFile(), { onPdfProgress }),
    ).resolves.toEqual({
      ok: false,
      error: QA_SOURCE_EXTRACTED_TEXT_TOO_LARGE_MESSAGE,
    })

    expect(pdf.getPage).toHaveBeenCalledTimes(1)
    expect(pdf.pageCleanups[0]).toHaveBeenCalledTimes(1)
    expect(pdf.loadingTaskDestroy).toHaveBeenCalledTimes(1)
    expect(onPdfProgress).toHaveBeenCalledTimes(1)
    expect(onPdfProgress).toHaveBeenLastCalledWith({
      processedPages: 0,
      totalPages: 2,
      pagesWithText: 0,
    })
  })

  it('destroys the pdf loading task when document loading rejects', async () => {
    const destroy = vi.fn(() => Promise.resolve())

    mockGetDocument.mockReturnValueOnce({
      get promise() { return Promise.reject(new Error('protected pdf')) },
      destroy,
    })

    await expect(extractQaSourceTextFromFile(createPdfFile())).resolves.toEqual({
      ok: false,
      error: QA_SOURCE_PDF_UNREADABLE_MESSAGE,
    })
    expect(destroy).toHaveBeenCalledTimes(1)
  })

  it('rejects pdf files that do not start with a PDF header', async () => {
    await expect(
      extractQaSourceTextFromFile(createPdfFile('not really a pdf'), {
        extractPdfText: () =>
          Promise.resolve({
            text: 'Should not run',
            pageCount: 1,
            pagesWithText: 1,
          }),
      }),
    ).resolves.toEqual({
      ok: false,
      error: QA_SOURCE_PDF_INVALID_MESSAGE,
    })
  })

  it('returns clear pdf extraction errors for empty, failed, or oversized documents', async () => {
    await expect(
      extractQaSourceTextFromFile(createPdfFile(), {
        extractPdfText: () =>
          Promise.resolve({
            text: '   ',
            pageCount: 1,
            pagesWithText: 0,
          }),
      }),
    ).resolves.toEqual({
      ok: false,
      error: QA_SOURCE_PDF_EMPTY_MESSAGE,
    })

    await expect(
      extractQaSourceTextFromFile(createPdfFile(), {
        extractPdfText: () =>
          Promise.resolve({
            text: 'Readable text',
            pageCount: QA_SOURCE_PDF_MAX_PAGES + 1,
            pagesWithText: QA_SOURCE_PDF_MAX_PAGES + 1,
          }),
      }),
    ).resolves.toEqual({
      ok: false,
      error: QA_SOURCE_PDF_TOO_MANY_PAGES_MESSAGE,
    })

    await expect(
      extractQaSourceTextFromFile(createPdfFile(), {
        extractPdfText: () => Promise.reject(new Error('protected pdf')),
      }),
    ).resolves.toEqual({
      ok: false,
      error: QA_SOURCE_PDF_UNREADABLE_MESSAGE,
    })
  })

  it('rejects extracted source text above the bounded import limit', async () => {
    await expect(
      extractQaSourceTextFromFile(createDocxFile(), {
        extractDocxText: () => Promise.resolve('x'.repeat(QA_SOURCE_EXTRACTED_TEXT_MAX_BYTES + 1)),
      }),
    ).resolves.toEqual({
      ok: false,
      error: QA_SOURCE_EXTRACTED_TEXT_TOO_LARGE_MESSAGE,
    })

    await expect(
      extractQaSourceTextFromFile(createPdfFile(), {
        extractPdfText: () =>
          Promise.resolve({
            text: 'x'.repeat(QA_SOURCE_EXTRACTED_TEXT_MAX_BYTES + 1),
            pageCount: 1,
            pagesWithText: 1,
          }),
      }),
    ).resolves.toEqual({
      ok: false,
      error: QA_SOURCE_EXTRACTED_TEXT_TOO_LARGE_MESSAGE,
    })
  })

  it('preflights docx zip metadata before extraction', () => {
    expect(
      validateDocxZipSafety(
        createDocxZipMetadata([
          { name: 'word/document.xml', uncompressedSize: 1024 },
        ]),
      ),
    ).toBeNull()

    expect(
      validateDocxZipSafety(
        createDocxZipMetadata([
          {
            name: 'word/document.xml',
            uncompressedSize: QA_SOURCE_DOCX_MAX_DOCUMENT_XML_BYTES + 1,
          },
        ]),
      ),
    ).toBe(QA_SOURCE_DOCX_STRUCTURE_TOO_LARGE_MESSAGE)

    expect(
      validateDocxZipSafety(
        createDocxZipMetadata([
          { name: 'word/document.xml', uncompressedSize: 1024 },
          { name: 'word/large.xml', uncompressedSize: QA_SOURCE_DOCX_MAX_UNCOMPRESSED_BYTES },
        ]),
      ),
    ).toBe(QA_SOURCE_DOCX_STRUCTURE_TOO_LARGE_MESSAGE)

    expect(
      validateDocxZipSafety(
        createDocxZipMetadata(
          Array.from({ length: QA_SOURCE_DOCX_MAX_ZIP_ENTRIES + 1 }, (_, index) => ({
            name:
              index === 0
                ? 'word/document.xml'
                : `word/part-${index}.xml`,
            uncompressedSize: 1,
          })),
        ),
      ),
    ).toBe(QA_SOURCE_DOCX_STRUCTURE_TOO_LARGE_MESSAGE)

    expect(
      validateDocxZipSafety(
        createDocxZipMetadata([
          { name: 'word/styles.xml', uncompressedSize: 1024 },
        ]),
      ),
    ).toBe(QA_SOURCE_DOCX_UNREADABLE_MESSAGE)
  })

  it('derives a source title from the file name', () => {
    expect(deriveQaSourceTitleFromFileName('customer-notification-lld.md')).toBe(
      'customer notification lld',
    )
    expect(deriveQaSourceTitleFromFileName('checkout_notes.TXT')).toBe(
      'checkout notes',
    )
    expect(deriveQaSourceTitleFromFileName('source-material.md ')).toBe(
      'source material',
    )
    expect(deriveQaSourceTitleFromFileName('customer-notification-lld.docx')).toBe(
      'customer notification lld',
    )
    expect(deriveQaSourceTitleFromFileName('customer-notification-lld.PDF')).toBe(
      'customer notification lld',
    )
  })

  it('preserves imported Markdown and plain text content', async () => {
    const markdown = [
      '# Checkout Requirement',
      '',
      '- Approve valid cards',
      '- Decline expired cards',
    ].join('\n')

    await expect(extractQaSourceTextFromFile(createFile('checkout.md', markdown)))
      .resolves.toEqual({
        ok: true,
        fileName: 'checkout.md',
        title: 'checkout',
        content: markdown,
        warning: null,
        documentImport: { schemaVersion: 1, fileName: 'checkout.md', format: 'markdown', contentFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/), pages: [], blocks: [] },
      })
  })
})
