import { fingerprint, utf8Length } from '../document-intelligence/documentFingerprint'
import { projectEvidence, validateEvidenceInput, PRODUCT_INPUT_BYTES, type PendingClue } from './productEvidence'

/** Explicit selected text files only. No filesystem traversal, clone, execution or network. */
export async function importRepositoryEvidence(inputs: { name: string; text: string }[]) {
  if (!inputs.length || inputs.length > 100) throw new Error('Select 1–100 explicit repository or documentation files.')
  const paths = new Set<string>(); let bytes = 0
  for (const input of inputs) {
    validateEvidenceInput(input)
    const path = input.name.replace(/\\/g, '/')
    if (paths.has(path) || !/\.(?:[cm]?[jt]sx?|py|java|cs|go|rb|rs|php|md|txt)$/i.test(path)) throw new Error('Choose distinct supported source-code, README or text files. Archives, credentials and binaries are not read.')
    paths.add(path); bytes += utf8Length(input.text)
  }
  if (bytes > PRODUCT_INPUT_BYTES) throw new Error('The selected repository excerpts exceed 2 MB in total. Choose a smaller explicit scope; no prefix was imported.')
  const files = []; const clues: PendingClue[] = []; let omitted = 0; let represented = 0
  for (let fileIndex = 0; fileIndex < inputs.length; fileIndex++) {
    const input = inputs[fileIndex]; const lines = input.text.split(/\r\n|\r|\n/)
    files.push({ path: input.name.replace(/\\/g, '/'), fingerprint: await fingerprint(input.text), lineCount: lines.length })
    for (let index = 0; index < lines.length; index++) {
      const line = lines[index].trim()
      if (!line) continue
      let kind: PendingClue['kind'] | null = null
      if (line.length <= 1000) {
        if (/\.(?:md|txt)$/i.test(input.name)) kind = 'documentation'
        else if (/(?:\b(?:app|router|server)\s*\.\s*(?:get|post|put|delete|patch|route|use)\s*\(|@(?:Get|Post|Put|Delete|Patch|RequestMapping|app\.route)|\bpath\s*[:=]\s*["']\/|\bfetch\s*\(\s*["']\/)/i.test(line)) kind = 'route'
        else if (/\b(?:test|it|describe)\s*\(|\bdef\s+test_|\bfunc\s+Test[A-Z]|@Test\b/.test(line)) kind = 'test'
        else if (/\b(?:FEATURE_[A-Z_0-9]+|[A-Z_0-9]+_ENABLED)\b/.test(line)) kind = 'feature_flag'
        else if (/\.(?:jsx|tsx)$/i.test(input.name) && /\b(?:export\s+(?:default\s+)?(?:function|class|const)\s+[A-Z]|function\s+[A-Z])/.test(line)) kind = 'component'
        else if (/\b(?:export\s+(?:default\s+)?(?:class|function|const|interface|type)|class\s+\w+|def\s+\w+|func\s+\w+|module\s+\w+|const\s+[A-Z_0-9]+\s*=)/.test(line)) kind = 'module'
      }
      if (!kind) { omitted++; continue }
      if (clues.length >= 3000) throw new Error('The selected files exceed 3,000 clues. Select a smaller explicit scope; no prefix was imported.')
      represented++
      clues.push({ kind, summary: line, origin: { fileIndex, line: index + 1 } })
    }
  }
  return projectEvidence('repository', files, clues, [
    'Only explicitly selected excerpts are represented, not the complete repository or deployed product.',
    'Route/module/component/test/flag detection is heuristic; declarations do not prove reachability, behavior or passing tests.',
    `${represented} nonblank lines represented; ${omitted} nonblank lines not recognized or over 1,000 characters. Missing clues are not proof of missing implementation.`,
    'No code was executed and no repository, dependency, linked page or remote API was fetched. Review excerpts for confidential data before saving.',
  ])
}
