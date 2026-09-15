import type { DocumentSnapshot } from './documentTypes'
import { fingerprint } from './documentFingerprint'
import { isTestableRequirement, type Requirement } from './requirementModel'

export type RequirementCoverageArea = {
  id: string
  sourceId: string
  name: string
  fingerprint: string
  readiness: 'needs_review' | 'blocked_by_ambiguity'
}
export type RequirementCoverageLink = {
  id: string
  sourceId: string
  requirementId: string
  requirementFingerprint: string
  coverageAreaId: string
  active?: boolean
}
export type IntelligenceNode = {
  id: string
  sourceId: string
  parentId: string | null
  title: string
  sectionId: string | null
  depth: number
  ownRequirements: number
  totalRequirements: number
  ambiguities: number
  totalUnits: number
  currentUnits: number
}
export type RequirementRelationGroup = {
  id: string
  kind: 'exact_duplicate' | 'possible_overlap' | 'potential_conflict'
  requirementIds: string[]
  requiresReview: boolean
}
export type CoverageIntelligence = {
  sourceId: string
  sourceRevision: string
  requirementSetFingerprint: string
  areas: RequirementCoverageArea[]
  links: RequirementCoverageLink[]
  nodes: IntelligenceNode[]
  relations: RequirementRelationGroup[]
  testableRequirements: number
  uncoveredRequirements: string[]
  ambiguousRequirements: string[]
}
const normalized = (text: string) => text.trim().replace(/\s+/g, ' ').normalize('NFC')
const topicKey = (text: string) => normalized(text).toLocaleLowerCase()
const signature = (item: Requirement) => `${item.kind}\u001f${normalized(item.summary)}\u001f${normalized(item.evidence.quote)}`

/** Linear deterministic buckets, never all-pairs semantic fanout. Grouping does not delete findings or choose a winning claim. */
export function groupRequirementRelations(requirements: Requirement[]): RequirementRelationGroup[] {
  const exact = new Map<string, Requirement[]>()
  const numeric = new Map<string, Requirement[]>()
  const lexical = new Map<string, Requirement[]>()
  const reviewTopics = new Map<string, Requirement[]>()
  const append = (map: Map<string, Requirement[]>, key: string, item: Requirement) => {
    const group = map.get(key)
    if (group) group.push(item)
    else map.set(key, [item])
  }
  for (const item of requirements) {
    if (!isTestableRequirement(item) && item.kind !== 'ambiguity') continue
    append(exact, signature(item), item)
    if (item.coverageTopic.trim()) append(reviewTopics, topicKey(item.coverageTopic), item)
    const meaning = topicKey(item.summary)
    // Compare policy quantities conservatively; preserve numeric account/route/requirement identities.
    const quantityKey = meaning.replace(/\b\d+(?:[.,]\d+)?\s*(days?|hours?|minutes?|seconds?|weeks?|months?|years?|bytes?|mb|gb)\b/g, '<number> $1')
    if (quantityKey !== meaning) append(numeric, `${item.kind}:${quantityKey}`, item)
    const words = meaning.match(/[\p{L}\p{N}]+/gu) ?? []
    if (words.length >= 6) append(lexical, `${topicKey(item.coverageTopic)}:${words.filter((word) => word.length > 3).slice(0, 6).sort().join('|')}`, item)
  }
  const relations: RequirementRelationGroup[] = []
  const recorded = new Set<string>()
  const emit = (kind: RequirementRelationGroup['kind'], values: Requirement[]) => {
    const ids = [...new Set(values.map((item) => item.id))].sort()
    const key = ids.join('|')
    if (ids.length < 2 || recorded.has(key)) return
    recorded.add(key)
    relations.push({ id: `${kind}:${relations.length + 1}`, kind, requirementIds: ids, requiresReview: kind !== 'exact_duplicate' })
  }
  for (const values of exact.values()) if (values.length > 1) emit('exact_duplicate', values)
  for (const values of numeric.values()) if (new Set(values.map((item) => normalized(item.summary))).size > 1) emit('potential_conflict', values)
  // A shared topic with an explicitly unresolved finding across sources is a review candidate,
  // not a semantic verdict or permission to replace either canonical claim.
  for (const values of reviewTopics.values()) if (values.some(item => item.kind === 'ambiguity') && new Set(values.map(item => item.sourceId)).size > 1) emit('potential_conflict', values)
  for (const values of lexical.values()) if (new Set(values.map(signature)).size > 1) emit('possible_overlap', values)
  return relations
}

