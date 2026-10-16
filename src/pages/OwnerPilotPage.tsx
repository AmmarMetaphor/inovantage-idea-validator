import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/Button';
import { describedBy, FieldShell } from '@/components/fields';
import { Notice } from '@/components/Notice';
import { usePageTitle } from '@/components/usePageTitle';
import { DEMO_MODE } from '@/config/runtime';
import { getOwnerSession, ownerLogin, ownerLogout, type OwnerSession } from '@/lib/api';
import { useQuestionnaire } from '@/questionnaire/store';

/**
 * /owner/pilot — password-protected owner test page.
 * The password is checked on the server; the browser never holds it or any
 * secret. A signed HttpOnly cookie carries the session.
 */
export function OwnerPilotPage() {
  usePageTitle('Owner pilot');
  const navigate = useNavigate();
  const { reset, setPilot, setAnswers } = useQuestionnaire();
  const [session, setSession] = useState<OwnerSession | null>(null);
  const [loadError, setLoadError] = useState<string>();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    try {
      setSession(await getOwnerSession());
      setLoadError(undefined);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Could not reach the server.');
    }
  };

  useEffect(() => {
    // A demo build never calls the server; nothing here can work, so do not try.
    if (DEMO_MODE) return;
    void refresh();
  }, []);

  const login = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      await ownerLogin(password);
      setPassword('');
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed.');
    } finally {
      setBusy(false);
    }
  };

  const logout = async () => {
    await ownerLogout().catch(() => undefined);
    await refresh();
  };

  const startPilot = () => {
    reset();
    setPilot(true);
    const to = session?.allowedEmails?.[0];
    if (to) setAnswers({ email: to });
    navigate('/validate/1');
  };

  return (
    <div className="container container--form form-page page-enter">
      <div className="form-page__head">
        <span className="eyebrow">Owner only</span>
        <h1>Pilot test page</h1>
        <p>Run the real research, report, PDF and email pipeline without Stripe. Not linked from the public site.</p>
      </div>

      {DEMO_MODE && (
        <Notice tone="warning" title="This build is in demo mode" role="alert">
          <p>The pilot needs a build with <span className="code">VITE_DEMO_MODE=false</span>. In demo mode the questionnaire simulates everything and never calls the server.</p>
        </Notice>
      )}

      {loadError && (
        <Notice tone="danger" role="alert">
          <p>{loadError}</p>
        </Notice>
      )}

      {session && !session.pilotMode && (
        <Notice tone="neutral" title="Pilot mode is off">
          <p>The server has <span className="code">PILOT_MODE</span> unset or not equal to <span className="code">true</span>. Nothing on this page works until it is enabled.</p>
        </Notice>
      )}

      {session?.pilotMode && !session.authenticated && (
        <form noValidate onSubmit={login} className="card stack" style={{ marginTop: 'var(--space-6)' }}>
          <FieldShell id="owner-password" label="Owner password" error={error} required>
            <input
              id="owner-password"
              type="password"
              className="input"
              value={password}
              autoComplete="current-password"
              aria-describedby={describedBy('owner-password', undefined, error)}
              aria-invalid={error ? true : undefined}
              onChange={(e) => setPassword(e.target.value)}
            />
          </FieldShell>
          <Button type="submit" disabled={busy || !password}>
            {busy ? 'Checking…' : 'Sign in'}
          </Button>
          <p className="small muted">Checked on the server. Five attempts per fifteen minutes.</p>
        </form>
      )}

      {session?.authenticated && (
        <div className="card stack" style={{ marginTop: 'var(--space-6)' }}>
          <Notice tone="success" title="Signed in" role="status">
            <p>Session expires {session.expiresAt ? new Date(session.expiresAt).toLocaleTimeString('en-GB') : 'soon'}.</p>
          </Notice>
          <dl className="kv">
            <dt>Reports delivered to</dt>
            <dd>{session.allowedEmails?.join(', ')}</dd>
            <dt>Generator</dt>
            <dd>
              {session.generator} {session.generator !== 'anthropic' && <span className="demo-badge">Not real research</span>}
            </dd>
            <dt>Model</dt>
            <dd>{session.model}</dd>
            <dt>Deploy context</dt>
            <dd>{session.context}</dd>
          </dl>
          <p className="muted small">
            Starting a pilot opens the real six-step questionnaire with the pilot address pre-filled. On the review page the
            button reads “Create pilot report (no payment)”. You will then land on the private report page; the confirmation
            and report emails go to the pilot address. On that page, while signed in here, the upgrade button creates a
            pilot detailed report without Stripe.
          </p>
          <div className="cluster">
            <Button size="lg" onClick={startPilot} disabled={DEMO_MODE}>
              Start a pilot report
            </Button>
            <Button variant="secondary" onClick={logout}>
              Sign out
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
