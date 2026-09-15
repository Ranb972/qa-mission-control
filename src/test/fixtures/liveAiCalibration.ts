/** Synthetic regression material for evidence, metadata and compound behaviors.
 * No original document text or live provider data. */
export const liveAiCalibrationFixtures = [
  {
    anchor: '1.2',
    source: 'Requirement 1.2\nUse the most recent validated data for the invoice day.\nInclude data that failed solely because of a routing-metadata conflict.\nProduce an exception report.\nModify routing metadata for that invoice day only to agree with invoice gateway data.\nReload and revalidate the data.',
    behaviors: [
      ['Use the latest validated invoice day data.', 'Use the most recent validated data for the invoice day.'],
      ['Include data failed solely by a routing-metadata conflict.', 'Include data that failed solely because of a routing-metadata conflict.'],
      ['Produce an exception report.', 'Produce an exception report.'],
      ['Limit routing-metadata corrections to that invoice day.', 'Modify routing metadata for that invoice day only to agree with invoice gateway data.'],
      ['Reload and revalidate corrected data.', 'Reload and revalidate the data.'],
    ],
  },
  {
    anchor: '7.8',
    source: 'Requirement 7.8\nRouting-metadata changes must maintain an audit trail identifying the user,\n  the nature of the change, and the date and time.\nThe audit trail must be available for authorized control reporting.',
    behaviors: [
      ['Record the identity of the user making a change.', 'Routing-metadata changes must maintain an audit trail identifying the user, the nature of the change, and the date and time.'],
      ['Record the nature of each change.', 'Routing-metadata changes must maintain an audit trail identifying the user, the nature of the change, and the date and time.'],
      ['Record the date and time of each change.', 'Routing-metadata changes must maintain an audit trail identifying the user, the nature of the change, and the date and time.'],
      ['Provide authorized audit reporting.', 'The audit trail must be available for authorized control reporting.'],
    ],
  },
  {
    anchor: 'SYN_REF_F001',
    source: 'Requirement ID: SYN_REF_F001\nStatus: M\nTitle: Import demo routing rules\nMan/auto: Manual & Automatic\nFrequency: As Necessary\nVolumes:\nFunctional Requirements: The demo router shall accept operator-entered routing rules as well as scheduled rule imports. Imported routing rules require validation before the demo router can use them.',
    behaviors: [
      ['Accept routing rules from operators and scheduled imports.', 'The demo router shall accept operator-entered routing rules as well as scheduled rule imports.'],
      ['Validate routing rules before use.', 'Imported routing rules require validation before the demo router can use them.'],
    ],
  },
  {
    anchor: '6.16',
    source: 'Requirement 6.16\nCheck numeric fields and key calculated values against valid ranges.\nReject invalid values or produce a warning as configured.\nCheck calculated values before accepting them.\nThe valid ranges must be configurable.',
    behaviors: [
      ['Check numeric fields against valid ranges.', 'Check numeric fields and key calculated values against valid ranges.'],
      ['Reject invalid values or warn according to configuration.', 'Reject invalid values or produce a warning as configured.'],
      ['Validate calculated values before acceptance.', 'Check calculated values before accepting them.'],
      ['Allow valid ranges to be configured.', 'The valid ranges must be configurable.'],
    ],
  },
  {
    anchor: '8.24',
    source: 'Requirement 8.24\nThe system shall provide facilities e.g. (backup, restore and restart jobs) to recover from hardware failure or an unexpected error.',
    behaviors: [
      ['Provide backup facilities.', 'The system shall provide facilities e.g. (backup, restore and restart jobs) to recover from hardware failure or an unexpected error.'],
      ['Provide restore facilities.', 'The system shall provide facilities e.g. (backup, restore and restart jobs) to recover from hardware failure or an unexpected error.'],
      ['Allow jobs to be restarted.', 'The system shall provide facilities e.g. (backup, restore and restart jobs) to recover from hardware failure or an unexpected error.'],
      ['Support recovery after hardware failure or an unexpected error.', 'The system shall provide facilities e.g. (backup, restore and restart jobs) to recover from hardware failure or an unexpected error.'],
    ],
  },
] as const

export function calibrationSectionResponse(fixture: typeof liveAiCalibrationFixtures[number]) {
  return {
    schemaVersion: 'section-coverage-plan-json-v1',
    coverageAreas: [{ name: `Requirement ${fixture.anchor}`, summary: 'Review the supported functional requirement as one coherent area.',
      behaviors: fixture.behaviors.map(([behavior]) => String(behavior)),
      evidence: [...new Set(fixture.behaviors.map(([, evidence]) => evidence))],
      behaviorEvidence: fixture.behaviors.map(([behavior, evidence]) => ({ behavior: String(behavior), evidence: [String(evidence)] })),
    }],
    actors: [], states: [], inputs: [], failureModes: [], integrationRisks: [], permissionsSecurity: [], dataPersistenceConcerns: [],
    ambiguities: [], nextCoverage: [], warnings: [],
  }
}
