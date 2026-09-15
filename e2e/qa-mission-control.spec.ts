import { Buffer } from 'node:buffer'
import { join } from 'node:path'
import { expect, test, type Locator, type Page } from '@playwright/test'
import { installWorkspaceInspection } from './workspace-inspection'

type TestCaseInput = {
  title: string
  area?: string
  priority?: 'Low' | 'Medium' | 'High' | 'Critical'
  status?: 'Not Run' | 'Passed' | 'Failed' | 'Blocked'
  type?: 'Functional' | 'UI' | 'Regression' | 'Smoke' | 'Edge Case'
  preconditions?: string
  steps?: string
  expectedResult?: string
  structuredSteps?: Array<{
    action: string
    expectedResult: string
  }>
}

type ReleaseInput = {
  name: string
  version: string
  targetDate?: string
  status?: 'Planning' | 'In Testing' | 'Blocked' | 'Ready' | 'Released'
  notes?: string
}

type QaSourceInput = {
  title?: string
  sourceType?: 'Requirement' | 'User Story' | 'PRD' | 'LLD' | 'Notes' | 'Other'
  status?: 'Draft' | 'Reviewed' | 'Ready for test design'
  content?: string
  notes?: string
  importFile?: {
    name: string
    content?: string
    mimeType?: string
    path?: string
    expectedContent?: string
    expectedContentIncludes?: string[]
  }
}

test.beforeEach(async ({ page }) => {
  await installWorkspaceInspection(page)
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Operational snapshot' })).toBeVisible()
})

async function navigateTo(page: Page, viewName: string) {
  await page
    .getByRole('button', { name: new RegExp(`^${escapeRegExp(viewName)}\\b`) })
    .click()
  await expect(
    page.getByRole('heading', { name: viewName, exact: true }),
  ).toBeVisible()
}

async function createTestCase(page: Page, input: TestCaseInput) {
  await navigateTo(page, 'Test Cases')
  await page.getByRole('button', { name: 'New test case' }).click()

  const form = page.getByRole('form', { name: 'Create Test Case form' })

  await form.getByLabel('Title').fill(input.title)
  await form.getByLabel('Area').fill(input.area ?? 'Checkout')
  await form.getByLabel('Type').selectOption(input.type ?? 'Functional')
  await form.getByLabel('Priority').selectOption(input.priority ?? 'Medium')
  await form.getByLabel('Status').selectOption(input.status ?? 'Not Run')

  if (input.preconditions) {
    await form.getByLabel('Preconditions').fill(input.preconditions)
  }

  const structuredSteps = input.structuredSteps ?? [
    {
      action: input.steps ?? `Run the workflow for ${input.title}.`,
      expectedResult:
        input.expectedResult ?? 'The workflow completes successfully.',
    },
  ]

  await form.getByLabel('Step 1 action').fill(structuredSteps[0].action)
  await form
    .getByLabel('Step 1 expected result')
    .fill(structuredSteps[0].expectedResult)

  for (let index = 1; index < structuredSteps.length; index += 1) {
    await form.getByRole('button', { name: 'Add step' }).click()
    await form
      .getByLabel(`Step ${index + 1} action`)
      .fill(structuredSteps[index].action)
    await form
      .getByLabel(`Step ${index + 1} expected result`)
      .fill(structuredSteps[index].expectedResult)
  }

  await form.getByRole('button', { name: 'Create test case' }).click()

  await expect(page.getByRole('heading', { name: input.title })).toBeVisible()
}

async function createRelease(page: Page, input: ReleaseInput) {
  await navigateTo(page, 'Releases')
  await page.getByRole('button', { name: 'New release' }).click()

  const form = page.getByRole('form', { name: 'Create Release form' })

  await form.getByLabel('Release name').fill(input.name)
  await form.getByLabel('Version').fill(input.version)
  await form.getByLabel('Target date').fill(input.targetDate ?? '2026-06-30')
  await form.getByLabel('Release status').selectOption(input.status ?? 'Planning')

  if (input.notes) {
    await form.getByLabel('Notes').fill(input.notes)
  }

  await form.getByRole('button', { name: 'Create release' }).click()

  await expect(page.getByRole('heading', { name: input.name })).toBeVisible()
}

async function createTestSuite(
  page: Page,
  input: {
    name: string
    type?: 'Smoke' | 'Regression' | 'Sanity' | 'Feature' | 'Custom'
    testCaseNames: string[]
  },
) {
  await navigateTo(page, 'Test Suites')
  await page.getByRole('button', { name: 'New suite' }).click()

  const form = page.getByRole('form', { name: 'Create Test Suite form' })

  await form.getByLabel('Suite name').fill(input.name)
  await form.getByLabel('Suite type').selectOption(input.type ?? 'Smoke')

  for (const testCaseName of input.testCaseNames) {
    await form.getByLabel(new RegExp(testCaseName)).check()
  }

  await form.getByRole('button', { name: 'Create suite' }).click()

  await expect(page.getByRole('article', { name: input.name })).toBeVisible()
}

async function createQaSource(page: Page, input: QaSourceInput) {
  await navigateTo(page, 'QA Sources')
  await page.getByRole('button', { name: 'New QA Source' }).click()

  const form = page.getByRole('form', { name: 'Create QA Source form' })

  if (input.title) {
    await form.getByLabel('Source title').fill(input.title)
  }

  await form.getByLabel('Source type').selectOption(input.sourceType ?? 'LLD')
  await form.getByLabel('Source status').selectOption(input.status ?? 'Draft')

  if (input.importFile) {
    const fileInput = form.getByLabel(
      'Import .txt, .md, .docx, or .pdf file',
    )

    if (input.importFile.path) {
      await fileInput.setInputFiles(input.importFile.path)
    } else {
      await fileInput.setInputFiles({
        name: input.importFile.name,
        mimeType: input.importFile.mimeType ?? 'text/markdown',
        buffer: Buffer.from(input.importFile.content ?? '', 'utf-8'),
      })
    }

    if (/\.docx$/i.test(input.importFile.name)) {
      await expect(
        form.getByText(
          new RegExp(
            `Extracted readable text from ${input.importFile.name.replace(
              /[.*+?^${}()|[\]\\]/g,
              '\\$&',
            )}\\. Review before saving;`,
          ),
        ),
      ).toBeVisible()
    } else if (/\.pdf$/i.test(input.importFile.name)) {
      await expect(
        form.getByText(
          new RegExp(
            `Extracted readable text from ${escapeRegExp(
              input.importFile.name,
            )}: \\d+ of \\d+ pages contained selectable text, [\\d,]+ characters\\. Review before saving;`,
          ),
        ),
      ).toBeVisible()
    } else {
      await expect(
        form.getByText(
          `Imported ${input.importFile.name}. Review the content before saving.`,
        ),
      ).toBeVisible()
    }

    const sourceContentField = form.getByLabel('Source content')

    if (input.importFile.expectedContentIncludes) {
      for (const expectedContent of input.importFile.expectedContentIncludes) {
        await expect(sourceContentField).toHaveValue(
          new RegExp(escapeRegExp(expectedContent)),
        )
      }
    } else {
      await expect(sourceContentField).toHaveValue(
        input.importFile.expectedContent ?? input.importFile.content ?? '',
      )
    }
  } else if (input.content) {
    await form.getByLabel('Source content').fill(input.content)
  }

  if (input.notes) {
    await form.getByLabel('Notes').fill(input.notes)
  }

  await form.getByRole('button', { name: 'Create QA Source' }).click()

  const expectedTitle =
    input.title ??
    (input.importFile
      ? input.importFile.name
          .replace(/\.(txt|md|docx|pdf)$/i, '')
          .replace(/[-_]+/g, ' ')
          .trim()
      : '')

  await expect(
    page.getByRole('article', {
      name: expectedTitle,
    }),
  ).toBeVisible()
}

async function createCriticalBug(page: Page, title: string) {
  await navigateTo(page, 'Bugs')
  await page.getByRole('button', { name: 'New bug' }).click()

  const form = page.getByRole('form', { name: 'Create Bug form' })

  await form.getByLabel('Title').fill(title)
  await form.getByLabel('Severity').selectOption('Critical')
  await form.getByLabel('Status').selectOption('Open')
  await form
    .getByLabel('Description')
    .fill('Critical checkout regression blocks release confidence.')
  await form
    .getByLabel('Steps To Reproduce')
    .fill('Open checkout and submit payment.')
  await form
    .getByLabel('Expected Behavior')
    .fill('Payment completes and confirmation appears.')
  await form
    .getByLabel('Actual Behavior')
    .fill('Payment fails with a server error.')
  await form.getByRole('button', { name: 'Create bug' }).click()

  await expect(page.getByRole('heading', { name: title })).toBeVisible()
}

async function openExecutionsForRelease(
  page: Page,
  releaseName: string,
  version: string,
) {
  await navigateTo(page, 'Executions')
  await page
    .getByLabel('Select release')
    .selectOption({ label: `${releaseName} (${version})` })
}

function getExecutionCard(page: Page, testCaseTitle: string): Locator {
  return page.getByRole('article', { name: testCaseTitle })
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

async function selectExecutionCase(page: Page, testCaseTitle: string) {
  if ((await getExecutionCard(page, testCaseTitle).count()) === 0) {
    await page.getByRole('button', { name: new RegExp(testCaseTitle) }).click()
  }

  await expect(getExecutionCard(page, testCaseTitle)).toBeVisible()
}

async function markExecution(
  page: Page,
  testCaseTitle: string,
  result: 'Not Run' | 'Passed' | 'Failed' | 'Blocked',
) {
  await selectExecutionCase(page, testCaseTitle)
  await getExecutionCard(page, testCaseTitle)
    .getByLabel('Execution result')
    .selectOption(result)
}

async function saveExecutionNotes(
  page: Page,
  testCaseTitle: string,
  notes: string,
) {
  await selectExecutionCase(page, testCaseTitle)
  const notesField = getExecutionCard(page, testCaseTitle).getByLabel(
    'Execution notes',
  )

  await notesField.fill(notes)
  await notesField.blur()
}

async function expectSummaryCount(page: Page, label: string, value: string) {
  await expect(
    page.getByRole('region', { name: label }).getByText(value, { exact: true }),
  ).toBeVisible()
}

function readinessPanel(page: Page) {
  return page.getByRole('region', { name: 'Release Readiness' })
}

test('presents the editorial workspace accessibly on a mobile viewport', async ({
  page,
}) => {
  const consoleErrors: string[] = []
  const pageErrors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text())
    }
  })
  page.on('pageerror', (error) => pageErrors.push(error.message))

  await page.setViewportSize({ width: 390, height: 844 })
  await page.reload()

  await expect(page).toHaveTitle('QA Mission Control')
  await page.getByRole('button', { name: 'Menu', exact: true }).click()
  await expect(
    page.getByRole('heading', { level: 1, name: 'QA Mission Control' }),
  ).toBeVisible()
  await expect(page.getByText('AI suggests. QA approves.', { exact: true })).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'Operational snapshot' }),
  ).toBeVisible()

  const mainBox = await page.getByRole('main').boundingBox()
  expect(mainBox).not.toBeNull()
  expect(mainBox!.y).toBeLessThan(240)
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true)

  const navigation = page.getByRole('navigation', { name: 'Workspace pages' })
  expect(
    await navigation.evaluate(
      (element) => element.scrollWidth <= element.clientWidth,
    ),
  ).toBe(true)

  const qaSourcesButton = page.getByRole('button', { name: /^QA Sources\b/ })
  await page.keyboard.press('Tab')
  await page.keyboard.press('Tab')
  await expect(qaSourcesButton).toBeFocused()
  expect(
    await qaSourcesButton.evaluate(
      (element) => getComputedStyle(element).outlineStyle,
    ),
  ).toBe('solid')
  await qaSourcesButton.click()
  await expect(
    page.getByRole('heading', { name: 'QA Sources', exact: true }),
  ).toBeVisible()
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true)
  expect(consoleErrors).toEqual([])
  expect(pageErrors).toEqual([])
})

test('creates a test case and persists it after refresh', async ({ page }) => {
  await createTestCase(page, {
    title: 'E2E login persistence',
    area: 'Authentication',
  })

  await page.reload()
  await navigateTo(page, 'Test Cases')

  await expect(
    page.getByRole('heading', { name: 'E2E login persistence' }),
  ).toBeVisible()
})

test('creates a test suite and persists membership after refresh', async ({
  page,
}) => {
  await createTestCase(page, {
    title: 'E2E suite checkout case',
    area: 'Checkout',
  })
  await createTestCase(page, {
    title: 'E2E suite login case',
    area: 'Authentication',
  })

  await navigateTo(page, 'Test Suites')
  await page.getByRole('button', { name: 'New suite' }).click()

  const form = page.getByRole('form', { name: 'Create Test Suite form' })

  await form.getByLabel('Suite name').fill('E2E Smoke Suite')
  await form.getByLabel('Suite type').selectOption('Smoke')
  await form
    .getByLabel('Description')
    .fill('Smoke coverage for E2E membership persistence.')
  await form.getByLabel(/E2E suite checkout case/).check()
  await form.getByLabel(/E2E suite login case/).check()
  await form.getByRole('button', { name: 'Create suite' }).click()

  const suiteCard = page.getByRole('article', { name: 'E2E Smoke Suite' })

  await expect(suiteCard.getByText('2 test cases')).toBeVisible()
  await suiteCard.getByText('Included Test Cases', { exact: true }).click()
  await expect(suiteCard.getByText('E2E suite checkout case')).toBeVisible()
  await expect(suiteCard.getByText('E2E suite login case')).toBeVisible()

  await page.reload()
  await navigateTo(page, 'Test Suites')

  const persistedSuiteCard = page.getByRole('article', {
    name: 'E2E Smoke Suite',
  })

  await expect(persistedSuiteCard.getByText('2 test cases')).toBeVisible()
  await persistedSuiteCard.getByText('Included Test Cases', { exact: true }).click()
  await expect(
    persistedSuiteCard.getByText('E2E suite checkout case'),
  ).toBeVisible()
  await expect(persistedSuiteCard.getByText('E2E suite login case')).toBeVisible()
})

