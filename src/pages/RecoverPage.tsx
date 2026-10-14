import { useState } from 'react';
import { Button } from '@/components/Button';
import { DemoBadge } from '@/components/DemoBadge';
import { describedBy, FieldShell } from '@/components/fields';
import { Notice } from '@/components/Notice';
import { usePageTitle } from '@/components/usePageTitle';
import { COMPANY, DEMO_MODE } from '@/config/product';
import { requestRecoveryLink } from '@/lib/api';
import { isValidEmail } from '@/questionnaire/helpers';

export function RecoverPage() {
  usePageTitle('Find my report');
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ demo: boolean } | null>(null);
  const [failure, setFailure] = useState<string>();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFailure(undefined);
    if (!isValidEmail(email)) {
      setError('Enter the email address you used when ordering.');
      return;
    }
    setError(undefined);
    setBusy(true);
    try {
      const res = await requestRecoveryLink(email.trim());
      setDone({ demo: res.demo });
    } catch (err) {
      setFailure(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="container container--form form-page page-enter">
      <div className="form-page__head">
        <span className="eyebrow">
          Find my report <DemoBadge />
        </span>
        <h1>Lost your report link?</h1>
        <p>
          Enter the email address you used at checkout. If a report exists for it, we will send a
          fresh link to that address. We never show report details on this page.
        </p>
      </div>

      {done ? (
        <Notice tone="success" title="Check your inbox" role="status">
          <p>
            If a report is linked to <strong>{email.trim()}</strong>, an email with your report link
            is on its way. It can take a few minutes. Check spam or promotions folders too.
          </p>
          {done.demo && (
            <p>
              <strong>Demo mode:</strong> no email was actually sent. The live product will send one
              from {COMPANY.name}.
            </p>
          )}
        </Notice>
      ) : (
        <form noValidate onSubmit={submit} className="card stack">
          <FieldShell id="recover-email" label="Email address used at checkout" error={error} required>
            <input
              id="recover-email"
              type="email"
              inputMode="email"
              className="input"
              value={email}
              autoComplete="email"
              spellCheck={false}
              aria-describedby={describedBy('recover-email', undefined, error)}
              aria-invalid={error ? true : undefined}
              onChange={(e) => setEmail(e.target.value)}
            />
          </FieldShell>
          {failure && (
            <Notice tone="danger" role="alert">
              <p>{failure}</p>
            </Notice>
          )}
          <Button type="submit" disabled={busy}>
            {busy ? (
              <>
                <span className="spinner" aria-hidden="true" /> Sending…
              </>
            ) : (
              'Email me my report link'
            )}
          </Button>
          {DEMO_MODE && (
            <p className="small muted">In demo mode this form only simulates the request.</p>
          )}
        </form>
      )}

      <p className="small muted" style={{ marginTop: 'var(--space-8)' }}>
        Still stuck? Contact {COMPANY.supportEmail} with the approximate date of your order.
      </p>
    </div>
  );
}
