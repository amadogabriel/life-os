import { defineConfig } from '@playwright/test'

// The e2e smoke test runs against a build with placeholder Supabase env —
// it verifies the app boots and gates on auth, without needing a live project.
const env = {
  VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL ?? 'https://placeholder.supabase.co',
  VITE_SUPABASE_ANON_KEY: process.env.VITE_SUPABASE_ANON_KEY ?? 'placeholder-anon-key',
}

export default defineConfig({
  testDir: 'e2e',
  // agent.spec.ts / auth.setup.ts are authenticated-run only — see playwright.auth.config.ts
  testIgnore: [/auth\.setup\.ts/, /agent\.spec\.ts/],
  use: { baseURL: 'http://localhost:5173' },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    env,
  },
})