test('creates, edits, and persists QA source material', async ({ page }) => {
  const docxFixturePath = join(
    process.cwd(),
    'e2e',
    'fixtures',
    'qa-source-import.docx',
  )
  const docxExtractedText = [
    'QA Source DOCX Fixture',
    '',
    'Payment authorization must handle approved, declined, and timeout responses.',
    '',
    'שורת דרישה בעברית',
    '',
    'Bullet: Send customer notification after approval.',
    '',
    '',
  ].join('\n')

  await createQaSource(page, {
    sourceType: 'LLD',
    importFile: {
      name: 'qa-source-import.docx',
      path: docxFixturePath,
      expectedContent: docxExtractedText,
    },
    notes: 'Review timeout retries before test design.',
  })

  const sourceCard = page.getByRole('article', {
    name: 'qa source import',
  })

  await expect(sourceCard).toContainText('LLD')
  await expect(sourceCard).toContainText('Draft')
  await expect(sourceCard).toContainText('QA Source DOCX Fixture')
  await expect(sourceCard).toContainText('Payment authorization')
  await expect(sourceCard).toContainText('שורת דרישה בעברית')
  await expect(sourceCard).toContainText('timeout retries')

  await page.reload()
  await navigateTo(page, 'QA Sources')

  const persistedSourceCard = page.getByRole('article', {
    name: 'qa source import',
  })

  await expect(persistedSourceCard).toBeVisible()
  await expect(persistedSourceCard).toContainText('QA Source DOCX Fixture')
  await expect(persistedSourceCard).toContainText('Payment authorization')
  await expect(persistedSourceCard).toContainText('שורת דרישה בעברית')
  await expect(persistedSourceCard).toContainText('timeout retries')

  await page
    .getByRole('article', { name: 'qa source import' })
    .getByRole('button', { name: 'Edit' })
    .click()

  const form = page.getByRole('form', { name: 'Edit QA Source form' })

  await expect(form.getByLabel('Source content')).toHaveValue(docxExtractedText)
  await form.getByLabel('Source status').selectOption('Ready for test design')
  await form.getByRole('button', { name: 'Save changes' }).click()

  await expect(
    page.getByRole('article', { name: 'qa source import' }),
  ).toContainText('Ready for test design')

  await page.reload()
  await navigateTo(page, 'QA Sources')

  await expect(
    page.getByRole('article', { name: 'qa source import' }),
  ).toContainText('Ready for test design')

  await page
    .getByRole('article', { name: 'qa source import' })
    .getByRole('button', { name: 'Edit' })
    .click()
  await expect(
    page
      .getByRole('form', { name: 'Edit QA Source form' })
      .getByLabel('Source content'),
  ).toHaveValue(docxExtractedText)
})

test('imports Markdown QA source material and persists it', async ({ page }) => {
  const markdownSource = [
    '# Customer Notification LLD',
    '',
    'Payment authorization must handle approved, declined, and timeout responses.',
  ].join('\n')

  await createQaSource(page, {
    sourceType: 'LLD',
    importFile: {
      name: 'customer-notification-lld.md',
      content: markdownSource,
      mimeType: 'text/markdown',
    },
  })

  const sourceCard = page.getByRole('article', {
    name: 'customer notification lld',
  })

  await expect(sourceCard).toContainText('Customer Notification LLD')
  await expect(sourceCard).toContainText('Payment authorization')
  await expect(sourceCard.getByText('Source Structure', { exact: true })).toBeVisible()
  await expect(sourceCard.getByText('1 section')).toBeVisible()
  await expect(
    sourceCard.getByText(/Sections are deterministic source-structure helpers/),
  ).not.toBeVisible()

  await sourceCard.getByText('Source Structure', { exact: true }).click()

  await expect(
    sourceCard.getByText(/Sections are deterministic source-structure helpers/),
  ).toBeVisible()
  await expect(sourceCard.getByText('1. Customer Notification LLD')).toBeVisible()

  await page.reload()
  await navigateTo(page, 'QA Sources')

  const persistedSourceCard = page.getByRole('article', {
    name: 'customer notification lld',
  })

  await expect(persistedSourceCard).toContainText('Customer Notification LLD')
  await expect(persistedSourceCard).toContainText('Payment authorization')
  await expect(persistedSourceCard.getByText('Source Structure', { exact: true })).toBeVisible()
  await expect(persistedSourceCard.getByText('1 section')).toBeVisible()
})

test('imports PDF QA source material and persists extracted text', async ({
  page,
}) => {
  const consoleMessages: string[] = []
  const pdfFixturePath = join(
    process.cwd(),
    'e2e',
    'fixtures',
    'qa-source-import.pdf',
  )
  const pdfExpectedTextSentinels = [
    'QA Source PDF Fixture',
    'Payment authorization must handle approved, declined, and timeout responses.',
    'Bullet: Send customer notification after approval.',
  ]

  page.on('console', (message) => {
    consoleMessages.push(message.text())
  })

  await createQaSource(page, {
    sourceType: 'LLD',
    importFile: {
      name: 'qa-source-import.pdf',
      path: pdfFixturePath,
      expectedContentIncludes: pdfExpectedTextSentinels,
    },
  })

  const sourceCard = page.getByRole('article', {
    name: 'qa source import',
  })

  await expect(sourceCard).toContainText('QA Source PDF Fixture')
  await expect(sourceCard).toContainText('Payment authorization')
  await expect(sourceCard).toContainText('customer notification')

  await page.reload()
  await navigateTo(page, 'QA Sources')

  await page
    .getByRole('article', { name: 'qa source import' })
    .getByRole('button', { name: 'Edit' })
    .click()

  const persistedSourceContent = page
    .getByRole('form', { name: 'Edit QA Source form' })
    .getByLabel('Source content')

  for (const expectedText of pdfExpectedTextSentinels) {
    await expect(persistedSourceContent).toHaveValue(
      new RegExp(escapeRegExp(expectedText)),
    )
  }
  expect(
    consoleMessages.filter((message) =>
      message.toLowerCase().includes('fake worker'),
    ),
  ).toEqual([])
  expect(
    consoleMessages.filter((message) =>
      message.toLowerCase().includes('standardfontdataurl'),
    ),
  ).toEqual([])
})

test('opens AI Coverage Workspace for a saved QA Source without real provider generation', async ({
  page,
}) => {
  const aiSourceContent =
    'Checkout payment authorization must handle approved, declined, and timeout responses.'
  let backendRequest: Record<string, unknown> | null = null

  await page.route('**/api/ai/test-case-suggestions', async (route) => {
    backendRequest = route.request().postDataJSON() as Record<string, unknown>

    await route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: false,
        error: {
          code: 'provider_unavailable',
          message:
            'AI generation requires a configured server-side provider and is not enabled yet.',
          retryable: true,
        },
      }),
    })
  })

  await createQaSource(page, {
    title: 'E2E AI source',
    sourceType: 'Requirement',
    status: 'Ready for test design',
    content: aiSourceContent,
  })

  await navigateTo(page, 'AI Coverage Workspace')
  await expect(
    page.getByRole('heading', {
      name: /Focused workspace for QA coverage/,
    }),
  ).toHaveCount(0)
  const coverageDeck = page.getByRole('region', { name: 'Global coverage & suggestions' })
  await expect(coverageDeck).toBeVisible()
  await expect(
    coverageDeck.getByRole('heading', {
      name: 'Select a QA Source to launch coverage analysis',
    }),
  ).toBeVisible()
  await expect(
    coverageDeck.getByText('Locked: awaiting coverage analysis.'),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Generate tests for selected area' }),
  ).toHaveCount(0)
  await coverageDeck
    .getByLabel('QA Source', { exact: true })
    .selectOption({ label: 'E2E AI source' })

  await page.getByRole('button', { name: 'Advanced: direct suggestions' }).click()

  await expect(page.getByRole('region', { name: 'Characters' })).toContainText(
    aiSourceContent.length.toString(),
  )
  await expect(page.getByRole('region', { name: 'Truncated' })).toContainText(
    'No',
  )

  await page.getByRole('button', { name: 'Generate direct suggestions' }).click()

  await expect(
    page.getByText(
      'AI generation requires a configured server-side provider and is not enabled yet.',
    ),
  ).toBeVisible()
  expect(backendRequest).toMatchObject({
    requestVersion: 'v1',
    sourceTitle: 'E2E AI source',
    sourceType: 'Requirement',
    sourceStatus: 'Ready for test design',
    content: aiSourceContent,
  })
  expect(backendRequest).not.toHaveProperty('testCases')
  expect(backendRequest).not.toHaveProperty('bugs')
  expect(backendRequest).not.toHaveProperty('prompt')

  await page.reload()
  await navigateTo(page, 'Test Cases')

  await expect(page.getByText('No test cases yet')).toBeVisible()
})

test('imports an approved AI suggestion from a mocked backend response', async ({
  page,
}) => {
  await page.route('**/api/ai/test-case-suggestions', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        suggestions: [
          {
            id: 'provider-controlled-id',
            title: 'Checkout approves valid card from AI',
            area: 'Checkout',
            priority: 'High',
            type: 'Functional',
            preconditions: 'User is signed in with a valid card.',
            structuredSteps: [
              {
                action: 'Open checkout.',
                expectedResult: 'Checkout page opens.',
              },
              {
                action: 'Enter valid card details.',
                expectedResult: 'Card details are accepted for authorization.',
              },
              {
                action: 'Submit valid card details.',
                expectedResult: 'Payment authorization is approved.',
              },
            ],
            evidence: ['Approved card responses must be handled.'],
            assumptions: [],
            warnings: [],
          },
        ],
        warnings: [],
      }),
    })
  })

  await createQaSource(page, {
    title: 'E2E AI approval source',
    sourceType: 'Requirement',
    status: 'Ready for test design',
    content: 'Approved card responses must be handled.',
  })

  await navigateTo(page, 'AI Coverage Workspace')
  await page
    .getByLabel('QA Source', { exact: true })
    .selectOption({ label: 'E2E AI approval source' })

  await page.getByRole('button', { name: 'Advanced: direct suggestions' }).click()
  await page.getByRole('button', { name: 'Generate direct suggestions' }).click()

  await expect(
    page.getByRole('heading', {
      name: 'Checkout approves valid card from AI',
    }),
  ).toBeVisible()
  await expect(page.getByText('3 steps')).toBeVisible()
  await expect(page.getByText('Open checkout.')).toBeVisible()
  await expect(
    page.getByText('Card details are accepted for authorization.'),
  ).toBeVisible()

  await page.getByRole('checkbox', { name: 'Approve for import' }).check()
  // A real IndexedDB write failure must not mark the transient draft imported.
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put
    IDBObjectStore.prototype.put = function(value, key) {
      if (value?.collection === 'testCases') {
        IDBObjectStore.prototype.put = original
        this.transaction.abort()
        throw new DOMException('Injected test-write failure', 'QuotaExceededError')
      }
      return key === undefined ? original.call(this, value) : original.call(this, value, key)
    }
  })
  await page.getByRole('button', { name: 'Create Test Cases from approved Ready suggestions', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Test Cases were not saved')
  await expect(page.getByRole('checkbox', { name: 'Approve for import' })).toBeChecked()
  await page
    .getByRole('button', {
      name: 'Create Test Cases from approved Ready suggestions',
    })
    .click()

  await expect(page.getByText('1 Test Case created from reviewed AI suggestions.', { exact: true })).toBeVisible()

  await navigateTo(page, 'Test Cases')
  const importedAiTestCase = page.getByRole('article', {
    name: 'Checkout approves valid card from AI',
  })
  await expect(
    page.getByRole('heading', {
      name: 'Checkout approves valid card from AI',
    }),
  ).toBeVisible()
  await expect(importedAiTestCase.getByText('Not Run')).toBeVisible()
  await expect(importedAiTestCase.getByText('3 steps')).toBeVisible()
  await importedAiTestCase.getByRole('button', { name: 'Expand' }).click()
  await expect(importedAiTestCase.getByText('Open checkout.')).toBeVisible()
  await expect(
    importedAiTestCase.getByText('Payment authorization is approved.'),
  ).toBeVisible()

  await page.reload()
  await navigateTo(page, 'Test Cases')
  const persistedAiTestCase = page.getByRole('article', {
    name: 'Checkout approves valid card from AI',
  })
  await expect(
    page.getByRole('heading', {
      name: 'Checkout approves valid card from AI',
    }),
  ).toBeVisible()
  await expect(persistedAiTestCase.getByText('3 steps')).toBeVisible()
})

type CoveragePlannerCatalogSection = {
  sectionId: string
  stableKey: string
  ordinal: number
  title: string
  path: string[]
  startLine: number
  endLine: number
  characterCount: number
  visibility: 'full' | 'partial'
  preview: string
}

type CoveragePlannerCatalog = {
  available: boolean
  sectionSchemaVersion: string
  sectionerVersion: string
  sectionSetFingerprint: string
  totalSectionCount: number
  visibleSectionCount: number
  omittedSectionCount: number
  sections: CoveragePlannerCatalogSection[]
}

type CoveragePlannerRequest = Record<string, unknown> & {
  sourceSections: CoveragePlannerCatalog
}

type CoverageProviderSectionRef = {
  sectionId: string
  stableKey: string
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readCoveragePlannerRequest(value: unknown): CoveragePlannerRequest {
  if (
    !isObjectRecord(value) ||
    !isObjectRecord(value.sourceSections) ||
    !Array.isArray(value.sourceSections.sections)
  ) {
    throw new Error('Coverage planner request did not include a section catalog.')
  }

  return value as CoveragePlannerRequest
}

function requireCatalogSection(
  catalog: CoveragePlannerCatalog,
  title: string,
) {
  const section = catalog.sections.find((candidate) => candidate.title === title)

  if (!section) {
    throw new Error(`Coverage planner catalog did not include ${title}.`)
  }

  return section
}

function toProviderSectionRef(
  section: CoveragePlannerCatalogSection,
): CoverageProviderSectionRef {
  return {
    sectionId: section.sectionId,
    stableKey: section.stableKey,
  }
}

function createSingleAreaProviderPlan({
  areaName,
  evidence,
  section,
  includeSecondaryRefSurfaces = false,
}: {
  areaName: string
  evidence: string
  section: CoveragePlannerCatalogSection | null
  includeSecondaryRefSurfaces?: boolean
}) {
  const refs = section ? [toProviderSectionRef(section)] : []

  return {
    schemaVersion: 'ai-coverage-plan-json-v2',
    coverageAreas: [
      {
        name: areaName,
        summary: `Coverage for ${areaName.toLowerCase()}.`,
        behaviors: [evidence],
        risks: ['The source-backed behavior may regress.'],
        evidence: [evidence],
        ambiguities: [],
        generationReadiness: 'source_backed',
        sourceSectionRefs: refs,
      },
    ],
    actors: ['QA user'],
    states: ['Ready'],
    inputs: [],
    failureModes: [],
    integrationRisks: [],
    permissionsSecurity: [],
    dataPersistenceRules: [],
    ambiguities: includeSecondaryRefSurfaces
      ? [
          {
            question: 'Does the saved location still match?',
            whyItMatters: 'Stale source locations must never be rendered.',
            severity: 'Medium',
            sourceSectionRefs: refs,
          },
        ]
      : [],
    nextGenerationAreas: includeSecondaryRefSurfaces
      ? [
          {
            title: 'Follow-up source coverage',
            rationale: 'The same source location informs follow-up coverage.',
            priority: 'Medium',
            relatedAreaNames: [areaName],
            suggestedTestCount: 1,
            sourceSectionRefs: refs,
          },
        ]
      : [],
    warnings: [],
  }
}

async function mockSingleAreaCoveragePlan(
  page: Page,
  options: {
    areaName: string
    evidence: string
    sectionTitle?: string
    includeRefs: boolean
    includeSecondaryRefSurfaces?: boolean
  },
) {
  const requests: CoveragePlannerRequest[] = []
  const providerRefs: CoverageProviderSectionRef[] = []

  await page.route('**/api/ai/coverage-plan', async (route) => {
    const request = readCoveragePlannerRequest(route.request().postDataJSON())
    const section = options.includeRefs
      ? options.sectionTitle
        ? requireCatalogSection(request.sourceSections, options.sectionTitle)
        : request.sourceSections.sections[0] ?? null
      : null
    const coveragePlan = createSingleAreaProviderPlan({
      areaName: options.areaName,
      evidence: options.evidence,
      section,
      includeSecondaryRefSurfaces: options.includeSecondaryRefSurfaces,
    })

    requests.push(request)
    providerRefs.push(
      ...coveragePlan.coverageAreas.flatMap((area) => area.sourceSectionRefs),
      ...coveragePlan.ambiguities.flatMap(
        (ambiguity) => ambiguity.sourceSectionRefs,
      ),
      ...coveragePlan.nextGenerationAreas.flatMap(
        (area) => area.sourceSectionRefs,
      ),
    )

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        coveragePlan,
        warnings: [],
      }),
    })
  })

  return { requests, providerRefs }
}

