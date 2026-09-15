import type { TestCase } from './testCaseTypes'
import {
  getDisplayPreconditions,
  getDisplayTestCaseSteps,
} from './testCaseContent'

type TestCaseContentDisplayProps = {
  testCase: TestCase
}

export function TestCaseContentDisplay({
  testCase,
}: TestCaseContentDisplayProps) {
  const preconditions = getDisplayPreconditions(testCase)
  const steps = getDisplayTestCaseSteps(testCase)

  return (
    <div className="test-case-content">
      <section className="preconditions-block">
        <h4>Preconditions</h4>
        {preconditions ? (
          <p>{preconditions}</p>
        ) : (
          <p className="helper-text">No preconditions defined.</p>
        )}
      </section>

      <section className="structured-steps-block">
        <h4>Execution Steps</h4>
        <div className="structured-step-list">
          {steps.map((step, index) => (
            <article key={step.id} className="structured-step">
              <div className="structured-step__header">
                <span className="badge badge--neutral">Step {index + 1}</span>
              </div>

              <div className="description-grid">
                <div className="description-block">
                  <span className="field-label">Action</span>
                  <p>{step.action}</p>
                </div>
                <div className="description-block">
                  <span className="field-label">Expected Result</span>
                  <p>{step.expectedResult}</p>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}
