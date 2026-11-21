import { useState, type FormEvent } from 'react'
import type { AuthRole } from './auth'

type Props = {
  intended: AuthRole
  busy?: boolean
  error?: string | null
  onSubmit: (email: string, password: string) => void
}

const COPY: Record<
  AuthRole,
  { title: string; blurb: string; hint: string; emailPlaceholder: string }
> = {
  agent: {
    title: 'Accedi ad Agent',
    blurb: 'Ufficio digitale, decisioni HITL e reparti del piano.',
    hint: 'Demo: agent@demo · agent-demo',
    emailPlaceholder: 'agent@demo',
  },
  admin: {
    title: 'Accedi ad Admin',
    blurb: 'Entitlements, diritti decisionali e configurazione tenant.',
    hint: 'Demo: admin@demo · admin-demo',
    emailPlaceholder: 'admin@demo',
  },
}

export function LoginScreen({ intended, busy, error, onSubmit }: Props) {
  const copy = COPY[intended]
  const [email, setEmail] = useState(copy.emailPlaceholder)
  const [password, setPassword] = useState('')

  const handle = (e: FormEvent) => {
    e.preventDefault()
    onSubmit(email.trim(), password)
  }

  return (
    <div className="login-shell" data-intended={intended}>
      <div className="login-atmosphere" aria-hidden />
      <main className="login-panel">
        <header className="login-brand">
          <span className="brand-strip" aria-hidden />
          <div className="brand-lockup">
            <span className="brand-mark">Atrium</span>
            <span className="brand-tag">Workspace marketing</span>
          </div>
        </header>

        <h1 className="login-title">{copy.title}</h1>
        <p className="login-blurb">{copy.blurb}</p>

        <form className="login-form" onSubmit={handle}>
          <label htmlFor="login-email">Email</label>
          <input
            id="login-email"
            name="email"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            disabled={busy}
          />

          <label htmlFor="login-password">Password</label>
          <input
            id="login-password"
            name="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            disabled={busy}
          />

          {error && <p className="error login-error">{error}</p>}

          <button type="submit" className="btn btn-primary login-submit" disabled={busy}>
            {busy ? 'Accesso…' : 'Entra'}
          </button>
        </form>

        <p className="login-hint">{copy.hint}</p>
        <p className="login-role-note">
          {intended === 'admin'
            ? 'Solo account Admin. Un Agent non può aprire questa area.'
            : 'Account Agent o Admin. L’Admin può anche usare Agent.'}
        </p>
      </main>
    </div>
  )
}
