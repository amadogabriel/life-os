import { defineConfig } from '@playwright/test'

// Authenticated runs against the real Supabase project, as a dedicated
// agent test account (see .env: AGENT_EMAIL / AGENT_PASSWORD) — distinct
// from playwright.config.ts, which smoke-tests the logged-out gate against
// a placeholder project.
process.loadEnvFile('.env')

const authFile = 'e2e/.auth/agent.json'

export default defineConfig({
  testDir: 'e2e',
  use: { baseURL: 'http://localhost:5173' },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    env: {
      VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL ?? '',
      VITE_SUPABASE_ANON_KEY: process.env.VITE_SUPABASE_ANON_KEY ?? '',
    },
  },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'authenticated',
      testMatch: /.*\.spec\.ts/,
      testIgnore: /smoke\.spec\.ts/,
      dependencies: ['setup'],
      use: { storageState: authFile },
    },
  ],
})
