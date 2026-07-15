import { expect, test } from '@playwright/test'

test('app boots and shows the sign-in gate when logged out', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
  await expect(page.getByPlaceholder('you@email.com')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible()
})

test('sign-up validates password length client-side', async ({ page }) => {
  await page.goto('/')
  await page.getByPlaceholder('you@email.com').fill('someone@example.com')
  await page.getByPlaceholder('password (min 6 chars)').fill('123')
  await page.getByRole('button', { name: /Create account/ }).click()
  await expect(page.getByText('at least 6 characters')).toBeVisible()
})
