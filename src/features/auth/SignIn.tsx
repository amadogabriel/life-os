import { useState, type FormEvent } from 'react'
import { supabase } from '../../lib/supabase'

export function SignIn() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)

  async function signIn(e: FormEvent) {
    e.preventDefault()
    if (!email || !password) return
    setBusy(true)
    setMsg('Signing in…')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setBusy(false)
    if (error) setMsg('Error: ' + error.message)
  }

  async function signUp() {
    if (!email || password.length < 6) {
      setMsg('Enter an email and a password of at least 6 characters.')
      return
    }
    setBusy(true)
    setMsg('Creating account…')
    const { data, error } = await supabase.auth.signUp({ email, password })
    setBusy(false)
    if (error) setMsg('Error: ' + error.message)
    else if (!data.session)
      setMsg(
        'Account made, but email confirmation is on. Turn it off in Supabase (Authentication → Providers → Email → Confirm email), then sign in.',
      )
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center p-5" style={{ background: 'var(--paper)' }}>
      <form
        onSubmit={signIn}
        className="w-full max-w-[390px] rounded-[14px] border p-6"
        style={{ background: 'var(--card)', borderColor: 'var(--line)' }}
      >
        <h2 className="mb-2 text-xl font-semibold" style={{ fontFamily: 'var(--serif)' }}>
          Sign in
        </h2>
        <p className="mb-4 text-sm" style={{ color: 'var(--ink-soft)' }}>
          Email + password — works on every device. First time? Tap <b>Create account</b>.
        </p>
        <div className="field">
          <input
            type="email"
            placeholder="you@email.com"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="field">
          <input
            type="password"
            placeholder="password (min 6 chars)"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <button type="submit" className="btn primary" disabled={busy}>
          Sign in
        </button>
        {msg && <div className="mt-3 text-[13px]" style={{ color: 'var(--ok)' }}>{msg}</div>}
        <button
          type="button"
          className="mt-3 block cursor-pointer border-0 bg-transparent p-0 text-[13px]"
          style={{ color: 'var(--ink-faint)' }}
          onClick={signUp}
          disabled={busy}
        >
          Create account with this email + password
        </button>
      </form>
    </div>
  )
}
