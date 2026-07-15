import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { PlannerData } from '../../lib/queries/planner'

export function AccountView({ data, email, demo = false }: { data: PlannerData; email: string; demo?: boolean }) {
  const [status, setStatus] = useState('')

  async function setPassword() {
    const p = prompt(`Set a password for ${email} (min 6 characters). Use it to sign in on your other devices:`)
    if (!p) return
    if (p.length < 6) {
      setStatus('password too short')
      return
    }
    setStatus('updating…')
    const { error } = await supabase.auth.updateUser({ password: p })
    setStatus(error ? 'error: ' + error.message : 'password set ✓')
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'weekly-planner.json'
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(a.href)
  }

  return (
    <div>
      <div className="view-head mb-[18px]">
        <h2>Account</h2>
        <p>Your login and cloud sync.</p>
      </div>
      <table className="ptable">
        <tbody>
          <tr>
            <td>Signed in as</td>
            <td style={{ textAlign: 'right' }}>{email}</td>
          </tr>
          <tr>
            <td>Status</td>
            <td style={{ textAlign: 'right' }}>
              {demo
                ? 'demo mode — data stays in this browser'
                : status || 'synced — every edit saves as its own row'}
            </td>
          </tr>
        </tbody>
      </table>
      <div className="mt-4 flex flex-wrap gap-2">
        {!demo && (
          <button className="btn" onClick={setPassword}>
            Set / change password
          </button>
        )}
        <button className="btn ghost" onClick={exportJson}>
          ⤓ Export JSON
        </button>
        {!demo && (
          <button className="btn ghost danger" onClick={() => supabase.auth.signOut()}>
            Sign out
          </button>
        )}
      </div>
      <p className="mt-[14px] max-w-[64ch] text-[13px]" style={{ color: 'var(--ink-faint)' }}>
        {demo
          ? 'No Supabase credentials are configured, so the planner is running fully local. Copy .env.example to .env and fill in your project keys to turn on cloud sync (see SETUP.md).'
          : "Your data lives in your Supabase project, one row per block/habit/log — no more last-write-wins blob. The Supabase URL and key are baked in at build time; there's nothing to paste on new devices — just sign in."}
      </p>
    </div>
  )
}
