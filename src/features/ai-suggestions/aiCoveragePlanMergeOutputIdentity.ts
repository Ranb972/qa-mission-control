import type { AiCoveragePlan } from './aiCoveragePlanTypes'
import type { AiCoveragePlanMergeFindingKind } from './aiCoveragePlanMergeTypes'

export type AiCoveragePlanMergeOutputIdentity = {
  outputFindingId: string
  outputFindingKind: AiCoveragePlanMergeFindingKind
  evidenceCount: number
}

export function createAiCoveragePlanMergeBehaviorOutputFindingId(
  coverageAreaId: string,
  behaviorIndex: number,
) {
  return `${coverageAreaId}:behavior:${behaviorIndex}`
}

export function createAiCoveragePlanMergeScalarOutputFindingId(
  kind: Exclude<
    AiCoveragePlanMergeFindingKind,
    'coverage_area' | 'behavior' | 'ambiguity' | 'next_coverage'
  >,
  index: number,
) {
  return `${kind}:${index}`
}

export function enumerateAiCoveragePlanMergeOutputIdentities(
  plan: AiCoveragePlan,
): AiCoveragePlanMergeOutputIdentity[] {
  const result: AiCoveragePlanMergeOutputIdentity[] = []

  for (const area of plan.coverageAreas) {
    result.push({
      outputFindingId: area.id,
      outputFindingKind: 'coverage_area',
      evidenceCount: area.evidence.length,
    })
    area.behaviors.forEach((_behavior, index) => {
      result.push({
        outputFindingId: createAiCoveragePlanMergeBehaviorOutputFindingId(
          area.id,
          index,
        ),
        outputFindingKind: 'behavior',
        evidenceCount: 0,
      })
    })
  }

  const addScalarList = (
    kind: Exclude<
      AiCoveragePlanMergeFindingKind,
      'coverage_area' | 'behavior' | 'ambiguity' | 'next_coverage'
    >,
    values: string[],
  ) => {
    values.forEach((_value, index) => {
      result.push({
        outputFindingId: createAiCoveragePlanMergeScalarOutputFindingId(
          kind,
          index,
        ),
        outputFindingKind: kind,
        evidenceCount: 0,
      })
    })
  }

  addScalarList('actor', plan.actors)
  addScalarList('state', plan.states)
  addScalarList('input', plan.inputs)
  addScalarList('failure_mode', plan.failureModes)
  addScalarList('integration_risk', plan.integrationRisks)
  addScalarList('permissions_security', plan.permissionsSecurity)
  addScalarList('data_persistence', plan.dataPersistenceRules)
  addScalarList('warning', plan.warnings)

  for (const ambiguity of plan.ambiguities) {
    result.push({
      outputFindingId: ambiguity.id,
      outputFindingKind: 'ambiguity',
      evidenceCount: 0,
    })
  }

  for (const nextCoverage of plan.nextGenerationAreas) {
    result.push({
      outputFindingId: nextCoverage.id,
      outputFindingKind: 'next_coverage',
      evidenceCount: 0,
    })
  }

  return result
}