async function mockEmptyAreaSuggestionBackend(page: Page) {
  const requests: Record<string, unknown>[] = []

  await page.route('**/api/ai/coverage-area-suggestions', async (route) => {
    const request = route.request().postDataJSON() as Record<string, unknown>
    const selectedArea = isObjectRecord(request.selectedArea)
      ? request.selectedArea
      : {}
    const areaName =
      typeof selectedArea.name === 'string' ? selectedArea.name : 'Selected area'
    const areaSummary =
      typeof selectedArea.summary === 'string'
        ? selectedArea.summary
        : 'Selected area summary.'
    const generationReadiness =
      selectedArea.generationReadiness === 'source_backed' ||
      selectedArea.generationReadiness === 'needs_review' ||
      selectedArea.generationReadiness === 'blocked_by_ambiguity'
        ? selectedArea.generationReadiness
        : 'needs_review'
    const evidence = Array.isArray(selectedArea.evidence)
      ? selectedArea.evidence.filter(
          (item): item is string => typeof item === 'string',
        )
      : []

    requests.push(request)

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        areaSuggestionResult: {
          schemaVersion: 'ai-coverage-area-suggestions-json-v1',
          sourceScope: {
            qaSourceId:
              typeof request.qaSourceId === 'string'
                ? request.qaSourceId
                : 'source-1',
            visibleSourceOnly: true,
            sourceTruncated: request.truncated === true,
            analysisScope: 'visible_source_only',
          },
          areaScope: {
            name: areaName,
            summary: areaSummary,
            evidence,
            generationReadiness,
          },
          testCaseSuggestions: [],
          coverageAssessment: {
            coverageLevel: 'None',
            coveredBehaviors: [],
            missingBehaviors: ['No suggestions were requested from the mock.'],
            blockedAmbiguousItems: [],
            suggestedFollowUpCoverage: [],
            stopReason: 'Mocked E2E response intentionally returned no suggestions.',
          },
          warnings: [],
        },
        warnings: [],
      }),
    })
  })

  return requests
}

async function mockReadyAreaSuggestionBackend(
  page: Page,
  options: { title: string; evidence: string },
) {
  const requests: Record<string, unknown>[] = []

  await page.route('**/api/ai/coverage-area-suggestions', async (route) => {
    const request = route.request().postDataJSON() as Record<string, unknown>
    const selectedArea = isObjectRecord(request.selectedArea)
      ? request.selectedArea
      : {}
    const areaName =
      typeof selectedArea.name === 'string' ? selectedArea.name : 'Selected area'
    const areaSummary =
      typeof selectedArea.summary === 'string'
        ? selectedArea.summary
        : 'Selected area summary.'

    requests.push(request)

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        areaSuggestionResult: {
          schemaVersion: 'ai-coverage-area-suggestions-json-v1',
          sourceScope: {
            qaSourceId:
              typeof request.qaSourceId === 'string'
                ? request.qaSourceId
                : 'source-1',
            visibleSourceOnly: true,
            sourceTruncated: request.truncated === true,
            analysisScope: 'visible_source_only',
          },
          areaScope: {
            name: areaName,
            summary: areaSummary,
            evidence: [options.evidence],
            generationReadiness: 'source_backed',
          },
          testCaseSuggestions: [
            {
              status: 'Ready',
              confidence: 'High',
              title: options.title,
              area: areaName,
              priority: 'High',
              type: 'Functional',
              preconditions: 'The source-backed workflow is available.',
              structuredSteps: [
                {
                  action: 'Run the source-backed workflow.',
                  expectedResult: 'The documented behavior completes.',
                },
              ],
              evidence: [options.evidence],
              assumptions: [],
              warnings: [],
            },
          ],
          coverageAssessment: {
            coverageLevel: 'Partial',
            coveredBehaviors: [options.evidence],
            missingBehaviors: [],
            blockedAmbiguousItems: [],
            suggestedFollowUpCoverage: [],
            stopReason: 'Mocked E2E response generated one source-backed suggestion.',
          },
          warnings: [],
        },
        warnings: [],
      }),
    })
  })

  return requests
}
test('renders a catalog-driven v2 coverage plan and restores safe refs after refresh', async ({
  page,
}) => {
  const coverageSourceContent = [
    '# Billing cancellation',
    'Billing owner can cancel an active subscription.',
    '',
    '## Confirmation behavior',
    'Cancellation disables renewal and shows confirmation.',
    '',
    '# Billing permission boundary',
    'Non-owners cannot change billing.',
  ].join('\n')
  let plannerRequest: CoveragePlannerRequest | null = null
  let plannerRequestHeaders: Record<string, string> = {}
  let plannerRequestCount = 0
  let providerPlan: Record<string, unknown> | null = null
  let providerReturnedRefs: CoverageProviderSectionRef[] = []
  let areaBackendRequest: Record<string, unknown> | null = null

  await page.route('**/api/ai/coverage-plan', async (route) => {
    plannerRequestCount += 1
    plannerRequest = readCoveragePlannerRequest(route.request().postDataJSON())
    plannerRequestHeaders = route.request().headers()

    const confirmationSection = requireCatalogSection(
      plannerRequest.sourceSections,
      'Confirmation behavior',
    )
    const permissionSection = requireCatalogSection(
      plannerRequest.sourceSections,
      'Billing permission boundary',
    )
    const confirmationRef = toProviderSectionRef(confirmationSection)
    const permissionRef = toProviderSectionRef(permissionSection)

    providerReturnedRefs = [
      confirmationRef,
      permissionRef,
      permissionRef,
      confirmationRef,
    ]
    providerPlan = {
      schemaVersion: 'ai-coverage-plan-json-v2',
      coverageAreas: [
        {
          name: 'Billing cancellation',
          summary: 'Coverage for cancellation confirmation and access.',
          behaviors: ['Billing owner can cancel an active subscription.'],
          risks: ['Renewal may remain enabled after cancellation.'],
          evidence: ['Billing owner can cancel an active subscription.'],
          ambiguities: [],
          generationReadiness: 'source_backed',
          sourceSectionRefs: [confirmationRef],
        },
        {
          name: 'Billing permission boundary',
          summary: 'Coverage for non-owner billing restrictions.',
          behaviors: ['Non-owners cannot change billing.'],
          risks: ['Unauthorized users may alter billing settings.'],
          evidence: ['Non-owners cannot change billing.'],
          ambiguities: ['Exact denial copy is not finalized.'],
          generationReadiness: 'blocked_by_ambiguity',
          sourceSectionRefs: [permissionRef],
        },
      ],
      actors: ['Billing owner', 'Non-owner'],
      states: ['Active', 'Canceled'],
      inputs: [],
      failureModes: [],
      integrationRisks: [],
      permissionsSecurity: ['Non-owners cannot change billing.'],
      dataPersistenceRules: [],
      ambiguities: [
        {
          question: 'Is non-owner denial copy finalized?',
          whyItMatters:
            'Future generated tests should not assert exact copy yet.',
          severity: 'Medium',
          sourceSectionRefs: [permissionRef],
        },
      ],
      nextGenerationAreas: [
        {
          title: 'Cancellation and permission coverage',
          rationale: 'Billing changes affect access and authorization.',
          priority: 'High',
          relatedAreaNames: ['Billing cancellation'],
          suggestedTestCount: 5,
          sourceSectionRefs: [confirmationRef],
        },
      ],
      warnings: [],
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        coveragePlan: providerPlan,
        warnings: [],
      }),
    })
  })

  await page.route('**/api/ai/coverage-area-suggestions', async (route) => {
    areaBackendRequest = route.request().postDataJSON() as Record<
      string,
      unknown
    >

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        areaSuggestionResult: {
          schemaVersion: 'ai-coverage-area-suggestions-json-v1',
          sourceScope: {
            qaSourceId: 'source-1',
            visibleSourceOnly: true,
            sourceTruncated: false,
            analysisScope: 'visible_source_only',
          },
          areaScope: {
            name: 'Billing cancellation',
            summary: 'Coverage for cancellation confirmation and access.',
            evidence: ['Billing owner can cancel an active subscription.'],
            generationReadiness: 'source_backed',
          },
          testCaseSuggestions: [
            {
              status: 'Ready',
              confidence: 'High',
              title: 'Billing owner cancels active subscription from area',
              area: 'Billing cancellation',
              priority: 'High',
              type: 'Functional',
              preconditions: 'Billing owner has an active subscription.',
              structuredSteps: [
                {
                  action: 'Cancel the active subscription as the billing owner.',
                  expectedResult: 'The subscription is canceled.',
                },
              ],
              evidence: ['Billing owner can cancel an active subscription.'],
              assumptions: [],
              warnings: [],
            },
          ],
          coverageAssessment: {
            coverageLevel: 'Partial',
            coveredBehaviors: [
              'Billing owner cancellation is represented.',
            ],
            missingBehaviors: [
              'Non-owner billing restriction remains follow-up coverage.',
            ],
            blockedAmbiguousItems: [],
            suggestedFollowUpCoverage: [
              'Generate non-owner restriction coverage separately.',
            ],
            stopReason:
              'Generated 1 suggestion. Stopped because additional cases would be duplicate, speculative, unsupported, or low-value.',
          },
          warnings: ['Area coverage assessment is qualitative only.'],
        },
        warnings: ['Backend area warning.'],
      }),
    })
  })

  await createQaSource(page, {
    title: 'E2E Coverage Planner source',
    sourceType: 'LLD',
    status: 'Ready for test design',
    content: coverageSourceContent,
  })

  await navigateTo(page, 'AI Coverage Workspace')
  await page
    .getByLabel('QA Source', { exact: true })
    .selectOption({ label: 'E2E Coverage Planner source' })
  await page.getByRole('button', { name: 'Analyze coverage' }).click()

  expect(plannerRequestCount).toBe(1)
  expect(plannerRequest).not.toBeNull()
  expect(providerPlan).not.toBeNull()

  if (!plannerRequest || !providerPlan) {
    throw new Error('The mocked planner request did not complete.')
  }

  const catalog = plannerRequest.sourceSections
  const confirmationSection = requireCatalogSection(
    catalog,
    'Confirmation behavior',
  )
  const validPairs = new Set(
    catalog.sections.map(
      (section) => `${section.sectionId}\u001f${section.stableKey}`,
    ),
  )

  expect(Object.keys(plannerRequest).sort()).toEqual(
    [
      'content',
      'maxCharacterCount',
      'originalCharacterCount',
      'packedCharacterCount',
      'qaSourceId',
      'requestVersion',
      'responseSchemaVersion',
      'sourceSections',
      'sourceStatus',
      'sourceTitle',
      'sourceType',
      'sourceUpdatedAt',
      'truncated',
    ].sort(),
  )
  expect(plannerRequest).toMatchObject({
    requestVersion: 'v2',
    sourceTitle: 'E2E Coverage Planner source',
    sourceType: 'LLD',
    sourceStatus: 'Ready for test design',
    content: coverageSourceContent,
    responseSchemaVersion: 'ai-coverage-plan-json-v2',
    sourceSections: {
      available: true,
      visibleSectionCount: 3,
      omittedSectionCount: 0,
    },
  })
  expect(catalog.sections).toHaveLength(3)
  expect(catalog.sections.length).toBeLessThanOrEqual(40)
  expect(Buffer.byteLength(JSON.stringify(catalog), 'utf8')).toBeLessThanOrEqual(
    12 * 1024,
  )
  expect(
    Buffer.byteLength(JSON.stringify(plannerRequest), 'utf8'),
  ).toBeLessThanOrEqual(128 * 1024)
  expect(JSON.stringify(catalog)).not.toContain('"content"')
  expect(JSON.stringify(catalog)).not.toContain(coverageSourceContent)
  expect(plannerRequest).not.toHaveProperty('prompt')
  expect(plannerRequest).not.toHaveProperty('responseSchema')
  expect(plannerRequest).not.toHaveProperty('apiKey')
  expect(plannerRequest).not.toHaveProperty('token')
  expect(plannerRequestHeaders.authorization).toBeUndefined()
  expect(plannerRequestHeaders['x-api-key']).toBeUndefined()

  expect(providerPlan).not.toHaveProperty('sourceScope')
  expect(providerPlan).not.toHaveProperty('sectionContext')
  expect(providerPlan).not.toHaveProperty('id')
  expect(JSON.stringify(providerPlan)).not.toContain('"id"')
  for (const ref of providerReturnedRefs) {
    expect(Object.keys(ref).sort()).toEqual(['sectionId', 'stableKey'])
    expect(validPairs).toContain(`${ref.sectionId}\u001f${ref.stableKey}`)
  }

  const cancellationCard = page.getByRole('article', {
    name: 'Billing cancellation',
  })
  const permissionCard = page.getByRole('article', {
    name: 'Billing permission boundary',
  })
  await expect(cancellationCard).toBeVisible()
  await expect(
    cancellationCard.getByText('Source-backed', { exact: true }),
  ).toBeVisible()
  await expect(
    cancellationCard.getByText('Confirmation behavior', { exact: true }),
  ).toBeVisible()
  await expect(
    cancellationCard.getByText(/\d+ section:/),
  ).not.toBeVisible()
  await expect(
    cancellationCard.getByText(/lines \d+/).first(),
  ).not.toBeVisible()
  await expect(
    permissionCard.getByText('Blocked by ambiguity', { exact: true }).first(),
  ).toBeVisible()
  await expect(
    page.getByRole('region', { name: 'Global coverage & suggestions' }),
  ).toBeVisible()
  await expect(
    page.getByRole('button', {
      name: 'Create Test Cases from approved Ready suggestions',
    }),
  ).toBeDisabled()

  await permissionCard.getByRole('button', { name: 'Select area' }).click()
  await expect(
    page.getByRole('button', { name: 'Clarify ambiguity before generation' }),
  ).toBeDisabled()

  await cancellationCard.getByRole('button', { name: 'Select area' }).click()
  const activeAreaCard = page.locator('.coverage-command-card')
  const fullLocationPattern = new RegExp(
    `${confirmationSection.ordinal}\\. Billing cancellation / Confirmation behavior \\(lines ${confirmationSection.startLine}-${confirmationSection.endLine}\\)`,
  )

  await expect(
    activeAreaCard
      .locator('.coverage-section-chip')
      .filter({ hasText: /^Confirmation behavior$/ })
      .first(),
  ).toBeVisible()
  await expect(
    activeAreaCard.getByText(fullLocationPattern).first(),
  ).not.toBeVisible()
  await activeAreaCard
    .locator('summary:visible')
    .filter({ hasText: /^View 1 source location$/ })
    .first()
    .click()
  await expect(
    activeAreaCard.getByText(fullLocationPattern).first(),
  ).toBeVisible()
  await activeAreaCard.getByText('Source scope', { exact: true }).click()
  await expect(
    activeAreaCard.getByText(
      'Sections identify source locations, not coverage completeness or QA approval.',
      { exact: true },
    ),
  ).toBeVisible()

  const persistedCoverageStore = (await page.evaluate(async () => {
    const rawValue = await window.qaReadPersistedCollection(
      'qa-mission-control:ai-coverage-plans:v0.18',
    )

    return rawValue ? JSON.parse(rawValue) : null
  })) as {
    records: Array<{
      plan: {
        sourceScope: { sectionContext: Record<string, unknown> | null }
        coverageAreas: Array<{
          name: string
          sourceSectionRefs: Array<Record<string, unknown>>
        }>
      }
    }>
  } | null
  const persistedPlan = persistedCoverageStore?.records[0]?.plan
  const persistedCancellationRef = persistedPlan?.coverageAreas.find(
    (area) => area.name === 'Billing cancellation',
  )?.sourceSectionRefs[0]

  expect(persistedPlan?.sourceScope.sectionContext).toMatchObject({
    sectionSchemaVersion: catalog.sectionSchemaVersion,
    sectionerVersion: catalog.sectionerVersion,
    visibleSectionCount: catalog.visibleSectionCount,
  })
  expect(
    persistedPlan?.sourceScope.sectionContext?.sectionSetFingerprint,
  ).not.toBe(catalog.sectionSetFingerprint)
  expect(persistedCancellationRef).toMatchObject({
    ordinal: confirmationSection.ordinal,
    title: confirmationSection.title,
    path: confirmationSection.path,
    startLine: confirmationSection.startLine,
    endLine: confirmationSection.endLine,
    visibility: confirmationSection.visibility,
  })
  expect(persistedCancellationRef?.sectionId).not.toBe(
    confirmationSection.sectionId,
  )
  expect(persistedCancellationRef?.stableKey).not.toBe(
    confirmationSection.stableKey,
  )

  await page
    .getByRole('button', { name: 'Generate tests for selected area' })
    .click()

  await expect(
    page.getByRole('heading', {
      name: 'Area suggestions generated for: Billing cancellation',
    }),
  ).toBeVisible()
  await expect(
    page.getByText('Billing owner cancels active subscription from area'),
  ).toBeVisible()
  const areaSuggestionCard = page.getByRole('article', {
    name: 'Billing owner cancels active subscription from area',
  })
  await expect(areaSuggestionCard.getByText('High confidence')).toBeVisible()
  await expect(areaSuggestionCard.getByText('1 step')).toBeVisible()
  await areaSuggestionCard.getByRole('button', { name: 'Review details' }).click()
  await expect(
    page
      .getByRole('region', { name: 'Selected suggestion details' })
      .getByText('Cancel the active subscription as the billing owner.'),
  ).toBeVisible()

  expect(areaBackendRequest).toMatchObject({
    requestVersion: 'v1',
    sourceTitle: 'E2E Coverage Planner source',
    sourceType: 'LLD',
    sourceStatus: 'Ready for test design',
    content: coverageSourceContent,
    responseSchemaVersion: 'ai-coverage-area-suggestions-json-v1',
    selectedArea: {
      name: 'Billing cancellation',
    },
  })
  expect(areaBackendRequest).not.toHaveProperty('testCases')
  expect(areaBackendRequest).not.toHaveProperty('coveragePlan')
  expect(areaBackendRequest).not.toHaveProperty('prompt')
  expect(areaBackendRequest).not.toHaveProperty('responseSchema')
  expect(areaBackendRequest).not.toHaveProperty(
    'selectedArea.sourceSectionRefs',
  )

  await navigateTo(page, 'Test Cases')
  await expect(
    page.getByRole('heading', {
      name: 'Billing owner cancels active subscription from area',
    }),
  ).toHaveCount(0)

  await navigateTo(page, 'AI Coverage Workspace')
  await expect(
    page.getByRole('heading', {
      name: 'Area suggestions generated for: Billing cancellation',
    }),
  ).toBeVisible()
  await page.getByRole('checkbox', { name: 'Approve for import' }).check()
  await page
    .getByRole('button', {
      name: 'Create Test Cases from approved Ready suggestions',
    })
    .click()

  await navigateTo(page, 'Test Cases')
  await expect(
    page.getByRole('heading', {
      name: 'Billing owner cancels active subscription from area',
    }),
  ).toBeVisible()

  await page.reload()
  await navigateTo(page, 'Test Cases')
  await expect(
    page.getByRole('heading', {
      name: 'Billing owner cancels active subscription from area',
    }),
  ).toBeVisible()

  await navigateTo(page, 'AI Coverage Workspace')
  await page
    .getByLabel('QA Source', { exact: true })
    .selectOption({ label: 'E2E Coverage Planner source' })
  await expect(page.getByText(/Saved coverage plan loaded/)).toBeVisible()
  const restoredCancellationCard = page.getByRole('article', {
    name: 'Billing cancellation',
  })
  await expect(
    restoredCancellationCard.getByText('Confirmation behavior', {
      exact: true,
    }),
  ).toBeVisible()
  await restoredCancellationCard
    .getByRole('button', { name: 'Select area' })
    .click()
  await expect(
    page
      .locator('.coverage-command-card .coverage-section-chip')
      .filter({ hasText: /^Confirmation behavior$/ })
      .first(),
  ).toBeVisible()
  await expect(
    page.getByRole('heading', {
      name: 'Area suggestions generated for: Billing cancellation',
    }),
  ).toHaveCount(0)
  await expect(
    page.getByRole('checkbox', { name: 'Approve for import' }),
  ).toHaveCount(0)

  const savedCoveragePlanStorage = await page.evaluate(async () =>
    await window.qaReadPersistedCollection('qa-mission-control:ai-coverage-plans:v0.18'),
  )
  expect(savedCoveragePlanStorage).not.toContain('areaSuggestionResult')
  expect(savedCoveragePlanStorage).not.toContain('selectedAreaSuggestionIds')
  expect(savedCoveragePlanStorage).not.toContain('rawResponse')
  expect(plannerRequestCount).toBe(1)
})

