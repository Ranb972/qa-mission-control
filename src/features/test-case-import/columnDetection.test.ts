import { describe, expect, it } from 'vitest'
import {
  createInitialColumnMapping,
  detectColumnMapping,
  findMappingConflicts,
} from './columnDetection'

describe('column detection', () => {
  it('detects common English columns with high confidence', () => {
    const detectedMapping = detectColumnMapping([
      'Test Case',
      'Module',
      'Test Steps',
      'Expected Outcome',
      'Severity',
      'Test Type',
    ])

    expect(detectedMapping.title).toEqual({
      header: 'Test Case',
      confidence: 'High confidence',
    })
    expect(detectedMapping.area).toEqual({
      header: 'Module',
      confidence: 'High confidence',
    })
    expect(detectedMapping.steps).toEqual({
      header: 'Test Steps',
      confidence: 'High confidence',
    })
    expect(detectedMapping.expectedResult).toEqual({
      header: 'Expected Outcome',
      confidence: 'High confidence',
    })
    expect(detectedMapping.priority).toEqual({
      header: 'Severity',
      confidence: 'High confidence',
    })
    expect(detectedMapping.type).toEqual({
      header: 'Test Type',
      confidence: 'High confidence',
    })
  })

  it('detects Hebrew columns with high confidence', () => {
    const detectedMapping = detectColumnMapping([
      'שם בדיקה',
      'מסך / רכיב',
      'פעולות לביצוע',
      'תוצאות צפויות',
      'עדיפות',
      'סוג בדיקה',
    ])

    expect(createInitialColumnMapping(detectedMapping)).toEqual({
      title: 'שם בדיקה',
      area: 'מסך / רכיב',
      steps: 'פעולות לביצוע',
      expectedResult: 'תוצאות צפויות',
      priority: 'עדיפות',
      type: 'סוג בדיקה',
    })
  })

  it('supports flexible partial Hebrew mapping with medium confidence', () => {
    const detectedMapping = detectColumnMapping([
      'שם התסריט לבדיקה',
      'אזור במערכת הראשית',
      'שלבי בדיקה מלאים',
      'תוצאה צפויה אחרי פעולה',
    ])

    expect(detectedMapping.title).toEqual({
      header: 'שם התסריט לבדיקה',
      confidence: 'Medium confidence',
    })
    expect(detectedMapping.area).toEqual({
      header: 'אזור במערכת הראשית',
      confidence: 'Medium confidence',
    })
    expect(detectedMapping.steps).toEqual({
      header: 'שלבי בדיקה מלאים',
      confidence: 'Medium confidence',
    })
    expect(detectedMapping.expectedResult).toEqual({
      header: 'תוצאה צפויה אחרי פעולה',
      confidence: 'Medium confidence',
    })
  })

  it('detects mapping conflicts when one column is assigned to multiple fields', () => {
    expect(
      findMappingConflicts({
        title: 'Scenario',
        steps: 'Scenario',
        expectedResult: 'Expected',
      }),
    ).toEqual([
      {
        header: 'Scenario',
        fields: ['title', 'steps'],
      },
    ])
  })
})
