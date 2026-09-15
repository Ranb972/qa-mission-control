import type { Release } from '../releases/releaseTypes'
import type { Requirement } from '../document-intelligence/requirementModel'
import { isTestableRequirement } from '../document-intelligence/requirementModel'
import type { SourceSetReview } from '../document-intelligence/sourceSetIntelligence'

export type ReleaseRequirementBaseline = {
  schemaVersion: 1
  id: string
  releaseCreatedAt: string
  sourceSetId: string
  sourceSetCreatedAt: string
  members: Array<{ sourceId: string; sourceCreatedAt: string }>
  requirements: Array<{ id: string; fingerprint: string }>
  capturedAt: string
}
const bounded = (value: unknown, max: number): value is string => typeof value === 'string' && value.trim().length > 0 && value.length <= max
const date = (value: unknown): value is string => bounded(value, 80) && Number.isFinite(Date.parse(value))
export function parseReleaseRequirementBaseline(value: unknown): ReleaseRequirementBaseline | null {
  if (!value || typeof value !== 'object') return null
  const item = value as Record<string, unknown>
  if (item.schemaVersion !== 1 || !bounded(item.id, 2000) || !date(item.releaseCreatedAt) || !bounded(item.sourceSetId, 200) || !date(item.sourceSetCreatedAt) || !date(item.capturedAt) ||
    !Array.isArray(item.members) || item.members.length < 1 || item.members.length > 100 || !Array.isArray(item.requirements) || item.requirements.length > 100000) return null
  const members: ReleaseRequirementBaseline['members'] = []
  const memberIds = new Set<string>()
  for (const raw of item.members) {
    if (!raw || typeof raw !== 'object') return null
    const member = raw as Record<string, unknown>
    if (!bounded(member.sourceId, 2000) || memberIds.has(member.sourceId) || !date(member.sourceCreatedAt)) return null
    members.push({ sourceId: member.sourceId, sourceCreatedAt: member.sourceCreatedAt }); memberIds.add(member.sourceId)
  }
  const requirements: ReleaseRequirementBaseline['requirements'] = []
  const ids = new Set<string>()
  for (const raw of item.requirements) {
    if (!raw || typeof raw !== 'object') return null
    const requirement = raw as Record<string, unknown>
    if (!bounded(requirement.id, 200) || ids.has(requirement.id) || typeof requirement.fingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(requirement.fingerprint)) return null
    requirements.push({ id: requirement.id, fingerprint: requirement.fingerprint }); ids.add(requirement.id)
  }
  return { schemaVersion: 1, id: item.id, releaseCreatedAt: item.releaseCreatedAt, sourceSetId: item.sourceSetId, sourceSetCreatedAt: item.sourceSetCreatedAt, members, requirements, capturedAt: item.capturedAt }
}
export function makeReleaseRequirementBaseline(release: Release, review: SourceSetReview): ReleaseRequirementBaseline {
  return { schemaVersion: 1, id: release.id, releaseCreatedAt: release.createdAt, sourceSetId: review.set.id, sourceSetCreatedAt: review.set.createdAt,
    members: review.set.members.map((member) => ({ ...member })), requirements: review.requirements.filter(isTestableRequirement).map(({ id, fingerprint }) => ({ id, fingerprint })), capturedAt: new Date().toISOString() }
}
export function compareReleaseRequirementBaseline(baseline: ReleaseRequirementBaseline, review: SourceSetReview) {
  const current = new Map(review.requirements.filter(isTestableRequirement).map((item) => [item.id, item]))
  const before = new Map(baseline.requirements.map((item) => [item.id, item]))
  const changed = baseline.requirements.filter((item) => current.get(item.id)?.fingerprint !== item.fingerprint)
  const added = [...current.values()].filter((item) => !before.has(item.id))
  const signature = (members: ReleaseRequirementBaseline['members']) => members.map((member) => JSON.stringify([member.sourceId, member.sourceCreatedAt])).sort().join('|')
  return { changed, added, unchanged: baseline.requirements.length - changed.length, membershipChanged: signature(baseline.members) !== signature(review.set.members) }
}
export function summarizeReleaseRequirements(baseline: ReleaseRequirementBaseline, review: SourceSetReview) {
  const comparison = compareReleaseRequirementBaseline(baseline, review)
  const testable = review.traceability.rows.filter((row) => isTestableRequirement(row.requirement))
  const failures = testable.filter((row) => row.failedTestIds.length > 0)
  const unverified = testable.filter((row) => row.unverifiedExecutionIds.length > 0)
  const noVerifiedRun = testable.filter((row) => row.confirmedTestIds.length === 0 || row.unrunTestIds.length === row.confirmedTestIds.length)
  return { comparison, total: testable.length, withCoverage: review.traceability.withCoverageArea, withTests: review.traceability.withConfirmedTest,
    uncovered: testable.filter((row) => !row.confirmedTestIds.length), failures, blocked: testable.filter((row) => row.blockedTestIds.length > 0), unverified, noVerifiedRun,
    ambiguities: review.requirements.filter((item) => item.kind === 'ambiguity'), conflicts: review.relations.filter((group) => group.kind === 'potential_conflict'),
    pendingRegions: review.sources.reduce((sum, source) => sum + source.total - source.current, 0), visualBlocks: review.sources.reduce((sum, source) => sum + source.visual, 0), missingSources: review.sources.filter((source) => source.missing).length }
}
const safe = (text: string) => text.replace(/[\r\n]+/g, ' ').replace(/([\\`*_[\]<>])/g, '\\$1')
export function formatReleaseRequirementMarkdown(baseline: ReleaseRequirementBaseline, review: SourceSetReview, historical: Requirement[] = []) {
  const summary = summarizeReleaseRequirements(baseline, review)
  const before = new Map(historical.map((item) => [item.id, item]))
  const current = new Map(review.requirements.map((item) => [item.id, item]))
  const sourceNames = new Map(review.sources.map((source) => [source.id, source.title]))
  const describe = (requirement: Requirement) => `${safe(requirement.summary)} — ${safe(sourceNames.get(requirement.sourceId) ?? 'Historical source')} · ${requirement.evidence.location.page ? `page ${requirement.evidence.location.page}, ` : ''}lines ${requirement.evidence.location.startLine}–${requirement.evidence.location.endLine}`
  return ['## Source and requirement traceability', '', `Source set: ${safe(review.set.name)}. Baseline captured: ${baseline.capturedAt}.`,
    'AI interpretation and traceability are not approval or proof of tested behavior. Recorded historical failures remain visible; only matching test-design fingerprints verify current execution.', '',
    `- Current testable requirements: ${summary.total}`, `- Saved coverage links: ${summary.withCoverage} / ${summary.total}`, `- QA-confirmed test traceability: ${summary.withTests} / ${summary.total}`,
    `- Historical requirements changed or retired: ${summary.comparison.changed.length}`, `- Added current requirements: ${summary.comparison.added.length}`, `- Requirements linked to recorded failures: ${summary.failures.length}`,
    `- Requirements linked to blocked tests: ${summary.blocked.length}`, `- Requirements without a verified current-design execution: ${summary.noVerifiedRun.length}`, `- Requirements with unverified historical execution: ${summary.unverified.length}`, `- Unresolved ambiguities: ${summary.ambiguities.length}`, `- Potential cross-source conflicts: ${summary.conflicts.length}`,
    `- Pending / failed / review regions: ${summary.pendingRegions}`, `- Visual-review blocks: ${summary.visualBlocks}`, `- Missing source members: ${summary.missingSources}`, ...(summary.comparison.membershipChanged ? ['- Source-set membership changed since the baseline; scope requires explicit review.'] : []), '',
    '### Source accounting', ...review.sources.map((source) => `- ${safe(source.title)}: ${source.missing ? 'missing; no replacement inferred' : `${source.current}/${source.total} analyzed regions, ${source.failed} failed, ${source.visual} visual-review blocks`}`), '',
    '### Requirements without confirmed tests', ...(summary.uncovered.length ? summary.uncovered.map((row) => `- ${describe(row.requirement)}`) : ['None among current analyzed requirements.']), '',
    '### Changed or retired historical requirements', ...(summary.comparison.changed.length ? summary.comparison.changed.map((item) => { const previous = before.get(item.id); return previous?.fingerprint === item.fingerprint ? `- Historical: ${describe(previous)}; evidence: ${safe(previous.evidence.quote)}` : '- Historical requirement identity retained; the exact earlier evidence is unavailable.' }) : ['None since the captured baseline.']), '',
    '### Added requirements', ...(summary.comparison.added.length ? summary.comparison.added.map((item) => `- ${describe(item)}`) : ['None since the captured baseline.']), '',
    '### Requirements linked to recorded failures', ...(summary.failures.length ? summary.failures.map((row) => `- ${describe(row.requirement)}${row.unverifiedExecutionIds.length ? ' — historical execution design requires re-verification' : ''}`) : ['No linked failures recorded for this release.']), '',
    '### Unresolved source findings', ...summary.ambiguities.map((item) => `- Ambiguity: ${describe(item)}`), ...summary.conflicts.map((group) => `- Potential requirement conflict: ${group.requirementIds.map((id) => current.get(id)).filter((item): item is Requirement => !!item).map(describe).join(' / ')} — clarification required.`), '',
    '### Requirement evidence inventory', ...review.requirements.map((item) => `- ${item.kind.replaceAll('_', ' ')}: ${describe(item)}; evidence: ${safe(item.evidence.quote)}`), '',
  ].join('\n')
}