test('loads a saved plan without refs without inventing or blocking them', async ({
  page,
}) => {
  const sourceContent = [
    '# No-ref source heading',
    'The saved source remains usable without section references.',
  ].join('\n')
  const plannerMock = await mockSingleAreaCoveragePlan(page, {
    areaName: 'General readiness',
    evidence: 'The saved source remains usable without section references.',
    includeRefs: false,
  })
  const areaRequests = await mockEmptyAreaSuggestionBackend(page)

  await createQaSource(page, {
    title: 'E2E plan without refs',
    status: 'Ready for test design',
    content: sourceContent,
  })
  await navigateTo(page, 'AI Coverage Workspace')
  await page
    .getByLabel('QA Source', { exact: true })
    .selectOption({ label: 'E2E plan without refs' })
  await page.getByRole('button', { name: 'Analyze coverage' }).click()
  expect(plannerMock.requests).toHaveLength(1)
  expect(plannerMock.providerRefs).toHaveLength(0)
  await expect(page.getByRole('heading', { name: 'Coverage Queue', exact: true })).toBeVisible()

  await page.reload()
  await navigateTo(page, 'AI Coverage Workspace')
  await page
    .getByLabel('QA Source', { exact: true })
    .selectOption({ label: 'E2E plan without refs' })

  await expect(page.getByText(/Saved coverage plan loaded/)).toBeVisible()
  await expect(
    page.getByText(
      'This saved coverage plan has no section references. Re-analyze to add them.',
      { exact: true },
    ),
  ).toBeVisible()
  await expect(page.getByText(/Saved coverage plan is stale/)).toHaveCount(0)
  await expect(page.getByText('View 1 source location')).toHaveCount(0)
  await expect(page.locator('.coverage-section-chip')).toHaveCount(0)

  await page
    .getByRole('article', { name: 'General readiness' })
    .getByRole('button', { name: 'Select area' })
    .click()
  const generateButton = page.getByRole('button', {
    name: 'Generate tests for selected area',
  })
  await expect(generateButton).toBeEnabled()
  await generateButton.click()
  await expect(
    page.getByRole('heading', {
      name: 'Area suggestions generated for: General readiness',
    }),
  ).toBeVisible()
  expect(areaRequests).toHaveLength(1)
  expect(areaRequests[0]).not.toHaveProperty('selectedArea.sourceSectionRefs')
})

test('hides section-index-only drift everywhere while generation stays enabled', async ({
  page,
}) => {
  const sourceContent = [
    '# Stable source section',
    'The stable source behavior remains unchanged.',
    '',
    '## Nested stable section',
    'Nested source behavior remains unchanged.',
  ].join('\n')
  const plannerMock = await mockSingleAreaCoveragePlan(page, {
    areaName: 'Stable source behavior',
    evidence: 'The stable source behavior remains unchanged.',
    sectionTitle: 'Nested stable section',
    includeRefs: true,
    includeSecondaryRefSurfaces: true,
  })
  const areaRequests = await mockEmptyAreaSuggestionBackend(page)
  const staleTitle = 'STALE LOCATION MUST STAY HIDDEN'
  const stalePath = 'STALE PATH MUST STAY HIDDEN'

  await createQaSource(page, {
    title: 'E2E section index drift source',
    status: 'Ready for test design',
    content: sourceContent,
  })
  await navigateTo(page, 'AI Coverage Workspace')
  await page
    .getByLabel('QA Source', { exact: true })
    .selectOption({ label: 'E2E section index drift source' })
  await page.getByRole('button', { name: 'Analyze coverage' }).click()
  expect(plannerMock.requests).toHaveLength(1)
  expect(plannerMock.providerRefs.length).toBeGreaterThan(0)
  await expect
    .poll(() =>
      page.evaluate(async () =>
        await window.qaReadPersistedCollection(
          'qa-mission-control:ai-coverage-plans:v0.18',
        ),
      ),
    )
    .not.toBeNull()

  await page.evaluate(
    async ({ staleTitleValue, stalePathValue }) => {
      const storageKey = 'qa-mission-control:ai-coverage-plans:v0.18'
      const rawValue = await window.qaReadPersistedCollection(storageKey)

      if (!rawValue) {
        throw new Error('Expected a saved coverage plan before drift seeding.')
      }

      const store = JSON.parse(rawValue) as {
        records: Array<{
          plan: {
            sourceScope: {
              sectionContext: { sectionSetFingerprint: string } | null
            }
            coverageAreas: Array<{
              sourceSectionRefs: Array<Record<string, unknown>>
            }>
            ambiguities: Array<{
              sourceSectionRefs: Array<Record<string, unknown>>
            }>
            nextGenerationAreas: Array<{
              sourceSectionRefs: Array<Record<string, unknown>>
            }>
          }
        }>
      }
      const plan = store.records[0]?.plan

      if (!plan?.sourceScope.sectionContext) {
        throw new Error('Expected persisted v2 section context before drift.')
      }

      plan.sourceScope.sectionContext.sectionSetFingerprint =
        'section-set-intentional-e2e-drift'

      const allRefGroups = [
        ...plan.coverageAreas.map((area) => area.sourceSectionRefs),
        ...plan.ambiguities.map((ambiguity) => ambiguity.sourceSectionRefs),
        ...plan.nextGenerationAreas.map((area) => area.sourceSectionRefs),
      ]

      for (const refs of allRefGroups) {
        for (const ref of refs) {
          ref.title = staleTitleValue
          ref.path = [stalePathValue]
        }
      }

      await window.qaWritePersistedCollection(storageKey, JSON.stringify(store))
    },
    { staleTitleValue: staleTitle, stalePathValue: stalePath },
  )

  await page.reload()
  await navigateTo(page, 'AI Coverage Workspace')
  await page
    .getByLabel('QA Source', { exact: true })
    .selectOption({ label: 'E2E section index drift source' })

  await expect(page.getByText(/Saved coverage plan loaded/)).toBeVisible()
  await expect(
    page.getByText(
      'Saved source section locations no longer match the current source structure. Re-analyze coverage to refresh them.',
      { exact: true },
    ),
  ).toBeVisible()
  await expect(page.getByText(/Saved coverage plan is stale/)).toHaveCount(0)
  const stableAreaCard = page.getByRole('article', {
    name: 'Stable source behavior',
  })
  await expect(
    stableAreaCard.getByText('Source-backed', { exact: true }),
  ).toBeVisible()
  await expect(page.getByText(staleTitle)).toHaveCount(0)
  await expect(page.getByText(stalePath)).toHaveCount(0)
  await expect(page.locator('.coverage-section-chip')).toHaveCount(0)
  await expect(page.getByText(/View \d+ source location/)).toHaveCount(0)

  await stableAreaCard.getByText('Evidence and ambiguity notes').click()
  await page.getByText('Coverage dimensions', { exact: true }).first().click()
  await stableAreaCard.getByRole('button', { name: 'Select area' }).click()
  await page
    .locator('.coverage-command-card')
    .getByText('Source scope', { exact: true })
    .click()
  await expect(page.getByText(staleTitle)).toHaveCount(0)
  await expect(page.getByText(stalePath)).toHaveCount(0)

  const generateButton = page.getByRole('button', {
    name: 'Generate tests for selected area',
  })
  await expect(generateButton).toBeEnabled()
  await generateButton.click()
  await expect(
    page.getByRole('heading', {
      name: 'Area suggestions generated for: Stable source behavior',
    }),
  ).toBeVisible()
  expect(areaRequests).toHaveLength(1)
  expect(JSON.stringify(areaRequests[0])).not.toContain(staleTitle)
  expect(JSON.stringify(areaRequests[0])).not.toContain(stalePath)
  expect(areaRequests[0]).not.toHaveProperty('selectedArea.sourceSectionRefs')
})

