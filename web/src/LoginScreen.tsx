import { useState, type FormEvent } from 'react'
import type { AuthRole } from './auth'

type Props = {
  intended: AuthRole
  busy?: boolean
  error?: string | null
  allowSignup?: boolean
  onSubmit: (email: string, password: string) => void
  onSignup?: (email: string, password: string, displayName: string) => void
}

const COPY: Record<
  AuthRole,
  { title: string; blurb: string; hint: string; emailPlaceholder: string }
> = {
  agent: {
    title: 'Accedi ad Agent',
    blurb: 'Ufficio digitale, decisioni HITL e reparti del piano.',
    hint: 'Demo locale: agent@demo · agent-demo',
    emailPlaceholder: 'agent@demo',
  },
  admin: {
    title: 'Accedi ad Admin',
    blurb: 'Entitlements, diritti decisionali e configurazione tenant.',
    hint: 'Demo locale: admin@demo · admin-demo',
    emailPlaceholder: 'admin@demo',
  },
}

export function LoginScreen({
  intended,
  busy,
  error,
  allowSignup,
  onSubmit,
  onSignup,
}: Props) {
  const copy = COPY[intended]
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState(copy.emailPlaceholder)
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')

  const handle = (e: FormEvent) => {
    e.preventDefault()
    if (mode === 'signup' && onSignup) {
      onSignup(email.trim(), password, displayName.trim())
      return
    }
    onSubmit(email.trim(), password)
  }

  const showSignup = Boolean(allowSignup && intended === 'agent' && onSignup)

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

        <h1 className="login-title">
          {mode === 'signup' ? 'Crea account Agent' : copy.title}
        </h1>
        <p className="login-blurb">
          {mode === 'signup'
            ? 'Registrazione via Supabase Auth. Il ruolo iniziale è Agent.'
            : copy.blurb}
        </p>

        <form className="login-form" onSubmit={handle}>
          {mode === 'signup' && (
            <>
              <label htmlFor="login-name">Nome</label>
              <input
                id="login-name"
                name="display_name"
                type="text"
                autoComplete="name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                disabled={busy}
                placeholder="Come vuoi apparire"
              />
            </>
          )}

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
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            disabled={busy}
            minLength={mode === 'signup' ? 8 : undefined}
          />

          {error && <p className="error login-error">{error}</p>}

          <button type="submit" className="btn btn-primary login-submit" disabled={busy}>
            {busy ? 'Accesso…' : mode === 'signup' ? 'Registrati' : 'Entra'}
          </button>
        </form>

        {showSignup && (
          <p className="login-switch">
            {mode === 'login' ? (
              <>
                Non hai un account?{' '}
                <button type="button" className="linkish" onClick={() => setMode('signup')}>
                  Crea account
                </button>
              </>
            ) : (
              <>
                Hai già un account?{' '}
                <button type="button" className="linkish" onClick={() => setMode('login')}>
                  Accedi
                </button>
              </>
            )}
          </p>
        )}

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
