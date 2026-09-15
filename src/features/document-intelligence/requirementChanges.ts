import type { PreparedAnalysis } from '../../lib/workspace/analysisJobRepository'
import type { RequirementTestLink } from './requirementTraceability'
import type { RequirementCoverageLink } from './coverageIntelligence'
import { isTestableRequirement } from './requirementModel'

/** Exact current membership only. Similar titles, ordinals and quotes never restore historical authority. */
export function requirementChangeInventory(prepared: PreparedAnalysis, testLinks: RequirementTestLink[], coverageLinks: RequirementCoverageLink[]) {
  const current = new Map((prepared.currentRequirements ?? []).map((item) => [item.id, item]))
  const withArtifacts = new Set([...testLinks.map((link) => link.requirementId), ...coverageLinks.map((link) => link.requirementId)])
  const seen = new Set<string>()
  return prepared.requirements.filter((item) => {
    if (item.sourceId !== prepared.source.id || item.sourceCreatedAt !== prepared.source.createdAt || !isTestableRequirement(item) || seen.has(item.id)) return false
    seen.add(item.id)
    return current.get(item.id)?.fingerprint !== item.fingerprint
  }).map((requirement) => ({ requirement, hasAffectedArtifacts: withArtifacts.has(requirement.id) }))
    .sort((a, b) => Number(b.hasAffectedArtifacts) - Number(a.hasAffectedArtifacts) || b.requirement.createdAt.localeCompare(a.requirement.createdAt) || a.requirement.evidence.location.startOffset - b.requirement.evidence.location.startOffset)
}
