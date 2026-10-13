import { useEffect, useState } from 'react';
import { useStore, api } from '../lib/store.jsx';
import { Field, Seg } from './ui.jsx';

export function Logo({ size = 28 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="9" fill="var(--accent)" />
      <path d="M8 21c3-8 6-8 8 0s5 8 8 0" stroke="var(--bg)" strokeWidth="2.6" fill="none" strokeLinecap="round" />
    </svg>
  );
}

export function AuthScreen() {
  const { actions } = useStore();
  const [mode, setMode] = useState('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [invite, setInvite] = useState('');
  const [inviteRequired, setInviteRequired] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api('/auth/config')
      .then((c) => setInviteRequired(c.inviteRequired))
      .catch(() => {});
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (mode === 'signup') await api('/auth/signup', { method: 'POST', body: { email, password, name, invite } });
      else await api('/auth/login', { method: 'POST', body: { email, password } });
      await actions.reload();
    } catch (x) {
      setError(x.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="lock">
      <form className="card stack auth-card" onSubmit={submit}>
        <div className="row" style={{ gap: 10 }}>
          <Logo />
          <h2>Cadence</h2>
        </div>
        <p className="small muted" style={{ margin: 0 }}>
          A personal coach for monthly running and walking challenges.
        </p>
        <Seg
          full
          value={mode}
          onChange={(m) => (setMode(m), setError(''))}
          options={[
            { value: 'signin', label: 'Sign in' },
            { value: 'signup', label: 'Create account' },
          ]}
        />
        {mode === 'signup' && (
          <Field label="First name">
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="given-name" />
          </Field>
        )}
        <Field label="Email">
          <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
        </Field>
        <Field label="Password" hint={mode === 'signup' ? 'At least 10 characters.' : null}>
          <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} required />
        </Field>
        {mode === 'signup' && inviteRequired && (
          <Field label="Invite code">
            <input className="input" value={invite} onChange={(e) => setInvite(e.target.value)} />
          </Field>
        )}
        {error && (
          <p className="small" style={{ color: 'var(--warn)', margin: 0 }} role="alert">
            {error}
          </p>
        )}
        <button className="btn primary" disabled={busy}>
          {busy ? 'Please wait…' : mode === 'signup' ? 'Create account' : 'Sign in'}
        </button>
        {mode === 'signup' && (
          <p className="tiny faint" style={{ margin: 0 }}>
            Your logs — including wellbeing and cycle notes — are private to your account. You can export or delete everything at any time from Settings.
          </p>
        )}
      </form>
    </div>
  );
}
