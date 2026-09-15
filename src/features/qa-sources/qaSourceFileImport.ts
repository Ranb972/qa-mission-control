import { fingerprint } from '../document-intelligence/documentFingerprint'
import type { DocumentImport } from '../document-intelligence/documentImport'
import type { DocumentPage } from '../document-intelligence/documentTypes'
import type { PDFPageProxy } from 'pdfjs-dist'
import type { DocumentBlock } from '../document-intelligence/documentTypes'
import { extractDocxStructure } from '../document-intelligence/importDocxStructure'

// Local ingestion bounds, not model context limits. Every AI analysis unit remains independently bounded.
export const QA_SOURCE_TEXT_FILE_MAX_BYTES = 16 * 1024 * 1024
export const QA_SOURCE_DOCX_FILE_MAX_BYTES = 16 * 1024 * 1024
export const QA_SOURCE_PDF_FILE_MAX_BYTES = 32 * 1024 * 1024
export const QA_SOURCE_EXTRACTED_TEXT_MAX_BYTES = 16 * 1024 * 1024
export const QA_SOURCE_DOCX_MAX_ZIP_ENTRIES = 2000
export const QA_SOURCE_DOCX_MAX_UNCOMPRESSED_BYTES = 64 * 1024 * 1024
export const QA_SOURCE_DOCX_MAX_DOCUMENT_XML_BYTES = 32 * 1024 * 1024
export const QA_SOURCE_PDF_MAX_PAGES = 1200
const PDF_HEADER_SEARCH_BYTES = 1024
const ZIP_END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06054b50
const ZIP_CENTRAL_DIRECTORY_HEADER_SIGNATURE = 0x02014b50
const ZIP64_SENTINEL = 0xffffffff

const KNOWN_EXTENSIONS = ['.docx', '.txt', '.md', '.pdf', '.doc'] as const

type SupportedExtension = '.txt' | '.md' | '.docx' | '.pdf'
type KnownExtension = (typeof KNOWN_EXTENSIONS)[number]
type TextExtension = '.txt' | '.md'

type MammothExtractRawText = (input: {
  arrayBuffer: ArrayBuffer
}) => Promise<{ value: string }>

type MammothModule = {
  default?: {
    extractRawText?: MammothExtractRawText
    convertToHtml?: typeof import('mammoth')['convertToHtml']
    images?: typeof import('mammoth')['images']
  }
  extractRawText?: MammothExtractRawText
  convertToHtml?: typeof import('mammoth')['convertToHtml']
  images?: typeof import('mammoth')['images']
}

type PdfWorkerUrlModule = {
  default: string
}

type PdfTextItem = {
  str: string
  hasEOL?: boolean
}

export type QaSourcePdfExtractionResult = {
  text: string
  pageCount: number
  pagesWithText: number
  pages?: DocumentPage[]
}

export type QaSourcePdfImportProgress = {
  processedPages: number
  totalPages: number
  pagesWithText: number
}

export type QaSourcePdfExtractionOptions = {
  signal?: AbortSignal
  onProgress?: (progress: QaSourcePdfImportProgress) => void
}

type PdfImportMetadata = {
  sourceType: 'pdf'
  pageCount: number
  pagesWithText: number
  characterCount: number
}

export type QaSourceImportFile = {
  name: string
  size: number
  text: () => Promise<string>
  arrayBuffer?: () => Promise<ArrayBuffer>
}

export type QaSourceDocxExtractor = (
  file: QaSourceImportFile,
) => Promise<string>

export type QaSourcePdfExtractor = (
  arrayBuffer: ArrayBuffer,
  options?: QaSourcePdfExtractionOptions,
) => Promise<QaSourcePdfExtractionResult>

export type QaSourceFileImportOptions = {
  extractDocxText?: QaSourceDocxExtractor
  extractPdfText?: QaSourcePdfExtractor
  signal?: AbortSignal
  onPdfProgress?: (progress: QaSourcePdfImportProgress) => void
}

