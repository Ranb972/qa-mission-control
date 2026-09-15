import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it } from 'vitest'
import { ReportPagedList } from './ReportPagedList'

it('bounds printed and screen previews without hiding the full export scope', async () => {
  const user = userEvent.setup()
  render(<ReportPagedList items={Array.from({ length: 81 }, (_, index) => index + 1)} label="Report test pages">{(items) => <ul>{items.map((item) => <li key={item}>Test {item}</li>)}</ul>}</ReportPagedList>)
  expect(screen.getAllByRole('listitem')).toHaveLength(40)
  expect(screen.getByText(/Markdown export contains every item/)).toBeVisible()
  await user.click(screen.getByRole('button', { name: 'Next', exact: true }))
  expect(screen.getByText('Test 41', { exact: true })).toBeVisible()
  await user.click(screen.getByRole('button', { name: 'Next', exact: true }))
  expect(screen.getAllByRole('listitem')).toHaveLength(1)
  expect(screen.getByText('Test 81', { exact: true })).toBeVisible()
})
