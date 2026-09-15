import { expect, test } from '@playwright/test'
import { demoStorage } from '../scripts/demo-fixture'

test('execution saves only the explicit field, preserves notes and rejects a changed design before commit', async ({ page }) => {
  await page.addInitScript((data) => { if (!localStorage.getItem('execution-seeded')) { Object.entries(data).forEach(([key, value]) => localStorage.setItem(key, value)); localStorage.setItem('execution-seeded', 'yes') } }, demoStorage)
  await page.goto('/')
  await page.getByRole('navigation', { name: 'Workspace pages' }).getByRole('button', { name: 'Executions', exact: true }).click()
  const result = page.getByLabel('Execution result', { exact: true }); const notes = page.getByLabel('Execution notes', { exact: true })
  const nextResult = await result.inputValue() === 'Failed' ? 'Blocked' : 'Failed'
  await notes.fill('Manually checked with a second account; retain this note.')
  await notes.press('Tab')
  await result.selectOption(nextResult)
  await expect(result).toHaveValue(nextResult)
  await expect(result).toBeEnabled()
  await expect(notes).toHaveValue('Manually checked with a second account; retain this note.')
  const before = await page.evaluate(async () => {
    const path = '/src/lib/workspace/workspaceRepository.ts'; const { openWorkspaceRepository } = await import(/* @vite-ignore */ path)
    const repository = await openWorkspaceRepository()
    const row = (await repository.readCollection('executions')).records.find((record: { value: { notes: string } }) => record.value.notes.includes('second account'))
    const test = await repository.readRecord('testCases', row.value.testCaseId)
    await repository.commit([{ collection: 'testCases', put: [{ id: test.id, order: test.order, value: { ...test.value, steps: 'A newly revised test design that has not been run.', updatedAt: new Date().toISOString() } }] }]); repository.close()
    return row.value
  })
  await result.selectOption('Passed')
  await expect(page.getByRole('alert')).toContainText('Execution could not be saved safely')
  const after = await page.evaluate(async (id) => {
    const path = '/src/lib/workspace/workspaceRepository.ts'; const { openWorkspaceRepository } = await import(/* @vite-ignore */ path)
    const repository = await openWorkspaceRepository(); const row = await repository.readRecord('executions', id); repository.close(); return row.value
  }, before.id)
  expect(after).toEqual(before)
  await page.reload()
  await page.getByRole('navigation', { name: 'Workspace pages' }).getByRole('button', { name: 'Executions', exact: true }).click()
  await expect(page.getByText('This recorded result has no verified match to the current test design. Re-run the displayed steps before recording a current result.', { exact: true })).toBeVisible()
  await expect(notes).toHaveValue('Manually checked with a second account; retain this note.')
})