test('invalidates approved results and keeps source drift blocking generation', async ({
  page,
}) => {
  const sourceContent = [
    '# Source freshness',
    'Original source content supports generation.',
  ].join('\n')
  const areaSuggestionTitle = 'Original source revision suggestion'
  const plannerMock = await mockSingleAreaCoveragePlan(page, {
    areaName: 'Source freshness behavior',
    evidence: 'Original source content supports generation.',
    sectionTitle: 'Source freshness',
    includeRefs: true,
  })
  const areaRequests = await mockReadyAreaSuggestionBackend(page, {
    title: areaSuggestionTitle,
    evidence: 'Original source content supports generation.',
  })

  await createQaSource(page, {
    title: 'E2E source content drift',
    status: 'Ready for test design',
    content: sourceContent,
  })
  await navigateTo(page, 'AI Coverage Workspace')
  await page
    .getByLabel('QA Source', { exact: true })
    .selectOption({ label: 'E2E source content drift' })
  await page.getByRole('button', { name: 'Analyze coverage' }).click()
  expect(plannerMock.requests).toHaveLength(1)

  const originalAreaCard = page.getByRole('article', {
    name: 'Source freshness behavior',
  })
  await originalAreaCard.getByRole('button', { name: 'Select area' }).click()
  await page
    .getByRole('button', { name: 'Generate tests for selected area' })
    .click()
  await expect(
    page.getByRole('heading', {
      name: 'Area suggestions generated for: Source freshness behavior',
    }),
  ).toBeVisible()
  await page.getByRole('checkbox', { name: 'Approve for import' }).check()
  await expect(
    page.getByRole('button', {
      name: 'Create Test Cases from approved Ready suggestions',
    }),
  ).toBeEnabled()
  expect(areaRequests).toHaveLength(1)

  await navigateTo(page, 'QA Sources')
  await page
    .getByRole('article', { name: 'E2E source content drift' })
    .getByRole('button', { name: 'Edit' })
    .click()
  const editForm = page.getByRole('form', { name: 'Edit QA Source form' })
  await editForm
    .getByLabel('Source content')
    .fill(`${sourceContent}\nThe saved source changed after analysis.`)
  await editForm.getByRole('button', { name: 'Save changes' }).click()

  await navigateTo(page, 'AI Coverage Workspace')
  await page
    .getByLabel('QA Source', { exact: true })
    .selectOption({ label: 'E2E source content drift' })
  await expect(page.getByText(/Saved coverage plan is stale/)).toBeVisible()
  await expect(
    page.getByRole('heading', {
      name: 'Area suggestions generated for: Source freshness behavior',
    }),
  ).toHaveCount(0)
  await expect(
    page.getByRole('checkbox', { name: 'Approve for import' }),
  ).toHaveCount(0)
  await expect(
    page.getByRole('button', {
      name: 'Create Test Cases from approved Ready suggestions',
    }),
  ).toBeDisabled()

  const staleAreaCard = page.getByRole('article', {
    name: 'Source freshness behavior',
  })
  await staleAreaCard.getByRole('button', { name: 'Select area' }).click()
  await expect(
    page.getByRole('button', { name: 'Generate tests for selected area' }),
  ).toBeDisabled()
  expect(areaRequests).toHaveLength(1)

  await navigateTo(page, 'Test Cases')
  await expect(
    page.getByRole('heading', { name: areaSuggestionTitle }),
  ).toHaveCount(0)
})

test('advanced excerpt opt-in labels a clipped section ref as partial and reveals only visible lines', async ({
  page,
}) => {
  const sourceContent = [
    '# Long visible section',
    'Visible boundary evidence.',
    ...Array.from({ length: 2_000 }, (_, index) =>
      `Visible body line ${index + 1}.`,
    ),
  ].join('\n')
  const plannerMock = await mockSingleAreaCoveragePlan(page, {
    areaName: 'Long source behavior',
    evidence: 'Visible boundary evidence.',
    sectionTitle: 'Long visible section',
    includeRefs: true,
  })

  await createQaSource(page, {
    title: 'E2E partial section source',
    status: 'Ready for test design',
    content: sourceContent,
  })
  await navigateTo(page, 'AI Coverage Workspace')
  await page
    .getByLabel('QA Source', { exact: true })
    .selectOption({ label: 'E2E partial section source' })
  await expect(page.getByRole('button', { name: 'Analyze coverage', exact: true })).toBeDisabled()
  expect(plannerMock.requests).toHaveLength(0)
  await page.getByText('Advanced: bounded excerpt analysis', { exact: true }).click()
  await page.getByRole('checkbox', { name: 'Enable excerpt-only analysis for this source', exact: true }).check()
  await page.getByRole('button', { name: 'Analyze coverage' }).click()

  expect(plannerMock.requests).toHaveLength(1)
  const request = plannerMock.requests[0]
  const partialSection = requireCatalogSection(
    request.sourceSections,
    'Long visible section',
  )
  const fullSourceLineCount = sourceContent.split('\n').length

  expect(request.truncated).toBe(true)
  expect(partialSection.visibility).toBe('partial')
  expect(partialSection.endLine).toBeLessThan(fullSourceLineCount)
  expect(plannerMock.providerRefs).toEqual([
    {
      sectionId: partialSection.sectionId,
      stableKey: partialSection.stableKey,
    },
  ])

  await page
    .getByRole('article', { name: 'Long source behavior' })
    .getByRole('button', { name: 'Select area' })
    .click()
  const activeAreaCard = page.locator('.coverage-command-card')
  const visibleRangePattern = new RegExp(
    `${partialSection.ordinal}\\. Long visible section \\(visible lines ${partialSection.startLine}-${partialSection.endLine}\\)`,
  )

  await expect(
    activeAreaCard.getByText(/Partial source location$/).first(),
  ).toBeVisible()
  await expect(
    activeAreaCard.getByText(visibleRangePattern).first(),
  ).not.toBeVisible()
  await activeAreaCard
    .locator('summary:visible')
    .filter({ hasText: /^View 1 source location$/ })
    .first()
    .click()
  await expect(
    activeAreaCard.getByText(visibleRangePattern).first(),
  ).toBeVisible()
  await expect(
    activeAreaCard.getByText(
      new RegExp(`lines ${partialSection.startLine}-${fullSourceLineCount}`),
    ),
  ).toHaveCount(0)
})

test('advanced excerpt opt-in omits an unseen mid-heading identity from the truncated catalog', async ({
  page,
}) => {
  const visibleBase = [
    '# Public section',
    'Public behavior is visible to the provider.',
    '',
  ].join('\n')
  const incompleteHeadingPrefix = '\n# PRIVATE_'
  const padding = 'x'.repeat(
    24_000 - visibleBase.length - incompleteHeadingPrefix.length,
  )
  const sourceContent = `${visibleBase}${padding}${incompleteHeadingPrefix}UNSEEN_HEADING_SUFFIX\nPrivate body must remain outside the packed source.`
  const plannerMock = await mockSingleAreaCoveragePlan(page, {
    areaName: 'Public source behavior',
    evidence: 'Public behavior is visible to the provider.',
    includeRefs: false,
  })

  await createQaSource(page, {
    title: 'E2E mid-heading privacy source',
    status: 'Ready for test design',
    content: sourceContent,
  })
  await navigateTo(page, 'AI Coverage Workspace')
  await page
    .getByLabel('QA Source', { exact: true })
    .selectOption({ label: 'E2E mid-heading privacy source' })
  await expect(page.getByRole('button', { name: 'Analyze coverage', exact: true })).toBeDisabled()
  expect(plannerMock.requests).toHaveLength(0)
  await page.getByText('Advanced: bounded excerpt analysis', { exact: true }).click()
  await page.getByRole('checkbox', { name: 'Enable excerpt-only analysis for this source', exact: true }).check()
  await page.getByRole('button', { name: 'Analyze coverage' }).click()

  expect(plannerMock.requests).toHaveLength(1)
  const request = plannerMock.requests[0]
  const serializedCatalog = JSON.stringify(request.sourceSections)

  expect(request.truncated).toBe(true)
  expect(request.packedCharacterCount).toBe(24_000)
  expect(request.originalCharacterCount).toBe(sourceContent.length)
  expect(String(request.content)).toContain('# PRIVATE_')
  expect(String(request.content)).not.toContain('UNSEEN_HEADING_SUFFIX')
  expect(serializedCatalog).not.toContain('PRIVATE_')
  expect(serializedCatalog).not.toContain('UNSEEN_HEADING_SUFFIX')
  expect(
    request.sourceSections.sections.some(
      (section) =>
        section.title.includes('PRIVATE') ||
        section.path.some((segment) => segment.includes('PRIVATE')),
    ),
  ).toBe(false)
})


test('runs a focused suite-filtered execution workspace and persists results', async ({
  page,
}) => {
  await createTestCase(page, {
    title: 'E2E workspace case 2',
    area: 'Checkout',
  })
  await createTestCase(page, {
    title: 'E2E workspace case 1',
    area: 'Authentication',
  })
  await createTestSuite(page, {
    name: 'E2E Execution Workspace Suite',
    type: 'Smoke',
    testCaseNames: ['E2E workspace case 1', 'E2E workspace case 2'],
  })
  await createRelease(page, {
    name: 'Execution Workspace Release',
    version: 'v-workspace-1',
  })

  await openExecutionsForRelease(
    page,
    'Execution Workspace Release',
    'v-workspace-1',
  )
  await page
    .getByLabel('Filter by test suite')
    .selectOption({ label: 'E2E Execution Workspace Suite (Smoke)' })

  await expect(getExecutionCard(page, 'E2E workspace case 1')).toBeVisible()
  await markExecution(page, 'E2E workspace case 1', 'Passed')
  await saveExecutionNotes(page, 'E2E workspace case 1', 'Passed in smoke.')

  const runner = page.getByRole('region', { name: 'Focused Test Case Runner' })

  await runner.getByRole('button', { name: 'Next' }).click()
  await expect(getExecutionCard(page, 'E2E workspace case 2')).toBeVisible()
  await markExecution(page, 'E2E workspace case 2', 'Failed')
  await runner.getByRole('button', { name: 'Previous' }).click()

  await expect(
    getExecutionCard(page, 'E2E workspace case 1').getByLabel(
      'Execution notes',
    ),
  ).toHaveValue('Passed in smoke.')
  await expectSummaryCount(page, 'Passed', '1')
  await expectSummaryCount(page, 'Failed', '1')
  await expect(readinessPanel(page).getByText('At Risk')).toBeVisible()

  await page.reload()
  await openExecutionsForRelease(
    page,
    'Execution Workspace Release',
    'v-workspace-1',
  )
  await page
    .getByLabel('Filter by test suite')
    .selectOption({ label: 'E2E Execution Workspace Suite (Smoke)' })

  await expect(
    getExecutionCard(page, 'E2E workspace case 1').getByLabel(
      'Execution result',
    ),
  ).toHaveValue('Passed')
  await expect(
    getExecutionCard(page, 'E2E workspace case 1').getByLabel(
      'Execution notes',
    ),
  ).toHaveValue('Passed in smoke.')
  await selectExecutionCase(page, 'E2E workspace case 2')
  await expect(
    getExecutionCard(page, 'E2E workspace case 2').getByLabel(
      'Execution result',
    ),
  ).toHaveValue('Failed')
  await expect(readinessPanel(page).getByText('At Risk')).toBeVisible()
})

test('tracks execution results and summary counts for one release', async ({
  page,
}) => {
  await createRelease(page, {
    name: 'Execution Smoke Release',
    version: 'v-e2e-1',
  })
  await createTestCase(page, { title: 'E2E passed case' })
  await createTestCase(page, { title: 'E2E failed case' })
  await createTestCase(page, { title: 'E2E blocked case' })

  await openExecutionsForRelease(page, 'Execution Smoke Release', 'v-e2e-1')
  await markExecution(page, 'E2E passed case', 'Passed')
  await markExecution(page, 'E2E failed case', 'Failed')
  await markExecution(page, 'E2E blocked case', 'Blocked')

  await expectSummaryCount(page, 'Total', '3')
  await expectSummaryCount(page, 'Awaiting run', '0')
  await expectSummaryCount(page, 'Passed', '1')
  await expectSummaryCount(page, 'Failed', '1')
  await expectSummaryCount(page, 'Blocked', '1')
})

test('keeps execution results and notes isolated between releases', async ({
  page,
}) => {
  await createRelease(page, { name: 'Isolation Release 1', version: 'v-iso-1' })
  await createRelease(page, { name: 'Isolation Release 2', version: 'v-iso-2' })
  await createTestCase(page, { title: 'E2E isolated case' })

  await openExecutionsForRelease(page, 'Isolation Release 1', 'v-iso-1')
  await markExecution(page, 'E2E isolated case', 'Passed')
  await saveExecutionNotes(page, 'E2E isolated case', 'Release 1 passed notes.')

  await page
    .getByLabel('Select release')
    .selectOption({ label: 'Isolation Release 2 (v-iso-2)' })

  await expect(
    getExecutionCard(page, 'E2E isolated case').getByLabel('Execution result'),
  ).toHaveValue('Not Run')
  await expect(
    getExecutionCard(page, 'E2E isolated case').getByLabel('Execution notes'),
  ).toHaveValue('')

  await markExecution(page, 'E2E isolated case', 'Failed')

  await page
    .getByLabel('Select release')
    .selectOption({ label: 'Isolation Release 1 (v-iso-1)' })

  await expect(
    getExecutionCard(page, 'E2E isolated case').getByLabel('Execution result'),
  ).toHaveValue('Passed')
  await expect(
    getExecutionCard(page, 'E2E isolated case').getByLabel('Execution notes'),
  ).toHaveValue('Release 1 passed notes.')
})

test('shows readiness changes for ready, blocked, at-risk, and critical bug states', async ({
  page,
}) => {
  await createRelease(page, {
    name: 'Readiness Smoke Release',
    version: 'v-ready-1',
  })
  await createTestCase(page, { title: 'E2E readiness case 1' })
  await createTestCase(page, { title: 'E2E readiness case 2' })

  await openExecutionsForRelease(page, 'Readiness Smoke Release', 'v-ready-1')
  await markExecution(page, 'E2E readiness case 1', 'Passed')
  await markExecution(page, 'E2E readiness case 2', 'Passed')

  await expect(readinessPanel(page).getByText('Ready')).toBeVisible()
  await readinessPanel(page).locator('summary').click()
  await expect(
    readinessPanel(page).getByText(
      'All current test cases passed and no blocking signals are open.',
    ),
  ).toBeVisible()

  await markExecution(page, 'E2E readiness case 2', 'Failed')

  await expect(readinessPanel(page).getByText('At Risk')).toBeVisible()
  await expect(readinessPanel(page).getByText('1 failed test case')).toBeVisible()

  await markExecution(page, 'E2E readiness case 2', 'Not Run')

  await expect(readinessPanel(page).getByText('At Risk')).toBeVisible()
  await expect(readinessPanel(page).getByText('1 test awaiting run')).toBeVisible()

  await createCriticalBug(page, 'E2E critical readiness bug')
  await openExecutionsForRelease(page, 'Readiness Smoke Release', 'v-ready-1')
  await readinessPanel(page).locator('summary').click()

  await expect(readinessPanel(page).getByText('Blocked')).toBeVisible()
  await expect(readinessPanel(page).getByText('1 open Critical bug')).toBeVisible()
})

test('generates a release report preview with markdown copy action', async ({
  page,
}) => {
  await createRelease(page, {
    name: 'Report Smoke Release',
    version: 'v-report-1',
  })
  await createTestCase(page, { title: 'E2E report passed case' })
  await createTestCase(page, { title: 'E2E report failed case' })

  await openExecutionsForRelease(page, 'Report Smoke Release', 'v-report-1')
  await markExecution(page, 'E2E report passed case', 'Passed')
  await markExecution(page, 'E2E report failed case', 'Failed')
  await saveExecutionNotes(page, 'E2E report failed case', 'Report failure notes.')
  await createCriticalBug(page, 'E2E report critical bug')

  await navigateTo(page, 'Release Report')
  await page
    .getByLabel('Select release')
    .selectOption({ label: 'Report Smoke Release (v-report-1)' })

  await expect(page.getByText(/Report Smoke Release v-report-1 targets/)).toBeVisible()
  await expect(page.getByRole('region', { name: 'Calculated Readiness' })).toContainText(
    'Blocked',
  )
  const reportPreview = page.getByRole('region', { name: 'Report Preview' })

  await expect(reportPreview.getByText('E2E report failed case').first()).toBeVisible()
  await expect(reportPreview.getByText('Report failure notes.').first()).toBeVisible()
  await expect(reportPreview.getByText('E2E report critical bug')).toBeVisible()
  await expect(
    page.getByText('Global open quality signals considered for this release readiness.').first(),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Copy Markdown report' }),
  ).toBeVisible()
})