export type QaSourceFileImportResult =
  | {
      ok: true
      fileName: string
      title: string
      content: string
      warning: string | null
      metadata?: PdfImportMetadata
      documentImport?: DocumentImport
    }
  | {
      ok: false
      error: string
    }

export const QA_SOURCE_FILE_TOO_LARGE_MESSAGE =
  'TXT and Markdown source files must be 16 MB or smaller.'
export const QA_SOURCE_DOCX_FILE_TOO_LARGE_MESSAGE =
  'DOCX source files must be 16 MB or smaller.'
export const QA_SOURCE_PDF_FILE_TOO_LARGE_MESSAGE =
  'PDF source files must be 32 MB or smaller.'
export const QA_SOURCE_EXTRACTED_TEXT_TOO_LARGE_MESSAGE =
  'Extracted source text must be 16 MB or smaller.'
export const QA_SOURCE_DOCX_STRUCTURE_TOO_LARGE_MESSAGE =
  'DOCX contents are too large to import safely.'
export const QA_SOURCE_PDF_TOO_MANY_PAGES_MESSAGE =
  'PDF files must be 1,200 pages or fewer.'
export const QA_SOURCE_FILE_IMPORT_CANCELED_MESSAGE =
  'File import was canceled. Existing source content was kept.'
export const QA_SOURCE_FILE_UNSUPPORTED_MESSAGE =
  'Only .txt, .md, .docx, and .pdf files can be imported in this version.'
export const QA_SOURCE_LEGACY_DOC_UNSUPPORTED_MESSAGE =
  'Legacy .doc files are not supported. Save as .docx, .txt, or .md and try again.'
export const QA_SOURCE_FILE_EMPTY_MESSAGE =
  'The selected file is empty. Choose a file with readable text.'
export const QA_SOURCE_FILE_UNREADABLE_MESSAGE =
  'The selected file could not be read. Try a different .txt or .md file.'
export const QA_SOURCE_DOCX_EMPTY_MESSAGE =
  'No readable text was found in this DOCX. Image-only, OCR, or protected content is not supported; paste readable text manually or export as text and try again.'
export const QA_SOURCE_DOCX_UNREADABLE_MESSAGE =
  'Could not extract readable text from this DOCX. It may be corrupted, protected, or unsupported.'
export const QA_SOURCE_DOCX_IMPORT_WARNING =
  'Review before saving; Word .docx formatting, tables, images, comments, headers, and diagrams may not be fully preserved.'
export const QA_SOURCE_PDF_INVALID_MESSAGE =
  'The selected file does not look like a valid PDF.'
export const QA_SOURCE_PDF_EMPTY_MESSAGE =
  'No readable text was found in this PDF. Import a valid PDF with page accounting, then use page review for OCR or manual transcription.'
export const QA_SOURCE_PDF_UNREADABLE_MESSAGE =
  'Could not extract readable text from this PDF. It may be corrupted, protected, or unsupported.'
export const QA_SOURCE_PDF_IMPORT_WARNING =
  'Review before saving; PDF formatting, tables, columns, headers, footers, images, diagrams, and reading order may not be fully preserved.'
export const QA_SOURCE_PDF_PARTIAL_TEXT_WARNING =
  'Some pages had no selectable text. These pages remain explicitly marked for visual review; text analysis cannot account for their meaning.'

function getFileExtension(fileName: string): KnownExtension | null {
  const normalizedName = fileName.trim().toLowerCase()
  const extension = KNOWN_EXTENSIONS.find((knownExtension) =>
    normalizedName.endsWith(knownExtension),
  )

  return extension ?? null
}

function isSupportedExtension(
  extension: KnownExtension | null,
): extension is SupportedExtension {
  return (
    extension === '.txt' ||
    extension === '.md' ||
    extension === '.docx' ||
    extension === '.pdf'
  )
}

function isTextExtension(
  extension: SupportedExtension,
): extension is TextExtension {
  return extension === '.txt' || extension === '.md'
}

function getUtf8ByteLength(value: string) {
  return new TextEncoder().encode(value).length
}

class QaSourceImportError extends Error {
  readonly userMessage: string

