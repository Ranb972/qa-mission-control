import { useState, type ChangeEvent } from 'react'
import {
  parseSmartPasteSteps,
  type SmartPasteParsedStep,
  type SmartPasteParseResult,
} from './smartPasteSteps'

type SmartPasteInsertMode = 'append' | 'replace'

type SmartPasteStepsPanelProps = {
  onInsert: (
    mode: SmartPasteInsertMode,
    steps: SmartPasteParsedStep[],
  ) => void
  onCancel: () => void
}

function getSummary(parseResult: SmartPasteParseResult | null) {
  const steps = parseResult?.steps ?? []
  const completeSteps = steps.filter(
    (step) => step.action.trim() !== '' && step.expectedResult.trim() !== '',
  )
  const stepsNeedingReview = steps.filter(
    (step) => step.action.trim() !== '' && step.expectedResult.trim() === '',
  )

  return {
    detectedSteps: steps.length,
    completeSteps: completeSteps.length,
    stepsNeedingReview: stepsNeedingReview.length,
    invalidLines: parseResult?.invalidLines.length ?? 0,
  }
}

export function SmartPasteStepsPanel({
  onInsert,
  onCancel,
}: SmartPasteStepsPanelProps) {
  const [rawText, setRawText] = useState('')
  const [parseResult, setParseResult] =
    useState<SmartPasteParseResult | null>(null)

  const summary = getSummary(parseResult)
  const hasDetectedSteps = summary.detectedSteps > 0
  const hasStepsNeedingReview = summary.stepsNeedingReview > 0
  const appendLabel = hasStepsNeedingReview
    ? 'Append steps needing review'
    : 'Append steps'
  const replaceLabel = hasStepsNeedingReview
    ? 'Replace with steps needing review'
    : 'Replace current steps'

  function handleTextChange(event: ChangeEvent<HTMLTextAreaElement>) {
    setRawText(event.target.value)
    setParseResult(null)
  }

  function handlePreview() {
    setParseResult(parseSmartPasteSteps(rawText))
  }

  function handleInsert(mode: SmartPasteInsertMode) {
    if (!parseResult?.steps.length) {
      return
    }

    onInsert(mode, parseResult.steps)
  }

  return (
    <section className="smart-paste-panel" aria-labelledby="smart-paste-heading">
      <div className="panel-heading">
        <div className="panel-heading__content">
          <h5 id="smart-paste-heading">Smart Paste Steps</h5>
          <p>
            Paste steps from Excel, Jira, Word, or old test scripts. Review what
            was detected before adding anything to this test case.
          </p>
        </div>
      </div>

      <div className="smart-paste-examples">
        <p className="field-label">Supported examples</p>
        <pre>
{`1. Open login page | Login form is displayed
Step 1: Enter valid email
Expected: Email is accepted
צעד 1: ללחוץ התחברות
תוצאה צפויה: המשתמש נכנס למערכת`}
        </pre>
      </div>

      <div className="field-group">
        <label className="field-label" htmlFor="smart-paste-steps">
          Paste step text
        </label>
        <textarea
          id="smart-paste-steps"
          className="textarea"
          value={rawText}
          onChange={handleTextChange}
          aria-describedby="smart-paste-help"
          placeholder="Paste numbered steps here. Use |, =>, ->, —, or spaced - between action and expected result."
        />
        <p id="smart-paste-help" className="helper-text">
          Nothing is inserted until you preview and choose Append or Replace.
        </p>
      </div>

      <div className="button-row">
        <button
          type="button"
          className="button button--secondary"
          onClick={handlePreview}
        >
          Preview steps
        </button>
        <button type="button" className="button button--secondary" onClick={onCancel}>
          Cancel Smart Paste
        </button>
      </div>

      {parseResult ? (
        <div className="smart-paste-preview">
          <div className="smart-paste-summary" aria-label="Smart Paste summary">
            <span className="badge badge--neutral">
              {summary.detectedSteps} detected
            </span>
            <span className="badge badge--positive">
              {summary.completeSteps} complete
            </span>
            <span className="badge badge--warning">
              {summary.stepsNeedingReview} needing review
            </span>
            <span className="badge badge--outline">
              {summary.invalidLines} invalid lines
            </span>
          </div>

          {parseResult.warnings.length > 0 ? (
            <div className="smart-paste-message smart-paste-message--warning">
              <p className="field-label">Needs attention</p>
              <ul>
                {parseResult.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {!hasDetectedSteps ? (
            <div className="smart-paste-message">
              <p className="field-label">No steps detected</p>
              <p>
                Try numbered lines such as:
                {' '}
                <span>1. Open login page | Login form is displayed</span>
              </p>
            </div>
          ) : (
            <>
              <div className="structured-step-list">
                {parseResult.steps.map((step, index) => (
                  <article key={`${step.action}-${index}`} className="structured-step">
                    <div className="structured-step__header">
                      <span className="badge badge--neutral">
                        Preview Step {index + 1}
                      </span>
                      <span
                        className={`badge ${
                          step.confidence === 'Needs review'
                            ? 'badge--warning'
                            : 'badge--outline'
                        }`}
                      >
                        {step.confidence}
                      </span>
                    </div>

                    <div className="description-grid">
                      <div className="description-block">
                        <span className="field-label">Action</span>
                        <p>{step.action}</p>
                      </div>
                      <div className="description-block">
                        <span className="field-label">Expected Result</span>
                        {step.expectedResult ? (
                          <p>{step.expectedResult}</p>
                        ) : (
                          <p className="field-error">Missing expected result</p>
                        )}
                      </div>
                    </div>

                    {step.warnings.length > 0 ? (
                      <ul className="smart-paste-step-warnings">
                        {step.warnings.map((warning) => (
                          <li key={warning}>{warning}</li>
                        ))}
                      </ul>
                    ) : null}
                  </article>
                ))}
              </div>

              {parseResult.invalidLines.length > 0 ? (
                <div className="smart-paste-message">
                  <p className="field-label">Skipped lines</p>
                  <ul>
                    {parseResult.invalidLines.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div className="button-row">
                <button
                  type="button"
                  className="button button--primary"
                  onClick={() => handleInsert('append')}
                >
                  {appendLabel}
                </button>
                <button
                  type="button"
                  className="button button--secondary"
                  onClick={() => handleInsert('replace')}
                >
                  {replaceLabel}
                </button>
              </div>
            </>
          )}
        </div>
      ) : null}
    </section>
  )
}
