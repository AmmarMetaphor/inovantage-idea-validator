import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Notice } from '@/components/Notice';
import { usePageTitle } from '@/components/usePageTitle';
import { COMPANY } from '@/config/product';
import { getCheckoutResult, type CheckoutResult } from '@/lib/api';
import { useQuestionnaire } from '@/questionnaire/store';

/**
 * Where the hosted checkout sends the customer after paying. The browser is
 * never trusted: this page only asks the server whether the payment has been
 * verified, then follows the private report link the server issues.
 */
export function CheckoutReturnPage() {
  usePageTitle('Confirming payment');
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { reset } = useQuestionnaire();
  const sessionId = params.get('session_id') ?? '';
  const [result, setResult] = useState<CheckoutResult | null>(null);
  const [error, setError] = useState<string>();
  const attempts = useRef(0);

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    let timer: number | undefined;
    const poll = async () => {
      try {
        const r = await getCheckoutResult(sessionId);
        if (cancelled) return;
        setResult(r);
        if (r.state === 'paid') {
          reset(); // answers are submitted; clear them from memory
          if (r.reportPath) navigate(r.reportPath, { replace: true });
          return;
        }
        if (r.state === 'pending' && attempts.current < 20) {
          attempts.current += 1;
          timer = window.setTimeout(poll, 3000);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not confirm the payment.');
      }
    };
    void poll();
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [sessionId, navigate, reset]);

  const stillPending = result?.state === 'pending' && attempts.current >= 20;

  return (
    <div className="container container--form form-page page-enter stack-lg">
      <div className="form-page__head">
        <span className="eyebrow">Checkout</span>
        <h1>{result?.state === 'paid' ? 'Payment confirmed' : 'Confirming your payment'}</h1>
        <p>We are checking with the payment provider. This usually takes a few seconds.</p>
      </div>

      {!sessionId && (
        <Notice tone="warning" title="No checkout reference">
          <p>
            This page needs the reference the payment page sends back. If you have paid, your
            confirmation email contains your private report link.
          </p>
        </Notice>
      )}

      {!result && !error && sessionId && (
        <p className="muted" role="status">
          <span className="spinner" aria-hidden="true" /> Checking…
        </p>
      )}

      {result?.state === 'paid' && !result.reportPath && (
        <Notice tone="success" title="Payment received" role="status">
          <p>{result.message ?? 'Use the link in your confirmation email to follow your report.'}</p>
        </Notice>
      )}

      {stillPending && (
        <Notice tone="info" title="Still confirming">
          <p>
            Payment confirmations occasionally take a few minutes. You do not need to do anything:
            your confirmation email with a private link will arrive once it clears.
          </p>
        </Notice>
      )}

      {(result?.state === 'expired' || result?.state === 'failed' || result?.state === 'rejected') && (
        <Notice tone="danger" title="This checkout could not be completed" role="alert">
          <p>No report has been started. If you believe you were charged, contact {COMPANY.supportEmail}.</p>
        </Notice>
      )}

      {error && (
        <Notice tone="danger" title="We could not confirm the payment" role="alert">
          <p>{error}</p>
        </Notice>
      )}

      <p className="small muted">
        Lost the email later? <Link to="/find-report">Find my report</Link>.
      </p>
    </div>
  );
}