  constructor(userMessage: string) {
    super(userMessage)
    this.userMessage = userMessage
  }
}

class QaSourceImportCanceledError extends QaSourceImportError {
  constructor() {
    super(QA_SOURCE_FILE_IMPORT_CANCELED_MESSAGE)
  }
}

function throwIfImportCanceled(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw new QaSourceImportCanceledError()
  }
}

function waitForImport<T>(value: PromiseLike<T>, signal?: AbortSignal) {
  if (!signal) {
    return Promise.resolve(value)
  }

  throwIfImportCanceled(signal)

  return new Promise<T>((resolve, reject) => {
    const handleAbort = () => reject(new QaSourceImportCanceledError())

    signal.addEventListener('abort', handleAbort, { once: true })
    Promise.resolve(value).then(resolve, reject).finally(() => {
      signal.removeEventListener('abort', handleAbort)
    })
  })
}

function hasPdfHeader(arrayBuffer: ArrayBuffer) {
  const headerBytes = new Uint8Array(
    arrayBuffer,
    0,
    Math.min(arrayBuffer.byteLength, PDF_HEADER_SEARCH_BYTES),
  )
  const headerText = new TextDecoder('latin1').decode(headerBytes)

  return headerText.includes('%PDF-')
}

function isPdfTextItem(item: unknown): item is PdfTextItem {
  return (
    typeof item === 'object' &&
    item !== null &&
    'str' in item &&
    typeof (item as { str: unknown }).str === 'string'
  )
}

function normalizePdfPageText(value: string) {
  return value
    .replace(/[ \t]+/g, ' ')
    .replace(/[ \t]*\r?\n[ \t]*/g, '\n')
    .trim()
}

function extractPdfPageText(items: unknown[]) {
  return normalizePdfPageText(
    items
      .map((item) =>
        isPdfTextItem(item)
          ? `${item.str}${item.hasEOL ? '\n' : ' '}`
          : '',
      )
      .join(''),
  )
}

function reportPdfProgress(
  onProgress: QaSourcePdfExtractionOptions['onProgress'],
  progress: QaSourcePdfImportProgress,
) {
  onProgress?.(progress)
}

function getPdfStandardFontDataUrl() {
  const baseUrl = import.meta.env.BASE_URL.endsWith('/')
    ? import.meta.env.BASE_URL
    : `${import.meta.env.BASE_URL}/`

  return `${baseUrl}pdfjs/standard_fonts/`
}

function findEndOfCentralDirectory(view: DataView) {
  const minimumEocdLength = 22
  const maximumCommentLength = 0xffff
  const searchStart = Math.max(
    0,
    view.byteLength - minimumEocdLength - maximumCommentLength,
  )

  for (
    let offset = view.byteLength - minimumEocdLength;
    offset >= searchStart;
    offset -= 1
  ) {
    if (
      view.getUint32(offset, true) ===
      ZIP_END_OF_CENTRAL_DIRECTORY_SIGNATURE
    ) {
      return offset
    }
  }

  return -1
}

