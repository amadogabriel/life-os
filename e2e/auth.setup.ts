import { test as setup } from '@playwright/test'

const authFile = 'e2e/.auth/agent.json'

setup('authenticate as agent-runner', async ({ page }) => {
  const email = process.env.AGENT_EMAIL
  const password = process.env.AGENT_PASSWORD
  if (!email || !password) {
    throw new Error('AGENT_EMAIL / AGENT_PASSWORD not set — see .env')
  }

  await page.goto('/')
  await page.getByPlaceholder('you@email.com').fill(email)
  await page.getByPlaceholder('password (min 6 chars)').fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.getByRole('button', { name: 'Today' }).waitFor()

  await page.context().storageState({ path: authFile })
})