test('persists releases, test cases, executions, notes, and readiness after refresh', async ({
  page,
}) => {
  await createRelease(page, {
    name: 'Persistence Release',
    version: 'v-persist-1',
  })
  await createTestCase(page, { title: 'E2E persisted case 1' })
  await createTestCase(page, { title: 'E2E persisted case 2' })

  await openExecutionsForRelease(page, 'Persistence Release', 'v-persist-1')
  await markExecution(page, 'E2E persisted case 1', 'Passed')
  await saveExecutionNotes(page, 'E2E persisted case 1', 'Persisted notes.')
  await markExecution(page, 'E2E persisted case 2', 'Passed')

  await expect(readinessPanel(page).getByText('Ready')).toBeVisible()

  await page.reload()
  await openExecutionsForRelease(page, 'Persistence Release', 'v-persist-1')

  await selectExecutionCase(page, 'E2E persisted case 1')
  await expect(
    getExecutionCard(page, 'E2E persisted case 1').getByLabel('Execution result'),
  ).toHaveValue('Passed')
  await expect(
    getExecutionCard(page, 'E2E persisted case 1').getByLabel('Execution notes'),
  ).toHaveValue('Persisted notes.')
  await selectExecutionCase(page, 'E2E persisted case 2')
  await expect(
    getExecutionCard(page, 'E2E persisted case 2').getByLabel('Execution result'),
  ).toHaveValue('Passed')
  await expect(readinessPanel(page).getByText('Ready')).toBeVisible()
})

test('imports CSV test cases with Hebrew headers and persists imported rows', async ({
  page,
}) => {
  const csv = [
    'שם בדיקה,מודול,פעולות לביצוע,תוצאות צפויות,עדיפות,סוג בדיקה',
    'E2E imported clean case,Login,Open login page,Login page appears,High,Smoke',
    'E2E imported defaults case,,Run defaulted row,Defaulted row succeeds,,',
    ',Checkout,Pay for order,Payment succeeds,Urgent,Functional',
  ].join('\n')

  await page.getByRole('button', { name: /Import/ }).click()
  await expect(
    page.getByRole('heading', { name: 'Import Test Cases' }),
  ).toBeVisible()
  await page.getByLabel('Upload CSV file').setInputFiles({
    name: 'test-cases-import.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(csv, 'utf-8'),
  })

  await expectSummaryCount(page, 'Ready to import', '1')
  await expectSummaryCount(page, 'Needs attention', '1')
  await expectSummaryCount(page, 'Blocked', '1')
  await expect(
    page.getByRole('heading', { name: 'E2E imported clean case' }),
  ).toBeVisible()
  await expect(
    page.getByText('Area is missing. Will use General.'),
  ).toBeVisible()

  await page
    .getByRole('button', { name: 'Import ready + rows with defaults' })
    .click()
  await expectSummaryCount(page, 'Imported', '2')
  await expectSummaryCount(page, 'Defaulted', '1')
  await expectSummaryCount(page, 'Skipped', '1')

  await page.getByRole('button', { name: 'View imported test cases' }).click()

  await expect(
    page.getByRole('heading', { name: 'E2E imported clean case' }),
  ).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'E2E imported defaults case' }),
  ).toBeVisible()

  await page.reload()
  await navigateTo(page, 'Test Cases')

  await expect(
    page.getByRole('heading', { name: 'E2E imported clean case' }),
  ).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'E2E imported defaults case' }),
  ).toBeVisible()
})

test('creates structured test cases and shows them during execution after refresh', async ({
  page,
}) => {
  await createTestCase(page, {
    title: 'E2E structured checkout case',
    area: 'Checkout',
    preconditions: 'User is signed in and test card data is available.',
    structuredSteps: [
      {
        action: 'Open the checkout page.',
        expectedResult: 'Checkout page is displayed.',
      },
      {
        action: 'Enter valid card details.',
        expectedResult: 'Card details are accepted.',
      },
      {
        action: 'Submit the order.',
        expectedResult: 'Order confirmation is displayed.',
      },
    ],
  })

  const testCaseCard = page.getByRole('article', {
    name: 'E2E structured checkout case',
  })

  await expect(testCaseCard.getByText('3 steps')).toBeVisible()
  await expect(testCaseCard.getByTitle('Preconditions defined')).toBeVisible()
  await expect(
    testCaseCard.getByText('User is signed in and test card data is available.'),
  ).not.toBeVisible()

  await testCaseCard.getByRole('button', { name: 'Expand' }).click()

  await expect(
    testCaseCard.getByText('User is signed in and test card data is available.'),
  ).toBeVisible()
  await expect(testCaseCard.getByText('Open the checkout page.')).toBeVisible()
  await expect(
    testCaseCard.getByText('Order confirmation is displayed.'),
  ).toBeVisible()

  await createRelease(page, {
    name: 'Structured Execution Release',
    version: 'v-structured-1',
  })
  await openExecutionsForRelease(
    page,
    'Structured Execution Release',
    'v-structured-1',
  )

  const card = getExecutionCard(page, 'E2E structured checkout case')

  await expect(
    card.getByText('User is signed in and test card data is available.'),
  ).toBeVisible()
  await expect(card.getByText('Step 1')).toBeVisible()
  await expect(card.getByText('Open the checkout page.')).toBeVisible()
  await expect(card.getByText('Step 2')).toBeVisible()
  await expect(card.getByText('Enter valid card details.')).toBeVisible()
  await expect(card.getByText('Step 3')).toBeVisible()
  await expect(card.getByText('Submit the order.')).toBeVisible()

  await markExecution(page, 'E2E structured checkout case', 'Passed')

  await expectSummaryCount(page, 'Passed', '1')

  await page.reload()
  await openExecutionsForRelease(
    page,
    'Structured Execution Release',
    'v-structured-1',
  )

  await expect(
    getExecutionCard(page, 'E2E structured checkout case').getByLabel(
      'Execution result',
    ),
  ).toHaveValue('Passed')
  await expect(
    getExecutionCard(page, 'E2E structured checkout case').getByText(
      'Order confirmation is displayed.',
    ),
  ).toBeVisible()
})

test('creates structured test cases from Smart Paste and persists them', async ({
  page,
}) => {
  await navigateTo(page, 'Test Cases')
  await page.getByRole('button', { name: 'New test case' }).click()

  const form = page.getByRole('form', { name: 'Create Test Case form' })

  await form.getByLabel('Title').fill('E2E smart pasted login case')
  await form.getByLabel('Area').fill('Authentication')
  await form.getByRole('button', { name: 'Smart Paste steps' }).click()

  const smartPastePanel = page.getByRole('region', {
    name: 'Smart Paste Steps',
  })

  await smartPastePanel.getByLabel('Paste step text').fill(
    [
      '1. Open login page | Login form is displayed',
      '2. Enter valid email | Email is accepted',
      '3. Click Login | Dashboard opens',
    ].join('\n'),
  )
  await smartPastePanel.getByRole('button', { name: 'Preview steps' }).click()

  await expect(smartPastePanel.getByText('3 detected')).toBeVisible()
  await expect(smartPastePanel.getByText('3 complete')).toBeVisible()
  await expect(smartPastePanel.getByText('0 needing review')).toBeVisible()

  await smartPastePanel
    .getByRole('button', { name: 'Replace current steps' })
    .click()
  await form.getByRole('button', { name: 'Create test case' }).click()

  const testCaseCard = page.getByRole('article', {
    name: 'E2E smart pasted login case',
  })

  await expect(testCaseCard.getByText('3 steps')).toBeVisible()
  await testCaseCard.getByRole('button', { name: 'Expand' }).click()

  await expect(testCaseCard.getByText('Open login page')).toBeVisible()
  await expect(testCaseCard.getByText('Email is accepted')).toBeVisible()
  await expect(testCaseCard.getByText('Dashboard opens')).toBeVisible()

  await page.reload()
  await navigateTo(page, 'Test Cases')

  const persistedCard = page.getByRole('article', {
    name: 'E2E smart pasted login case',
  })

  await expect(persistedCard.getByText('3 steps')).toBeVisible()
  await persistedCard.getByRole('button', { name: 'Expand' }).click()
  await expect(persistedCard.getByText('Dashboard opens')).toBeVisible()
})

type CapturedSectionCoverageRequest = {
  requestVersion: string
  sourceIdentity: {
    qaSourceId: string
    qaSourceCreatedAt: string
    qaSourceUpdatedAt: string
    sourceFingerprint: string
  }
  sectionIdentity: {
    sectionId: string
    stableKey: string
    contentFingerprint: string
    sectionSchemaVersion: string
    sectionerVersion: string
  }
  sectionSnapshot: {
    ordinal: number
    title: string
    path: string[]
    startLine: number
    endLine: number
    characterCount: number
  }
  visibleSection: {
    content: string
    packedCharacterCount: number
    truncated: boolean
  }
}

function createSectionCoverageSuccess({
  areaName,
  evidence = [],
}: {
  areaName: string
  evidence?: string[]
}) {
  return {
    ok: true,
    analysis: {
      schemaVersion: 'section-coverage-plan-json-v1',
      coverageAreas: [
        {
          name: areaName,
          summary: 'Review the selected behavior and its observable outcome.',
          behaviors: ['Exercise the selected behavior.'],
          evidence,
          behaviorEvidence: [{ behavior: 'Exercise the selected behavior.', evidence }],
        },
        {
          name: 'Unspecified fallback behavior',
          summary: 'Clarify behavior that is not supported by visible evidence.',
          behaviors: ['Review the missing fallback rule.'],
          evidence: [],
        },
      ],
      actors: ['QA reviewer'],
      states: ['Selected state'],
      inputs: ['Selected input'],
      failureModes: ['Selected failure mode'],
      integrationRisks: ['Selected integration risk'],
      permissionsSecurity: ['Review selected permissions'],
      dataPersistenceConcerns: ['Review selected persistence'],
      ambiguities: [
        {
          question: 'What happens after the selected failure?',
          whyItMatters: 'The visible section does not define recovery.',
          severity: 'high',
        },
      ],
      nextCoverage: [
        {
          title: 'Selected recovery behavior',
          rationale: 'Recovery needs a separate review.',
          priority: 'high',
        },
      ],
      warnings: ['Review the selected section before using this material.'],
    },
    warnings: [],
  }
}

test('guides large-source section review without starting AI implicitly', async ({
  page,
}) => {
  const sourceTitle = 'Large guided review LLD'
  const sourceContent = Array.from({ length: 6 }, (_, index) =>
    [
      `# Workflow ${index + 1}`,
      (`Requirement ${index + 1} stays independently reviewable. `).repeat(90),
    ].join('\n'),
  ).join('\n\n')
  let aiRequestCount = 0

  expect(sourceContent.length).toBeGreaterThan(24_000)

  await page.route('**/api/ai/**', async (route) => {
    aiRequestCount += 1
    await route.abort()
  })

  await createQaSource(page, {
    title: sourceTitle,
    sourceType: 'LLD',
    content: sourceContent,
  })

  const sourceCard = page.getByRole('article', { name: sourceTitle })
  await sourceCard.getByText('Source Structure', { exact: true }).click()

  const guide = sourceCard.getByRole('region', {
    name: 'Large source — guided review',
  })
  const sectionPicker = sourceCard.getByRole('radiogroup', {
    name: `Select one section from ${sourceTitle} for analysis`,
  })

  await expect(guide).toContainText(
    /Analyze Entire Specification processes all [\d,]+ characters/,
  )
  await expect(guide).toContainText(
    'This map is not coverage proof, a coverage percentage, or QA approval.',
  )
  await expect(sectionPicker.getByRole('radio')).toHaveCount(6)

  await guide.getByRole('radio', { name: 'Current', exact: true }).check()
  await expect(guide.getByText('Showing 0 of 6 sections.')).toBeVisible()
  await expect(sectionPicker.getByRole('radio')).toHaveCount(0)
  await expect(
    sourceCard.getByText('No sections match this review filter.'),
  ).toBeVisible()

  await guide.getByRole('radio', { name: 'Needs analysis' }).check()
  await expect(guide.getByText('Showing 6 of 6 sections.')).toBeVisible()
  await expect(sectionPicker.getByRole('radio')).toHaveCount(6)

  await guide.getByRole('button', { name: 'Select next section' }).click()
  await expect(
    sectionPicker.getByRole('radio', { name: /1\. Workflow 1/ }),
  ).toBeChecked()
  await expect(
    sourceCard.getByRole('button', { name: 'Analyze section' }),
  ).toBeVisible()
  expect(aiRequestCount).toBe(0)
})