export function validateDocxZipSafety(arrayBuffer: ArrayBuffer) {
  const view = new DataView(arrayBuffer)
  const eocdOffset = findEndOfCentralDirectory(view)

  if (eocdOffset < 0) {
    return QA_SOURCE_DOCX_UNREADABLE_MESSAGE
  }

  const entryCount = view.getUint16(eocdOffset + 10, true)
  const centralDirectorySize = view.getUint32(eocdOffset + 12, true)
  const centralDirectoryOffset = view.getUint32(eocdOffset + 16, true)

  if (
    entryCount === 0xffff ||
    centralDirectorySize === ZIP64_SENTINEL ||
    centralDirectoryOffset === ZIP64_SENTINEL
  ) {
    return QA_SOURCE_DOCX_STRUCTURE_TOO_LARGE_MESSAGE
  }

  if (entryCount > QA_SOURCE_DOCX_MAX_ZIP_ENTRIES) {
    return QA_SOURCE_DOCX_STRUCTURE_TOO_LARGE_MESSAGE
  }

  if (
    centralDirectoryOffset + centralDirectorySize > view.byteLength
  ) {
    return QA_SOURCE_DOCX_UNREADABLE_MESSAGE
  }

  let offset = centralDirectoryOffset
  let totalUncompressedBytes = 0
  let hasDocumentXml = false
  const textDecoder = new TextDecoder()

  for (let index = 0; index < entryCount; index += 1) {
    if (
      offset + 46 > view.byteLength ||
      view.getUint32(offset, true) !== ZIP_CENTRAL_DIRECTORY_HEADER_SIGNATURE
    ) {
      return QA_SOURCE_DOCX_UNREADABLE_MESSAGE
    }

    const uncompressedSize = view.getUint32(offset + 24, true)
    const fileNameLength = view.getUint16(offset + 28, true)
    const extraFieldLength = view.getUint16(offset + 30, true)
    const fileCommentLength = view.getUint16(offset + 32, true)
    const fileNameStart = offset + 46
    const fileNameEnd = fileNameStart + fileNameLength
    const nextOffset = fileNameEnd + extraFieldLength + fileCommentLength

    if (uncompressedSize === ZIP64_SENTINEL) {
      return QA_SOURCE_DOCX_STRUCTURE_TOO_LARGE_MESSAGE
    }

    if (nextOffset > view.byteLength) {
      return QA_SOURCE_DOCX_UNREADABLE_MESSAGE
    }

    const fileName = textDecoder.decode(
      new Uint8Array(arrayBuffer, fileNameStart, fileNameLength),
    )

    totalUncompressedBytes += uncompressedSize

    if (totalUncompressedBytes > QA_SOURCE_DOCX_MAX_UNCOMPRESSED_BYTES) {
      return QA_SOURCE_DOCX_STRUCTURE_TOO_LARGE_MESSAGE
    }

    if (fileName === 'word/document.xml') {
      hasDocumentXml = true

      if (uncompressedSize > QA_SOURCE_DOCX_MAX_DOCUMENT_XML_BYTES) {
        return QA_SOURCE_DOCX_STRUCTURE_TOO_LARGE_MESSAGE
      }
    }

    offset = nextOffset
  }

  if (!hasDocumentXml) {
    return QA_SOURCE_DOCX_UNREADABLE_MESSAGE
  }

  return null
}

export function deriveQaSourceTitleFromFileName(fileName: string) {
  const safeName = (fileName.split(/[/\\]/).at(-1) ?? fileName).trim()
  const extension = getFileExtension(safeName)
  const withoutExtension =
    extension === null ? safeName : safeName.slice(0, -extension.length)
  const title = withoutExtension
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  return title || 'Imported source'
}

export function validateQaSourceFile(file: Pick<QaSourceImportFile, 'name' | 'size'>) {
  const extension = getFileExtension(file.name)

  if (extension === '.doc') {
    return QA_SOURCE_LEGACY_DOC_UNSUPPORTED_MESSAGE
  }

  if (!isSupportedExtension(extension)) {
    return QA_SOURCE_FILE_UNSUPPORTED_MESSAGE
  }

  if (file.size === 0) {
    return QA_SOURCE_FILE_EMPTY_MESSAGE
  }

  if (
    isTextExtension(extension) &&
    file.size > QA_SOURCE_TEXT_FILE_MAX_BYTES
  ) {
    return QA_SOURCE_FILE_TOO_LARGE_MESSAGE
  }

  if (
    extension === '.docx' &&
    file.size > QA_SOURCE_DOCX_FILE_MAX_BYTES
  ) {
    return QA_SOURCE_DOCX_FILE_TOO_LARGE_MESSAGE
  }

  if (
    extension === '.pdf' &&
    file.size > QA_SOURCE_PDF_FILE_MAX_BYTES
  ) {
    return QA_SOURCE_PDF_FILE_TOO_LARGE_MESSAGE
  }

  return null
}

