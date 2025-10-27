import { expect, test } from '@playwright/test'

test('add and toggle', async ({ page }) => {
  await page.goto('http://localhost:3000')
  await page.getByPlaceholder('Add todo').fill('hello')
  await page.getByRole('button', { name: 'Add' }).click()
  await expect(page.getByText('hello')).toBeVisible()
})