/** Local unit → section → chapter → source reduction. No growing prompt and no loss of leaf provenance. */
export async function buildCoverageIntelligence(snapshot: DocumentSnapshot, requirements: Requirement[], currentUnitIds: ReadonlySet<string>): Promise<CoverageIntelligence> {
  const sourceId = snapshot.manifest.sourceId
  const rootId = `intelligence:${sourceId}`
  const nodes = new Map<string, IntelligenceNode>()
  nodes.set(rootId, { id: rootId, sourceId, parentId: null, title: 'Entire specification', sectionId: null, depth: 0,
    ownRequirements: 0, totalRequirements: 0, ambiguities: 0, totalUnits: 0, currentUnits: 0 })
  for (const section of snapshot.sections) nodes.set(section.id, { id: section.id, sourceId, parentId: section.parentId ?? rootId, title: section.title,
    sectionId: section.id, depth: section.level, ownRequirements: 0, totalRequirements: 0, ambiguities: 0, totalUnits: 0, currentUnits: 0 })
  const units = new Map(snapshot.units.map((unit) => [unit.id, unit]))
  for (const unit of snapshot.units) {
    const node = nodes.get(unit.sectionId)!
    node.totalUnits += 1
    if (currentUnitIds.has(unit.id)) node.currentUnits += 1
  }
  const topics = new Map<string, Requirement[]>()
  const uncoveredRequirements: string[] = []
  const ambiguousRequirements: string[] = []
  let testableRequirements = 0
  const current: Requirement[] = []
  for (const requirement of requirements) {
    const unit = units.get(requirement.unitId)
    if (!unit || requirement.sourceId !== sourceId || requirement.sourceCreatedAt !== snapshot.manifest.sourceCreatedAt || requirement.unitReuseKey !== unit.reuseKey) continue
    current.push(requirement)
    const node = nodes.get(unit.sectionId)!
    if (requirement.kind === 'ambiguity') { node.ambiguities += 1; ambiguousRequirements.push(requirement.id) }
    if (isTestableRequirement(requirement)) {
      testableRequirements += 1; node.ownRequirements += 1; node.totalRequirements += 1
      if (!requirement.coverageTopic.trim()) uncoveredRequirements.push(requirement.id)
    }
    if ((isTestableRequirement(requirement) || requirement.kind === 'ambiguity') && requirement.coverageTopic.trim()) {
      const key = topicKey(requirement.coverageTopic)
      const group = topics.get(key)
      if (group) group.push(requirement)
      else topics.set(key, [requirement])
    }
  }
  for (const node of [...nodes.values()].sort((left, right) => right.depth - left.depth)) {
    if (!node.parentId) continue
    const parent = nodes.get(node.parentId)!
    parent.totalRequirements += node.totalRequirements
    parent.ambiguities += node.ambiguities
    parent.totalUnits += node.totalUnits
    parent.currentUnits += node.currentUnits
  }
  const areas: RequirementCoverageArea[] = []
  const links: RequirementCoverageLink[] = []
  const relations = groupRequirementRelations(current)
  const conflictIds = new Set(relations.filter((relation) => relation.kind === 'potential_conflict').flatMap((relation) => relation.requirementIds))
  for (const [key, members] of topics) {
    const id = `coverage-${await fingerprint(JSON.stringify([sourceId, snapshot.manifest.sourceCreatedAt, key]))}`
    areas.push({ id, sourceId, name: members[0].coverageTopic,
      fingerprint: await fingerprint(JSON.stringify(members.map((member) => member.fingerprint).sort())),
      readiness: members.some((member) => member.kind === 'ambiguity' || conflictIds.has(member.id)) ? 'blocked_by_ambiguity' : 'needs_review' })
    for (const member of members) links.push({ id: `${id}:${member.id}`, sourceId, requirementId: member.id, requirementFingerprint: member.fingerprint, coverageAreaId: id, active: true })
  }
  return { sourceId, sourceRevision: snapshot.manifest.sourceRevision,
    requirementSetFingerprint: await fingerprint(JSON.stringify(current.map((item) => [item.id, item.fingerprint]).sort(([left], [right]) => left.localeCompare(right)))),
    areas, links, nodes: [...nodes.values()], relations,
    testableRequirements, uncoveredRequirements, ambiguousRequirements }
}
