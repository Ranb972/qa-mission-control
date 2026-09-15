import { useEffect, useState } from 'react'
import { EvidenceQuote } from '../../components/ui/EvidenceQuote'
import { useWorkspace } from '../../lib/workspace/workspaceContext'
import { loadSourceSets } from '../../lib/workspace/sourceSetRepository'
import { reviewSourceSet, type SourceSetReview } from './sourceSetIntelligence'

/** Current cross-source review is distinct from retired evidence after editing a source. */
export function SourceConflictImpact({ sourceId }: { sourceId: string }) {
  const workspace = useWorkspace()!
  const [reviews, setReviews] = useState<SourceSetReview[] | null>(null)
  const [error, setError] = useState(false)
  useEffect(() => {
    const controller = new AbortController()
    void (async () => {
      const sets = await loadSourceSets(workspace.repository)
      const values: SourceSetReview[] = []
      for (const record of sets.records.filter(record => record.value.members.some(member => member.sourceId === sourceId))) values.push(await reviewSourceSet(workspace, record.value, controller.signal))
      if (!controller.signal.aborted) setReviews(values)
    })().catch(() => { if (!controller.signal.aborted) setError(true) })
    return () => controller.abort()
  }, [workspace, sourceId])
  if (error) return <p role="alert">Related source-set impact could not be read. Reopen this view to refresh; saved evidence is unchanged.</p>
  if (!reviews) return <p role="status">Checking related source evidence locally…</p>
  const groups = reviews.flatMap(review => review.relations.filter(group => group.kind === 'potential_conflict' && review.requirements.some(item => item.sourceId === sourceId && group.requirementIds.includes(item.id))).map(group => ({ review, group })))
  if (!groups.length) return null
  return <section className="source-conflict-impact" aria-label="Cross-source change impact"><h4>Cross-source changes requiring review</h4><p>These current sources disagree or clarify a shared policy. Confirm version and scope before changing QA work. Neither claim replaces the other automatically.</p>
    {groups.map(({ review, group }) => {
      const findings = review.requirements.filter(item => group.requirementIds.includes(item.id))
      const rows = review.traceability.rows.filter(row => group.requirementIds.includes(row.requirement.id))
      const testIds = new Set(rows.flatMap(row => [...row.confirmedTestIds, ...row.staleTestIds]))
      const tests = workspace.get('testCases').items.filter(test => testIds.has(test.id))
      const releaseIds = new Set(rows.flatMap(row => row.releaseIds))
      const preserved = review.traceability.rows.filter(row => !group.requirementIds.includes(row.requirement.id) && row.confirmedTestIds.length > 0)
      return <details className="document-result" key={`${review.set.id}:${group.id}`}><summary><span className="document-kind document-kind--ambiguity">Review required</span><strong>{findings[0]?.coverageTopic}</strong><span>{tests.length} linked tests affected</span></summary><div className="document-result__body">
        <div className="requirement-comparison">{findings.map(item => <div key={item.id}><strong>{item.summary}</strong><p className="helper-text">{review.sources.find(source => source.id === item.sourceId)?.title}</p><EvidenceQuote quote={item.evidence.quote} location={`Lines ${item.evidence.location.startLine}–${item.evidence.location.endLine}`} /></div>)}</div>
        <h5>Affected coverage</h5><p>{[...new Set(findings.map(item => item.coverageTopic))].join(' · ')}</p>
        <h5>Linked Test Cases · review required</h5>{tests.length ? tests.map(test => <p key={test.id}>{test.title}</p>) : <p>No reviewed test is linked. Clarify the policy before drafting executable expectations.</p>}
        <h5>Release understanding</h5><p>{workspace.get('releases').items.filter(release => releaseIds.has(release.id)).map(release => `${release.name} ${release.version}`).join(' · ') || 'Review any release baseline that includes these sources.'} — unresolved source scope is not approval. Existing execution history is retained.</p>
        <p className="helper-text">Impact is limited to the findings and saved links above. {preserved.length} other requirements in this set retain their QA-confirmed test links; no unrelated test is invalidated.</p>
      </div></details>
    })}
  </section>
}