test('analyzes only the keyboard-selected section and restores it without another request', async ({
  page,
}) => {
  const sourceTitle = 'Section Analysis LLD'
  const previousText = 'Previous section content must stay private.'
  const selectedEvidence =
    'Selected behavior requires review. Hebrew verification: חשבון נעול.'
  const followingText = 'Following section content must stay private.'
  const sourceContent = [
    '# Before',
    previousText,
    '',
    '# Selected',
    selectedEvidence,
    '',
    '# After',
    followingText,
  ].join('\n')
  let requestCount = 0
  let capturedRequest: CapturedSectionCoverageRequest | null = null
  let capturedHeaders: Record<string, string> = {}

  await page.route('**/api/ai/section-coverage-plan', async (route) => {
    requestCount += 1
    capturedRequest =
      route.request().postDataJSON() as CapturedSectionCoverageRequest
    capturedHeaders = route.request().headers()

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(
        createSectionCoverageSuccess({
          areaName: 'Selected behavior',
          evidence: [selectedEvidence],
        }),
      ),
    })
  })

  await createQaSource(page, {
    title: sourceTitle,
    sourceType: 'LLD',
    content: sourceContent,
  })

  const sourceCard = page.getByRole('article', { name: sourceTitle })
  await sourceCard.getByText('Source Structure', { exact: true }).click()

  const radioGroup = sourceCard.getByRole('radiogroup', {
    name: 'Select one section from Section Analysis LLD for analysis',
  })
  const radios = radioGroup.getByRole('radio')

  await radios.nth(0).focus()
  await page.keyboard.press('ArrowDown')
  await expect(radios.nth(1)).toBeChecked()
  expect(requestCount).toBe(0)

  const testCaseStorageBefore = await page.evaluate(async () =>
    await window.qaReadPersistedCollection('qa-mission-control:test-cases:v0.1'),
  )

  await sourceCard.getByRole('button', { name: 'Analyze section' }).click()

  const analysisPanel = sourceCard.getByRole('region', {
    name: 'Section coverage analysis for Selected',
  })

  await expect(
    analysisPanel.getByRole('heading', { name: 'Current section analysis' }),
  ).toBeVisible()
  expect(requestCount).toBe(1)
  expect(capturedRequest).not.toBeNull()

  const persistedSource = await page.evaluate(async () => {
    const rawValue = await window.qaReadPersistedCollection(
      'qa-mission-control:qa-sources:v0.12',
    )
    return JSON.parse(rawValue ?? '[]')[0] as {
      id: string
      createdAt: string
      updatedAt: string
    }
  })
  const request = capturedRequest as CapturedSectionCoverageRequest
  const serializedRequest = JSON.stringify(request).toLowerCase()

  expect(Object.keys(request).sort()).toEqual(
    [
      'requestVersion',
      'sectionIdentity',
      'sectionSnapshot',
      'sourceIdentity',
      'visibleSection',
    ].sort(),
  )
  expect(request.requestVersion).toBe('v1')
  expect(request.sourceIdentity.qaSourceId).toBe(persistedSource.id)
  expect(request.sourceIdentity.qaSourceCreatedAt).toBe(
    persistedSource.createdAt,
  )
  expect(request.sourceIdentity.qaSourceUpdatedAt).toBe(
    persistedSource.updatedAt,
  )
  expect(request.sectionSnapshot.ordinal).toBe(2)
  expect(request.sectionSnapshot.title).toBe('Selected')
  expect(request.sectionSnapshot.path).toEqual(['Selected'])
  expect(request.sectionIdentity.sectionId).toBeTruthy()
  expect(request.sectionIdentity.stableKey).toBeTruthy()
  expect(request.visibleSection.content).toContain(selectedEvidence)
  expect(request.visibleSection.content).not.toContain(previousText)
  expect(request.visibleSection.content).not.toContain(followingText)
  expect(request.visibleSection.content).not.toBe(sourceContent)
  expect(request.visibleSection.packedCharacterCount).toBe(
    request.visibleSection.content.length,
  )
  expect(request.visibleSection.packedCharacterCount).toBeLessThanOrEqual(
    24_000,
  )
  expect(serializedRequest).not.toContain('"prompt"')
  expect(serializedRequest).not.toContain('"messages"')
  expect(serializedRequest).not.toContain('"responseschema"')
  expect(serializedRequest).not.toContain('"apikey"')
  expect(capturedHeaders.authorization).toBeUndefined()

  await expect(analysisPanel.getByText('Evidence linked for each behavior')).toBeVisible()
  await expect(analysisPanel.getByText('No validated behavior evidence', { exact: true })).toBeVisible()
  await expect(analysisPanel.getByText('QA reviewer')).toBeVisible()
  await expect(analysisPanel.getByText('Selected state')).toBeVisible()
  await expect(analysisPanel.getByText('Selected input')).toBeVisible()
  await expect(analysisPanel.getByText('Selected failure mode')).toBeVisible()
  await expect(
    analysisPanel.getByText('Selected integration risk'),
  ).toBeVisible()
  await analysisPanel
    .getByText('Behaviors and validated evidence')
    .first()
    .click()
  await expect(analysisPanel.getByText(selectedEvidence).first()).toBeVisible()
  await analysisPanel.getByText('Ambiguities and next coverage').click()
  await expect(
    analysisPanel.getByText('What happens after the selected failure?'),
  ).toBeVisible()
  await expect(
    analysisPanel.getByText('Selected recovery behavior'),
  ).toBeVisible()
  await expect(
    analysisPanel.getByText(
      /Only the selected section’s visible source text, up to 24,000 characters/,
    ),
  ).toBeVisible()
  await expect(
    analysisPanel.getByText(
      'Section analysis is review material, not coverage proof or QA approval.',
    ),
  ).toBeVisible()
  await expect(
    analysisPanel.getByRole('button', {
      name: /approve|import|test case|readiness/i,
    }),
  ).toHaveCount(0)
  await expect(analysisPanel.getByText(/readiness/i)).toHaveCount(0)
  await expect(analysisPanel.getByText(/coverage percentage/i)).toHaveCount(0)

  const testCaseStorageAfter = await page.evaluate(async () =>
    await window.qaReadPersistedCollection('qa-mission-control:test-cases:v0.1'),
  )
  expect(testCaseStorageAfter).toBe(testCaseStorageBefore)

  await page.reload()
  await navigateTo(page, 'QA Sources')

  const restoredCard = page.getByRole('article', { name: sourceTitle })
  await restoredCard.getByText('Source Structure', { exact: true }).click()
  await restoredCard
    .getByRole('radio', { name: /2\. Selected/ })
    .check()

  await expect(
    restoredCard.getByRole('heading', {
      name: 'Current section analysis',
    }),
  ).toBeVisible()
  const restoredPanel = restoredCard.getByRole('region', {
    name: 'Section coverage analysis for Selected',
  })
  await expect(
    restoredPanel.getByText('Selected behavior', { exact: true }),
  ).toBeVisible()
  expect(requestCount).toBe(1)
})

test('keeps saved section work stale and rejects late edit and selection responses', async ({
  page,
}) => {
  const sourceTitle = 'Section Race LLD'
  const selectedEvidence =
    'Selected behavior requires review. Hebrew: בדיקה.'
  const originalContent = [
    '# Before',
    'Original previous section.',
    '',
    '# Selected',
    selectedEvidence,
    '',
    '# After',
    'Original following section.',
  ].join('\n')
  const unrelatedEditContent = originalContent.replace(
    'Original following section.',
    'Changed following section elsewhere.',
  )
  const selectedEditContent = unrelatedEditContent.replace(
    selectedEvidence,
    'Changed selected behavior requires a new analysis.',
  )
  let requestCount = 0
  let startSecondRequest!: () => void
  let releaseSecondRequest!: () => void
  let finishSecondRequest!: () => void
  let startThirdRequest!: () => void
  let releaseThirdRequest!: () => void
  let finishThirdRequest!: () => void
  const secondRequestStarted = new Promise<void>((resolve) => {
    startSecondRequest = resolve
  })
  const secondRequestGate = new Promise<void>((resolve) => {
    releaseSecondRequest = resolve
  })
  const secondRequestFinished = new Promise<void>((resolve) => {
    finishSecondRequest = resolve
  })
  const thirdRequestStarted = new Promise<void>((resolve) => {
    startThirdRequest = resolve
  })
  const thirdRequestGate = new Promise<void>((resolve) => {
    releaseThirdRequest = resolve
  })
  const thirdRequestFinished = new Promise<void>((resolve) => {
    finishThirdRequest = resolve
  })

  await page.route('**/api/ai/section-coverage-plan', async (route) => {
    requestCount += 1

    if (requestCount === 1) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(
          createSectionCoverageSuccess({
            areaName: 'Baseline selected behavior',
            evidence: [selectedEvidence],
          }),
        ),
      })
      return
    }

    if (requestCount === 2) {
      startSecondRequest()
      await secondRequestGate

      try {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(
            createSectionCoverageSuccess({
              areaName: 'Late stale response',
            }),
          ),
        })
      } catch {
        // The browser may already have honored the AbortSignal.
      } finally {
        finishSecondRequest()
      }
      return
    }

    if (requestCount === 3) {
      startThirdRequest()
      await thirdRequestGate

      try {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(
            createSectionCoverageSuccess({
              areaName: 'Late switched response',
            }),
          ),
        })
      } catch {
        // The browser may already have honored the AbortSignal.
      } finally {
        finishThirdRequest()
      }
      return
    }

    await route.abort()
  })

  await createQaSource(page, {
    title: sourceTitle,
    sourceType: 'LLD',
    content: originalContent,
  })

  const sourceCard = page.getByRole('article', { name: sourceTitle })
  await sourceCard.getByText('Source Structure', { exact: true }).click()
  await sourceCard
    .getByRole('radio', { name: /2\. Selected/ })
    .check()
  await sourceCard.getByRole('button', { name: 'Analyze section' }).click()

  await expect(
    sourceCard.getByRole('heading', { name: 'Current section analysis' }),
  ).toBeVisible()
  expect(requestCount).toBe(1)

  const baselineStoredPlan = await page.evaluate(async () =>
    await window.qaReadPersistedCollection(
      'qa-mission-control:ai-section-coverage-plans:v0.21',
    ),
  )
  expect(baselineStoredPlan).not.toBeNull()

  await sourceCard
    .getByRole('button', { name: 'Re-analyze section' })
    .click()
  await secondRequestStarted

  await sourceCard.getByRole('button', { name: 'Edit' }).click()
  const unrelatedEditForm = page.getByRole('form', {
    name: 'Edit QA Source form',
  })
  await unrelatedEditForm
    .getByLabel('Source content')
    .fill(unrelatedEditContent)
  await unrelatedEditForm
    .getByRole('button', { name: 'Save changes' })
    .click()

  releaseSecondRequest()
  await secondRequestFinished

  await expect(
    sourceCard.getByText(
      /This saved analysis reflects an earlier source revision/,
    ),
  ).toBeVisible()
  await expect(
    sourceCard.getByRole('radio', { name: /2\. Selected.*Stale/ }),
  ).toBeChecked()
  await expect(sourceCard.getByText('Late stale response')).toHaveCount(0)
  expect(
    await page.evaluate(async () =>
      await window.qaReadPersistedCollection(
        'qa-mission-control:ai-section-coverage-plans:v0.21',
      ),
    ),
  ).toBe(baselineStoredPlan)
  expect(requestCount).toBe(2)

  await sourceCard.getByRole('button', { name: 'Edit' }).click()
  const selectedEditForm = page.getByRole('form', {
    name: 'Edit QA Source form',
  })
  await selectedEditForm
    .getByLabel('Source content')
    .fill(selectedEditContent)
  await selectedEditForm
    .getByRole('button', { name: 'Save changes' })
    .click()

  const sourceStructure = sourceCard.locator('details.source-structure-panel')
  if ((await sourceStructure.getAttribute('open')) === null) {
    await sourceCard.getByText('Source Structure', { exact: true }).click()
  }

  const changedSelectedRadio = sourceCard.getByRole('radio', {
    name: /2\. Selected.*Not analyzed/,
  })

  await expect(changedSelectedRadio).toBeVisible()
  await expect(
    sourceCard.getByRole('heading', { name: 'Current section analysis' }),
  ).toHaveCount(0)
  await expect(
    sourceCard.getByRole('heading', { name: 'Saved section analysis' }),
  ).toHaveCount(0)

  await changedSelectedRadio.check()
  await sourceCard.getByRole('button', { name: 'Analyze section' }).click()
  await thirdRequestStarted

  const afterRadio = sourceCard.getByRole('radio', {
    name: /3\. After.*Not analyzed/,
  })
  await afterRadio.check()
  await expect(afterRadio).toBeChecked()

  releaseThirdRequest()
  await thirdRequestFinished

  await expect(
    sourceCard.getByRole('region', {
      name: 'Section coverage analysis for After',
    }),
  ).toBeVisible()
  await expect(sourceCard.getByText('Late switched response')).toHaveCount(0)
  await expect(
    sourceCard.getByRole('button', { name: 'Analyze section' }),
  ).toBeVisible()
  expect(requestCount).toBe(3)
  expect(
    await page.evaluate(async () =>
      await window.qaReadPersistedCollection(
        'qa-mission-control:ai-section-coverage-plans:v0.21',
      ),
    ),
  ).toBe(baselineStoredPlan)
  expect(
    await page.evaluate(async () =>
      await window.qaReadPersistedCollection('qa-mission-control:test-cases:v0.1'),
    ),
  ).toBeNull()

  const afterPanel = sourceCard.getByRole('region', {
    name: 'Section coverage analysis for After',
  })
  await expect(
    afterPanel.getByRole('button', {
      name: /approve|import|test case|readiness/i,
    }),
  ).toHaveCount(0)
})

type CapturedCoveragePlanMergeRequest = {
  requestVersion: string
  findings: Array<{
    alias: string
    sectionAlias: string
    kind: string
    text: string
    context: string
  }>
  candidatePairs: Array<{
    pairAlias: string
    leftAlias: string
    rightAlias: string
  }>
}

function createMergeSectionCoverageSuccess(sectionTitle: 'Alpha' | 'Beta') {
  const isAlpha = sectionTitle === 'Alpha'
  const spelling = isAlpha ? 'authorization' : 'authorisation'
  const rejection = isAlpha ? 'rejection' : 'rejections'
  const authorizeBehavior = isAlpha
    ? 'Authorize the payment request.'
    : 'Authorise the payment request.'
  const rejectBehavior = isAlpha
    ? 'Reject the payment request.'
    : 'Rejects the payment request.'
  const evidence = isAlpha
    ? 'Alpha private requirement covers payment authorization and payment rejection.'
    : 'Beta private requirement covers payment authorisation and payment rejections.'

  return {
    ok: true,
    analysis: {
      schemaVersion: 'section-coverage-plan-json-v1',
      coverageAreas: [
        {
          name: `Payment ${spelling}`,
          summary: 'Review the payment access decision.',
          behaviors: [authorizeBehavior],
          evidence: [evidence],
        },
        {
          name: `Payment ${rejection}`,
          summary: 'Review the payment rejection decision.',
          behaviors: [rejectBehavior],
          evidence: [evidence],
        },
      ],
      actors: ['QA reviewer'],
      states: ['Payment pending'],
      inputs: ['Payment request'],
      failureModes: ['Payment provider unavailable'],
      integrationRisks: [],
      permissionsSecurity: [],
      dataPersistenceConcerns: ['Persist the payment decision'],
      ambiguities: [],
      nextCoverage: [],
      warnings: ['Review this section analysis before merging.'],
    },
    warnings: [],
  }
}

async function analyzeFirstTwoMergeSections(page: Page, sourceTitle: string) {
  const sourceCard = page.getByRole('article', { name: sourceTitle })
  const sourceStructure = sourceCard.locator('details.source-structure-panel')

  if ((await sourceStructure.getAttribute('open')) === null) {
    await sourceCard.getByText('Source Structure', { exact: true }).click()
  }

  for (const [ordinal, sectionTitle] of [
    [1, 'Alpha'],
    [2, 'Beta'],
  ] as const) {
    await sourceCard
      .getByRole('radio', { name: new RegExp(`${ordinal}\\. ${sectionTitle}`) })
      .check()
    await sourceCard.getByRole('button', { name: 'Analyze section' }).click()
    await expect(
      sourceCard
        .getByRole('region', {
          name: `Section coverage analysis for ${sectionTitle}`,
        })
        .getByRole('heading', { name: 'Current section analysis' }),
    ).toBeVisible()
  }

  return sourceCard
}

function createMergeClassificationResponse(
  request: CapturedCoveragePlanMergeRequest,
) {
  return {
    ok: true,
    classification: {
      schemaVersion: 'coverage-plan-merge-decisions-json-v1',
      decisions: request.candidatePairs.map((pair, index) => ({
        pairAlias: pair.pairAlias,
        relation: index % 2 === 0 ? 'likely_overlap' : 'conflict',
        reasonCode: index % 2 === 0 ? 'same_intent' : 'contradictory_claim',
      })),
    },
  }
}

