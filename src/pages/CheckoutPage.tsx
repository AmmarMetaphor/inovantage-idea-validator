import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/Button';
import { DemoBadge } from '@/components/DemoBadge';
import { Notice } from '@/components/Notice';
import { usePageTitle } from '@/components/usePageTitle';
import { PRICE } from '@/config/product';
import { DEMO_MODE } from '@/config/runtime';
import { demoCompletePayment } from '@/lib/api';
import { asString, maskEmail } from '@/questionnaire/helpers';
import { useQuestionnaire } from '@/questionnaire/store';

/**
 * Checkout handoff.
 *
 * Live mode: the review page sends the customer straight to the payment
 * provider, so this route only ever shows the "return from checkout" states
 * (?status=cancelled) or an explanation that the backend is not connected.
 *
 * Demo mode: a clearly labelled simulated checkout with two buttons.
 */
export function CheckoutPage() {
  usePageTitle('Checkout');
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { answers, reset } = useQuestionnaire();
  const reportId = params.get('report') ?? '';
  const status = params.get('status');
  const [busy, setBusy] = useState<'pay' | 'cancel' | null>(null);
  const [error, setError] = useState<string>();

  const email = asString(answers.email);
  const ideaName = asString(answers.ideaName);

  if (status === 'cancelled') {
    return (
      <div className="container container--form form-page page-enter stack-lg">
        <div className="form-page__head">
          <h1>Payment cancelled</h1>
          <p>No payment was taken. Your answers are still here if you want to continue.</p>
        </div>
        <div className="cluster">
          <Link to="/review" className="btn btn--primary btn--md">
            Return to review
          </Link>
          <Link to="/" className="btn btn--secondary btn--md">
            Back to home
          </Link>
        </div>
      </div>
    );
  }

  if (!DEMO_MODE) {
    return (
      <div className="container container--form form-page page-enter stack-lg">
        <div className="form-page__head">
          <h1>Checkout</h1>
        </div>
        <Notice tone="warning" title="Payments are not connected yet">
          <p>
            This site is not in demo mode, but the payment service has not been configured. Nothing
            has been charged. Please contact the site owner.
          </p>
        </Notice>
        <Link to="/review" className="btn btn--secondary btn--md">
          Back to review
        </Link>
      </div>
    );
  }

  if (!reportId) {
    return (
      <div className="container container--form form-page page-enter stack-lg">
        <div className="form-page__head">
          <h1>Checkout</h1>
          <p>No order reference was provided. Please review your answers and try again.</p>
        </div>
        <Link to="/review" className="btn btn--primary btn--md">
          Go to review
        </Link>
      </div>
    );
  }

  const simulatePayment = async () => {
    setBusy('pay');
    setError(undefined);
    try {
      await demoCompletePayment(reportId);
      reset(); // answers are "submitted"; clear them from memory
      navigate(`/report/${reportId}?paid=1`, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Simulation failed.');
      setBusy(null);
    }
  };

  const simulateCancel = () => {
    setBusy('cancel');
    navigate('/checkout?status=cancelled', { replace: true });
  };

  return (
    <div className="container container--form form-page page-enter">
      <div className="form-page__head">
        <span className="eyebrow">
          Checkout <DemoBadge label="Simulated" />
        </span>
        <h1>Simulated checkout</h1>
        <p>
          In the live product this step hands over to a hosted payment page. In demo mode, nothing is
          charged and no card details are requested.
        </p>
      </div>

      <div className="card card--raised stack">
        <h2 style={{ fontSize: 'var(--text-lg)', fontFamily: 'var(--font-sans)', fontWeight: 600 }}>
          Order summary
        </h2>
        <dl className="kv">
          <dt>Product</dt>
          <dd>Idea feasibility report{ideaName ? ` — ${ideaName}` : ''}</dd>
          <dt>Price</dt>
          <dd>{PRICE.display} (one-off)</dd>
          <dt>Report sent to</dt>
          <dd>{email ? maskEmail(email) : 'the address you confirmed'}</dd>
          <dt>Reference</dt>
          <dd>
            <span className="code">{reportId}</span>
          </dd>
        </dl>

        <Notice tone="warning" title="Demo mode" role="note">
          <p>
            Choose an outcome below to see what the customer experiences. No payment provider is
            involved.
          </p>
        </Notice>

        {error && (
          <Notice tone="danger" role="alert">
            <p>{error}</p>
          </Notice>
        )}

        <div className="form-actions" style={{ marginTop: 0, paddingTop: 0, borderTop: 0 }}>
          <Button variant="secondary" onClick={simulateCancel} disabled={busy !== null}>
            Simulate cancelled payment
          </Button>
          <Button onClick={simulatePayment} disabled={busy !== null} size="lg">
            {busy === 'pay' ? (
              <>
                <span className="spinner" aria-hidden="true" /> Processing…
              </>
            ) : (
              'Simulate successful payment'
            )}
          </Button>
        </div>
      </div>

      <p className="small muted" style={{ marginTop: 'var(--space-6)' }}>
        Changed your mind? <Link to="/review">Go back to your answers</Link>.
      </p>
    </div>
  );
}
