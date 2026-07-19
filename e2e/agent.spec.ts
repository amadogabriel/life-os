import { expect, test } from '@playwright/test'

test('agent-runner is logged in and sees the Today tab', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Today' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Sign in' })).not.toBeVisible()
})