async function extractTextFromDocx(arrayBuffer: ArrayBuffer) {
  const mammothModule = (await import('mammoth')) as MammothModule
  const converter = mammothModule.default?.convertToHtml ?? ('convertToHtml' in mammothModule ? mammothModule.convertToHtml : undefined)
  const images = mammothModule.default?.images ?? ('images' in mammothModule ? mammothModule.images : undefined)
  if (converter && images) {
    const result = await converter({ arrayBuffer }, {
      includeEmbeddedStyleMap: false, externalFileAccess: false,
      convertImage: images.imgElement(() => Promise.resolve({ src: '' })),
    })
    return extractDocxStructure(result.value)
  }
  const extractRawText =
    mammothModule.extractRawText ?? mammothModule.default?.extractRawText

  if (!extractRawText) {
    throw new Error('Mammoth raw text extractor is unavailable.')
  }

  const result = await extractRawText({
    arrayBuffer,
  })

  return { content: result.value, blocks: [] as DocumentBlock[] }
}

async function extractTextFromPdf(
  arrayBuffer: ArrayBuffer,
  options: QaSourcePdfExtractionOptions = {},
): Promise<QaSourcePdfExtractionResult> {
  throwIfImportCanceled(options.signal)

  const [pdfjsLib, workerModule] = await waitForImport(
    Promise.all([
      import('pdfjs-dist'),
      import('pdfjs-dist/build/pdf.worker.mjs?url') as Promise<PdfWorkerUrlModule>,
    ]),
    options.signal,
  )

  throwIfImportCanceled(options.signal)

  pdfjsLib.GlobalWorkerOptions.workerSrc = workerModule.default

  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(arrayBuffer),
    disableFontFace: true,
    standardFontDataUrl: getPdfStandardFontDataUrl(),
    stopAtErrors: true,
  })
  let abortCleanup: Promise<unknown> | null = null
  const handleAbort = () => {
    abortCleanup = Promise.resolve(loadingTask.destroy()).catch(
      () => undefined,
    )
  }

  options.signal?.addEventListener('abort', handleAbort, { once: true })

  try {
    throwIfImportCanceled(options.signal)
    const pdfDocument = await waitForImport(loadingTask.promise, options.signal)
    throwIfImportCanceled(options.signal)

    if (pdfDocument.numPages > QA_SOURCE_PDF_MAX_PAGES) {
      throw new QaSourceImportError(QA_SOURCE_PDF_TOO_MANY_PAGES_MESSAGE)
    }

    const pageTexts: string[] = []
    const pages: DocumentPage[] = []
    let extractedTextBytes = 0
    let characterOffset = 0
    let pagesWithText = 0

    reportPdfProgress(options.onProgress, {
      processedPages: 0,
      totalPages: pdfDocument.numPages,
      pagesWithText: 0,
    })
    throwIfImportCanceled(options.signal)

    for (let pageNumber = 1; pageNumber <= pdfDocument.numPages; pageNumber += 1) {
      throwIfImportCanceled(options.signal)
      let page: PDFPageProxy | null = null
      let pageText = ''
      let extraction: DocumentPage['extraction'] = 'text'
      let needsVisualReview = false
      try {
        page = await waitForImport(pdfDocument.getPage(pageNumber), options.signal)
        throwIfImportCanceled(options.signal)
        const textContent = await waitForImport(
          page.getTextContent(),
          options.signal,
        )
        throwIfImportCanceled(options.signal)
        pageText = extractPdfPageText(textContent.items)
        if (!pageText) { extraction = 'none'; needsVisualReview = true }
        else { pagesWithText += 1; needsVisualReview = pageText.length < 30 }
        if (typeof page.getOperatorList === 'function') {
          const operators = await waitForImport(page.getOperatorList(), options.signal)
          const imageOperators = new Set([pdfjsLib.OPS.paintImageXObject, pdfjsLib.OPS.paintInlineImageXObject, pdfjsLib.OPS.paintImageMaskXObject, pdfjsLib.OPS.constructPath])
          needsVisualReview ||= operators.fnArray.some((operator) => imageOperators.has(operator))
        }
      } catch (error) {
        throwIfImportCanceled(options.signal)
        if (error instanceof QaSourceImportError) throw error
        extraction = 'failed'
        needsVisualReview = false
      } finally {
        page?.cleanup?.()
      }

      const visibleText = pageText || `[Page ${pageNumber}: ${extraction === 'failed' ? 'extraction failed' : 'no selectable text'} — needs review]`
      const pageEntry = `${pageTexts.length ? '\n\n' : ''}${pdfDocument.numPages > 1 ? `--- Page ${pageNumber} ---\n` : ''}${visibleText}`
      const nextEntryBytes = getUtf8ByteLength(pageEntry)
      if (extractedTextBytes + nextEntryBytes > QA_SOURCE_EXTRACTED_TEXT_MAX_BYTES) throw new QaSourceImportError(QA_SOURCE_EXTRACTED_TEXT_TOO_LARGE_MESSAGE)
      pages.push({ number: pageNumber, startOffset: characterOffset, endOffset: characterOffset + pageEntry.length,
        extraction, status: extraction === 'failed' ? 'failed' : needsVisualReview ? 'needs_visual_review' : 'pending',
        ...(needsVisualReview ? { warning: 'Visual content requires human review. Text analysis does not verify it.' } : {}),
      })
      pageTexts.push(pageEntry)
      characterOffset += pageEntry.length
      extractedTextBytes += nextEntryBytes

      reportPdfProgress(options.onProgress, {
        processedPages: pageNumber,
        totalPages: pdfDocument.numPages,
        pagesWithText,
      })
      throwIfImportCanceled(options.signal)
    }

    return {
      text: pageTexts.join(''),
      pageCount: pdfDocument.numPages,
      pagesWithText,
      pages,
    }
  } finally {
    options.signal?.removeEventListener('abort', handleAbort)

    if (abortCleanup) {
      await abortCleanup
    } else {
      await Promise.resolve(loadingTask.destroy()).catch(() => undefined)
    }
  }
}

