import { describe, expect, it } from 'vitest'
import { activityForChanges, appendActivity, parseActivityLedger, type ActivityLedger } from './workspaceHistory'

describe('bounded source-free workspace activity', () => {
  it('records meaningful operations but not analysis task fanout, source bodies or artificial restore activity', () => {
    const changes = [{ collection: 'sources', put: [{ id: 'source', order: 0, value: { content: 'PRIVATE SOURCE' } }] }, { collection: 'requirementTestLinks', put: [{ id: 'trace', order: 0, value: {} }] }]
    expect(activityForChanges(changes)).toEqual([{ category: 'sources', action: 'saved', count: 1 }, { category: 'test_traceability', action: 'saved', count: 1 }])
    expect(activityForChanges([{ ...changes[0], replace: true }])).toEqual([])
    expect(activityForChanges([{ collection: 'analysisTasks', put: changes[0].put }])).toEqual([])
    expect(activityForChanges([{ collection: 'analysisJobs', put: [{ id: 'job', order: 0, value: { status: 'completed', rawResponse: 'not copied' } }] }])).toEqual([{ category: 'analysis', action: 'completed', count: 1 }])
  })
  it('retains exactly the latest 200 operations and rejects unbounded or provider-shaped history', () => {
    let history: ActivityLedger = { id: 'recent', events: [] }
    for (let index = 0; index < 220; index++) history = appendActivity(history, [{ category: 'execution', action: 'saved', count: 1 }], new Date(1000 * index).toISOString())
    expect(history.events).toHaveLength(200)
    expect(history.events[0].at).toBe(new Date(219000).toISOString())
    expect(history.events.at(-1)!.at).toBe(new Date(20000).toISOString())
    expect(parseActivityLedger(history)).toEqual(history)
    expect(parseActivityLedger({ ...history, rawPrompt: 'bad' })).toBeNull()
    expect(parseActivityLedger({ ...history, events: [...history.events, history.events[0]] })).toBeNull()
    expect(parseActivityLedger({ ...history, events: [{ ...history.events[0], items: [{ category: 'execution', action: 'approved_by_ai', count: 1 }] }] })).toBeNull()
  })
})