test('builds, reviews, explicitly saves, and restores a merged Global Coverage Plan', async ({
  page,
}) => {
  const sourceTitle = 'Global Merge Happy LLD'
  const sourceContent = [
    '# Alpha',
    'Alpha private requirement covers payment authorization and payment rejection.',
    '',
    '# Beta',
    'Beta private requirement covers payment authorisation and payment rejections.',
    '',
    '# Unreviewed',
    'This section remains intentionally unanalyzed.',
  ].join('\n')
  let sectionRequestCount = 0
  let mergeRequestCount = 0
  let capturedMergeRequest: CapturedCoveragePlanMergeRequest | null = null
  let capturedMergeHeaders: Record<string, string> = {}

  await page.route('**/api/ai/section-coverage-plan', async (route) => {
    sectionRequestCount += 1
    const request = route.request().postDataJSON() as CapturedSectionCoverageRequest
    const sectionTitle = request.sectionSnapshot.title
    expect(sectionTitle === 'Alpha' || sectionTitle === 'Beta').toBe(true)

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(
        createMergeSectionCoverageSuccess(sectionTitle as 'Alpha' | 'Beta'),
      ),
    })
  })

  await page.route('**/api/ai/coverage-plan-merge', async (route) => {
    mergeRequestCount += 1
    capturedMergeRequest =
      route.request().postDataJSON() as CapturedCoveragePlanMergeRequest
    capturedMergeHeaders = route.request().headers()

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(
        createMergeClassificationResponse(capturedMergeRequest),
      ),
    })
  })

  await createQaSource(page, {
    title: sourceTitle,
    sourceType: 'LLD',
    status: 'Ready for test design',
    content: sourceContent,
  })
  const sourceCard = await analyzeFirstTwoMergeSections(page, sourceTitle)
  expect(sectionRequestCount).toBe(2)

  const beforeMerge = await page.evaluate(async () => ({
    sectionPlans: await window.qaReadPersistedCollection(
      'qa-mission-control:ai-section-coverage-plans:v0.21',
    ),
    testCases: await window.qaReadPersistedCollection(
      'qa-mission-control:test-cases:v0.1',
    ),
    sectionRecords: JSON.parse(
      await window.qaReadPersistedCollection(
        'qa-mission-control:ai-section-coverage-plans:v0.21',
      ) ?? '{}',
    ).records as Array<{
      id: string
      sectionIdentity: { sectionId: string }
    }>,
    sourceId: (
      JSON.parse(
        await window.qaReadPersistedCollection(
          'qa-mission-control:qa-sources:v0.12',
        ) ?? '[]',
      ) as Array<{ id: string }>
    )[0]?.id,
  }))

  await sourceCard
    .getByRole('button', { name: 'Select analyses to merge' })
    .click()
  const mergeCheckboxes = sourceCard.getByRole('checkbox')
  await expect(mergeCheckboxes).toHaveCount(3)
  await expect(mergeCheckboxes.nth(0)).not.toBeChecked()
  await expect(mergeCheckboxes.nth(1)).not.toBeChecked()
  await expect(mergeCheckboxes.nth(2)).toBeDisabled()
  expect(mergeRequestCount).toBe(0)

  await mergeCheckboxes.nth(0).check()
  await mergeCheckboxes.nth(1).check()
  await expect(sourceCard.getByText('2 of 8 selected')).toBeVisible()
  expect(mergeRequestCount).toBe(0)
  await sourceCard
    .getByRole('button', { name: 'Build global coverage plan' })
    .click()

  await expect(
    page.getByRole('heading', {
      name: 'Unsaved Global Coverage Plan candidate',
    }),
  ).toBeVisible()
  expect(mergeRequestCount).toBe(1)
  expect(capturedMergeRequest).not.toBeNull()
  const mergeRequest =
    capturedMergeRequest as CapturedCoveragePlanMergeRequest
  expect(Object.keys(mergeRequest).sort()).toEqual(
    ['requestVersion', 'findings', 'candidatePairs'].sort(),
  )
  expect(mergeRequest.requestVersion).toBe('v1')
  expect(mergeRequest.findings.length).toBeGreaterThan(1)
  expect(mergeRequest.candidatePairs.length).toBeGreaterThan(1)
  expect(Object.keys(mergeRequest.findings[0]).sort()).toEqual(
    ['alias', 'sectionAlias', 'kind', 'text', 'context'].sort(),
  )
  expect(Object.keys(mergeRequest.candidatePairs[0]).sort()).toEqual(
    ['pairAlias', 'leftAlias', 'rightAlias'].sort(),
  )
  const serializedRequest = JSON.stringify(mergeRequest).toLowerCase()
  expect(serializedRequest).not.toContain(sourceContent.toLowerCase())
  expect(serializedRequest).not.toContain(sourceTitle.toLowerCase())
  expect(serializedRequest).not.toContain(beforeMerge.sourceId.toLowerCase())
  for (const record of beforeMerge.sectionRecords) {
    expect(serializedRequest).not.toContain(record.id.toLowerCase())
    expect(serializedRequest).not.toContain(
      record.sectionIdentity.sectionId.toLowerCase(),
    )
  }
  for (const forbidden of [
    'evidence',
    'fingerprint',
    'savedplan',
    'saved_plan',
    'prompt',
    'responseschema',
    'apikey',
    'approval',
    'import',
    'testcase',
  ]) {
    expect(serializedRequest).not.toContain(forbidden)
  }
  expect(capturedMergeHeaders.authorization).toBeUndefined()

  await expect(page.getByText('Exact duplicate provenance')).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'Candidate coverage areas' }),
  ).toBeVisible()
  const candidateArea = page.getByRole('article', {
    name: 'Payment authorization coverage area',
  })
  await expect(candidateArea.getByText('Review the payment access decision.')).toBeVisible()
  await expect(
    candidateArea.getByText(
      'Alpha private requirement covers payment authorization and payment rejection.',
    ),
  ).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'Sections outside this candidate' }),
  ).toBeVisible()
  await expect(page.getByText('3. Unreviewed')).toBeVisible()
  await expect(page.getByText('Likely overlap', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('Conflict', { exact: true }).first()).toBeVisible()
  await expect(
    page.getByText(
      'The current saved plan remains unchanged until a fully validated save succeeds.',
    ),
  ).toBeVisible()
  expect(
    await page.evaluate(async () =>
      await window.qaReadPersistedCollection(
        'qa-mission-control:ai-coverage-plans:v0.18',
      ),
    ),
  ).toBeNull()
  await expect(
    page
      .getByRole('region', {
        name: 'Unsaved Global Coverage Plan candidate',
      })
      .getByRole('button', {
        name: /generate|approve|import|test case|readiness/i,
      }),
  ).toHaveCount(0)

  await page.getByRole('button', { name: 'Review save options' }).click()
  await expect(
    page.getByRole('heading', { name: 'Save new Global Coverage Plan?' }),
  ).toBeFocused()
  await page
    .getByRole('button', { name: 'Save new Global Coverage Plan' })
    .click()
  await expect(page.getByRole('heading', { name: 'Coverage Queue', exact: true })).toBeVisible()

  const savedCoverageRaw = await page.evaluate(async () =>
    await window.qaReadPersistedCollection(
      'qa-mission-control:ai-coverage-plans:v0.18',
    ),
  )
  expect(savedCoverageRaw).not.toBeNull()
  const savedCoverage = JSON.parse(savedCoverageRaw ?? '{}') as {
    records: Array<{
      origin: {
        kind: string
        selectedAnalyses: unknown[]
        outputProvenance: unknown[]
        reviewRelations: unknown[]
      }
    }>
  }
  expect(savedCoverage.records).toHaveLength(1)
  expect(savedCoverage.records[0].origin.kind).toBe('section_merge')
  expect(savedCoverage.records[0].origin.selectedAnalyses).toHaveLength(2)
  expect(savedCoverage.records[0].origin.outputProvenance.length).toBeGreaterThan(0)
  expect(savedCoverage.records[0].origin.reviewRelations.length).toBeGreaterThan(1)
  expect(savedCoverageRaw).not.toContain('pairAlias')
  expect(savedCoverageRaw).not.toContain('leftAlias')
  expect(savedCoverageRaw).not.toContain('rightAlias')
  expect(
    await page.evaluate(async () =>
      await window.qaReadPersistedCollection(
        'qa-mission-control:ai-section-coverage-plans:v0.21',
      ),
    ),
  ).toBe(beforeMerge.sectionPlans)
  expect(
    await page.evaluate(async () =>
      await window.qaReadPersistedCollection('qa-mission-control:test-cases:v0.1'),
    ),
  ).toBe(beforeMerge.testCases)

  await page.reload()
  await navigateTo(page, 'AI Coverage Workspace')
  await page
    .getByLabel('QA Source', { exact: true })
    .selectOption({ label: sourceTitle })
  await expect(page.getByText(/Saved coverage plan loaded/)).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Coverage Queue', exact: true })).toBeVisible()
  const restoredArea = page.getByRole('article', {
    name: 'Payment authorization',
  })
  await expect(
    restoredArea.getByText('Alpha', {
      exact: true,
      selector: '.coverage-queue-item__section-summary',
    }),
  ).toBeVisible()
  await restoredArea
    .getByText('Evidence and ambiguity notes', { selector: 'summary' })
    .click()
  await restoredArea
    .getByText('View 1 source location', { selector: 'summary' })
    .click()
  await expect(restoredArea.getByText('1. Alpha (lines 1-3)')).toBeVisible()
  expect(mergeRequestCount).toBe(1)
  expect(sectionRequestCount).toBe(2)
})

test('ignores a late merge response after source drift and preserves the prior saved plan', async ({
  page,
}) => {
  const sourceTitle = 'Global Merge Race LLD'
  const originalContent = [
    '# Alpha',
    'Alpha private requirement covers payment authorization and payment rejection.',
    '',
    '# Beta',
    'Beta private requirement covers payment authorisation and payment rejections.',
    '',
    '# Unreviewed',
    'This section remains intentionally unanalyzed.',
  ].join('\n')
  const changedContent = originalContent.replace(
    'Alpha private requirement covers payment authorization and payment rejection.',
    'Alpha changed revision covers a different payment decision.',
  )
  let sectionRequestCount = 0
  let mergeRequestCount = 0
  let capturedMergeRequest: CapturedCoveragePlanMergeRequest | null = null
  let startMergeRequest!: () => void
  let releaseMergeRequest!: () => void
  let finishMergeRequest!: () => void
  const mergeRequestStarted = new Promise<void>((resolve) => {
    startMergeRequest = resolve
  })
  const mergeRequestGate = new Promise<void>((resolve) => {
    releaseMergeRequest = resolve
  })
  const mergeRequestFinished = new Promise<void>((resolve) => {
    finishMergeRequest = resolve
  })

  await mockSingleAreaCoveragePlan(page, {
    areaName: 'Previously saved global area',
    evidence:
      'Alpha private requirement covers payment authorization and payment rejection.',
    includeRefs: false,
  })
  await page.route('**/api/ai/section-coverage-plan', async (route) => {
    sectionRequestCount += 1
    const request = route.request().postDataJSON() as CapturedSectionCoverageRequest
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(
        createMergeSectionCoverageSuccess(
          request.sectionSnapshot.title as 'Alpha' | 'Beta',
        ),
      ),
    })
  })
  await page.route('**/api/ai/coverage-plan-merge', async (route) => {
    mergeRequestCount += 1
    capturedMergeRequest =
      route.request().postDataJSON() as CapturedCoveragePlanMergeRequest
    startMergeRequest()
    await mergeRequestGate

    try {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(
          createMergeClassificationResponse(capturedMergeRequest),
        ),
      })
    } catch {
      // The browser may already have honored the AbortSignal.
    } finally {
      finishMergeRequest()
    }
  })

  await createQaSource(page, {
    title: sourceTitle,
    sourceType: 'LLD',
    status: 'Ready for test design',
    content: originalContent,
  })
  await navigateTo(page, 'AI Coverage Workspace')
  await page
    .getByLabel('QA Source', { exact: true })
    .selectOption({ label: sourceTitle })
  await page.getByRole('button', { name: 'Analyze coverage' }).click()
  await expect(page.getByRole('heading', { name: 'Coverage Queue', exact: true })).toBeVisible()
  const savedCoverageBefore = await page.evaluate(async () =>
    await window.qaReadPersistedCollection(
      'qa-mission-control:ai-coverage-plans:v0.18',
    ),
  )
  expect(savedCoverageBefore).not.toBeNull()

  await navigateTo(page, 'QA Sources')
  const sourceCard = await analyzeFirstTwoMergeSections(page, sourceTitle)
  const sectionStorageBefore = await page.evaluate(async () =>
    await window.qaReadPersistedCollection(
      'qa-mission-control:ai-section-coverage-plans:v0.21',
    ),
  )
  const testCaseStorageBefore = await page.evaluate(async () =>
    await window.qaReadPersistedCollection('qa-mission-control:test-cases:v0.1'),
  )
  await sourceCard
    .getByRole('button', { name: 'Select analyses to merge' })
    .click()
  const mergeCheckboxes = sourceCard.getByRole('checkbox')
  await mergeCheckboxes.nth(0).check()
  await mergeCheckboxes.nth(1).check()
  await sourceCard
    .getByRole('button', { name: 'Build global coverage plan' })
    .click()
  await mergeRequestStarted
  await expect(
    page.getByRole('heading', {
      name: 'Building unsaved Global Coverage Plan candidate',
    }),
  ).toBeVisible()
  expect(mergeRequestCount).toBe(1)

  await navigateTo(page, 'QA Sources')
  const currentCard = page.getByRole('article', { name: sourceTitle })
  await currentCard.getByRole('button', { name: 'Edit' }).click()
  const editForm = page.getByRole('form', { name: 'Edit QA Source form' })
  await editForm.getByLabel('Source content').fill(changedContent)
  await editForm.getByRole('button', { name: 'Save changes' }).click()
  releaseMergeRequest()
  await mergeRequestFinished

  await page
    .getByRole('button', { name: /^AI Coverage Workspace\b/ })
    .click()
  await expect(
    page.getByRole('heading', { name: 'Candidate is stale' }),
  ).toBeFocused()
  await expect(
    page.getByRole('heading', {
      name: 'Unsaved Global Coverage Plan candidate',
    }),
  ).toHaveCount(0)
  expect(mergeRequestCount).toBe(1)
  expect(sectionRequestCount).toBe(2)
  expect(
    await page.evaluate(async () =>
      await window.qaReadPersistedCollection(
        'qa-mission-control:ai-coverage-plans:v0.18',
      ),
    ),
  ).toBe(savedCoverageBefore)
  expect(
    await page.evaluate(async () =>
      await window.qaReadPersistedCollection(
        'qa-mission-control:ai-section-coverage-plans:v0.21',
      ),
    ),
  ).toBe(sectionStorageBefore)
  expect(
    await page.evaluate(async () =>
      await window.qaReadPersistedCollection('qa-mission-control:test-cases:v0.1'),
    ),
  ).toBe(testCaseStorageBefore)

  await navigateTo(page, 'QA Sources')
  const staleCard = page.getByRole('article', { name: sourceTitle })
  await staleCard.getByText('Source Structure', { exact: true }).click()
  await staleCard
    .getByRole('button', { name: 'Select analyses to merge' })
    .click()
  const staleCheckboxes = staleCard.getByRole('checkbox')
  await expect(staleCheckboxes).toHaveCount(3)
  for (let index = 0; index < 3; index += 1) {
    await expect(staleCheckboxes.nth(index)).toBeDisabled()
  }
  expect(
    await staleCard.getByText('Stale', { exact: true }).count(),
  ).toBeGreaterThanOrEqual(1)
  await expect(
    staleCard.getByRole('button', { name: 'Build global coverage plan' }),
  ).toBeDisabled()
})