function validateExtractedText(content: string, emptyMessage: string) {
  if (content.trim().length === 0) {
    return emptyMessage
  }

  if (getUtf8ByteLength(content) > QA_SOURCE_EXTRACTED_TEXT_MAX_BYTES) {
    return QA_SOURCE_EXTRACTED_TEXT_TOO_LARGE_MESSAGE
  }

  return null
}

function validatePdfExtraction(extraction: QaSourcePdfExtractionResult) {
  if (extraction.pageCount > QA_SOURCE_PDF_MAX_PAGES) {
    return QA_SOURCE_PDF_TOO_MANY_PAGES_MESSAGE
  }

  return validateExtractedText(extraction.text, QA_SOURCE_PDF_EMPTY_MESSAGE)
}

function getImportWarning(extension: SupportedExtension) {
  if (extension === '.docx') {
    return QA_SOURCE_DOCX_IMPORT_WARNING
  }

  if (extension === '.pdf') {
    return QA_SOURCE_PDF_IMPORT_WARNING
  }

  return null
}

function getExtractionErrorMessage(
  error: unknown,
  extension: SupportedExtension,
  signal?: AbortSignal,
) {
  if (
    error instanceof QaSourceImportCanceledError ||
    signal?.aborted ||
    (error instanceof DOMException && error.name === 'AbortError')
  ) {
    return QA_SOURCE_FILE_IMPORT_CANCELED_MESSAGE
  }

  if (error instanceof QaSourceImportError) {
    return error.userMessage
  }

  if (extension === '.docx') {
    return QA_SOURCE_DOCX_UNREADABLE_MESSAGE
  }

  if (extension === '.pdf') {
    return QA_SOURCE_PDF_UNREADABLE_MESSAGE
  }

  return QA_SOURCE_FILE_UNREADABLE_MESSAGE
}

