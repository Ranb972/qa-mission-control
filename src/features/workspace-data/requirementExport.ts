import type { WorkspaceBackup } from '../../lib/workspace/workspaceBackup'
import type { Requirement } from '../document-intelligence/requirementModel'
import type { QaSource } from '../qa-sources/qaSourceTypes'

/** Neutralize spreadsheet formulas as well as ordinary CSV quoting. */
export function csvCell(value: string | number) {
  let text = String(value)
  if (/^[\s\p{Cc}]*[=+\-@]/u.test(text)) text = `'${text}`
  return `"${text.replaceAll('"', '""')}"`
}
export function exportRequirementHistoryCsv(backup: WorkspaceBackup) {
  const sources = new Map(backup.collections.sources.map((record) => [record.id, (record.value as QaSource).title]))
  const header = ['Requirement ID', 'Source', 'Kind', 'Summary', 'Evidence', 'Source revision', 'Page', 'Start line', 'End line', 'Original file', 'Original file line', 'JSON pointer', 'Interpretation date', 'Scope note']
  return '\uFEFF' + [header, ...backup.collections.requirements.map((record) => {
    const item = record.value as Requirement
    return [item.id, sources.get(item.sourceId) ?? 'Historical source', item.kind, item.summary, item.evidence.quote, item.sourceRevision, item.evidence.location.page ?? '', item.evidence.location.startLine, item.evidence.location.endLine, item.evidence.location.filePath ?? '', item.evidence.location.fileLine ?? '', item.evidence.location.jsonPointer ?? '', item.createdAt, 'Stored interpretation; may be historical. Review current freshness in QA Mission Control.']
  })].map((row) => row.map(csvCell).join(',')).join('\r\n')
}