export async function extractQaSourceTextFromFile(
  file: QaSourceImportFile,
  options: QaSourceFileImportOptions = {},
): Promise<QaSourceFileImportResult> {
  const validationError = validateQaSourceFile(file)

  if (validationError) {
    return {
      ok: false,
      error: validationError,
    }
  }

  const extension = getFileExtension(file.name)

  if (!isSupportedExtension(extension)) {
    return {
      ok: false,
      error: QA_SOURCE_FILE_UNSUPPORTED_MESSAGE,
    }
  }

  try {
    throwIfImportCanceled(options.signal)
    let content: string
    let metadata: PdfImportMetadata | undefined
    let originalFileFingerprint: string | undefined
    let pages: DocumentPage[] = []
    let blocks: DocumentBlock[] = []

    if (extension === '.docx') {
      if (options.extractDocxText) {
        content = await waitForImport(
          options.extractDocxText(file),
          options.signal,
        )
      } else {
        if (!file.arrayBuffer) {
          return {
            ok: false,
            error: QA_SOURCE_DOCX_UNREADABLE_MESSAGE,
          }
        }

        const arrayBuffer = await waitForImport(
          file.arrayBuffer(),
          options.signal,
        )
        throwIfImportCanceled(options.signal)
        const docxSafetyError = validateDocxZipSafety(arrayBuffer)

        if (docxSafetyError) {
          return {
            ok: false,
            error: docxSafetyError,
          }
        }

        const extracted = await waitForImport(
          extractTextFromDocx(arrayBuffer),
          options.signal,
        )
        content = extracted.content
        blocks = extracted.blocks
      }
    } else if (extension === '.pdf') {
      if (!file.arrayBuffer) {
        return {
          ok: false,
          error: QA_SOURCE_PDF_UNREADABLE_MESSAGE,
        }
      }

      const arrayBuffer = await waitForImport(
        file.arrayBuffer(),
        options.signal,
      )
      throwIfImportCanceled(options.signal)

      if (!hasPdfHeader(arrayBuffer)) {
        return {
          ok: false,
          error: QA_SOURCE_PDF_INVALID_MESSAGE,
        }
      }

      originalFileFingerprint = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', arrayBuffer)), (byte) => byte.toString(16).padStart(2, '0')).join('')

      const pdfExtraction = await waitForImport(
        options.extractPdfText
          ? options.extractPdfText(arrayBuffer, {
              signal: options.signal,
              onProgress: options.onPdfProgress,
            })
          : extractTextFromPdf(arrayBuffer, {
              signal: options.signal,
              onProgress: options.onPdfProgress,
            }),
        options.signal,
      )
      throwIfImportCanceled(options.signal)
      const pdfContentError = validatePdfExtraction(pdfExtraction)

      if (pdfContentError) {
        return {
          ok: false,
          error: pdfContentError,
        }
      }

      content = pdfExtraction.text
      pages = pdfExtraction.pages ?? []
      metadata = {
        sourceType: 'pdf',
        pageCount: pdfExtraction.pageCount,
        pagesWithText: pdfExtraction.pagesWithText,
        characterCount: pdfExtraction.text.length,
      }
    } else {
      content = await waitForImport(file.text(), options.signal)
    }
    throwIfImportCanceled(options.signal)
    const contentError = validateExtractedText(
      content,
      extension === '.docx'
        ? QA_SOURCE_DOCX_EMPTY_MESSAGE
        : QA_SOURCE_FILE_EMPTY_MESSAGE,
    )

    if (contentError) {
      return {
        ok: false,
        error: contentError,
      }
    }

    return {
      ok: true,
      fileName: file.name,
      title: deriveQaSourceTitleFromFileName(file.name),
      content,
      warning: getImportWarning(extension),
      ...(metadata ? { metadata } : {}),
      documentImport: { schemaVersion: 1, fileName: file.name.slice(0, 512), format: extension === '.md' ? 'markdown' : extension === '.txt' ? 'text' : extension === '.pdf' ? 'pdf' : 'docx', contentFingerprint: await fingerprint(content), pages, blocks, ...(originalFileFingerprint ? { originalFileFingerprint } : {}) },
    }
  } catch (error) {
    return {
      ok: false,
      error: getExtractionErrorMessage(error, extension, options.signal),
    }
  }
}
