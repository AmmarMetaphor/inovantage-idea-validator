import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { Button } from '@/components/Button';
import { DemoBadge } from '@/components/DemoBadge';
import { ConfirmEmailInput } from '@/components/fields';
import { Notice } from '@/components/Notice';
import { usePageTitle } from '@/components/usePageTitle';
import { currencySymbol, DELIVERY_COPY, PRICE } from '@/config/product';
import { DEMO_MODE } from '@/config/runtime';
import { createCheckout, createPilotOrder } from '@/lib/api';
import { asArray, asBool, asEstimate, asString, formatNumber, parseNumberInput } from '@/questionnaire/helpers';
import { groupByQuestion, optionLabel, STEPS, visibleFields } from '@/questionnaire/schema';
import { useQuestionnaire } from '@/questionnaire/store';
import type { Answers, Field } from '@/questionnaire/types';
import { firstInvalidStep } from '@/questionnaire/validate';

function renderValue(field: Field, answers: Answers): { text: string; empty: boolean } {
  const v = answers[field.id];
  switch (field.type) {
    case 'text':
    case 'textarea':
    case 'email': {
      const s = asString(v).trim();
      return { text: s || 'Not provided', empty: !s };
    }
    case 'select':
    case 'radio':
    case 'combobox': {
      const s = asString(v);
      return { text: s ? optionLabel(field, s) : 'Not chosen', empty: !s };
    }
    case 'checkbox-group': {
      const arr = asArray(v);
      return { text: arr.length ? arr.map((x) => optionLabel(field, x)).join(', ') : 'None chosen', empty: !arr.length };
    }
    case 'checkbox':
      return { text: asBool(v) ? 'Confirmed' : 'Not confirmed', empty: !asBool(v) };
    case 'estimate': {
      const est = asEstimate(v);
      if (est.unknown) return { text: 'Not sure (will be marked as a gap and assumed in the report)', empty: false };
      const n = parseNumberInput(est.value);
      if (n === null) return { text: 'Not provided', empty: true };
      const sym = field.unit === 'currency' ? currencySymbol(asString(answers.currency)) : '';
      const suffix = field.suffix ? ` ${field.suffix}` : '';
      return { text: `${sym}${formatNumber(n)}${suffix}`, empty: false };
    }
  }
}

export function ReviewPage() {
  usePageTitle('Review your answers');
  const navigate = useNavigate();
  const { answers, furthestStep, markReviewed, pilot, clientRequestId, reset } = useQuestionnaire();
  const [confirmEmail, setConfirmEmail] = useState('');
  const [confirmError, setConfirmError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string>();

  useEffect(() => {
    markReviewed();
  }, [markReviewed]);

  const invalid = firstInvalidStep(answers);
  if (furthestStep < STEPS.length - 1 && invalid >= 0) {
    return <Navigate to={`/validate/${invalid + 1}`} replace />;
  }

  const email = asString(answers.email).trim();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(undefined);
    if (invalid >= 0) {
      navigate(`/validate/${invalid + 1}`);
      return;
    }
    if (confirmEmail.trim().toLowerCase() !== email.toLowerCase()) {
      setConfirmError('The two email addresses do not match.');
      return;
    }
    setConfirmError(undefined);
    setSubmitting(true);
    try {
      if (pilot) {
        const result = await createPilotOrder(answers, clientRequestId);
        reset();
        navigate(result.reportPath, { replace: true });
        return;
      }
      const session = await createCheckout(answers, clientRequestId);
      if (/^https?:\/\//.test(session.checkoutUrl)) {
        // Hosted checkout (live mode): leave the app.
        window.location.assign(session.checkoutUrl);
        return;
      }
      navigate(session.checkoutUrl);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
      setSubmitting(false);
    }
  };

  return (
    <div className="container container--form form-page page-enter">
      <div className="form-page__head">
        <span className="eyebrow">Almost there</span>
        <h1>Review your answers</h1>
        <p>
          Check everything is right. You can edit any section before paying. After payment, answers
          cannot be changed because research starts straight away.
        </p>
      </div>

      {invalid >= 0 && (
        <Notice tone="warning" title="Some answers are missing">
          <p>
            Step {invalid + 1} ({STEPS[invalid].shortTitle}) still has required fields.{' '}
            <Link to={`/validate/${invalid + 1}`}>Complete it now</Link>.
          </p>
        </Notice>
      )}

      <div style={{ marginTop: 'var(--space-6)' }}>
        {STEPS.flatMap((step, i) =>
          groupByQuestion(visibleFields(step, answers)).map((group) => (
            <section key={`${step.id}-${group.number}`} className="review-group" aria-labelledby={`review-q${group.number}`}>
              <div className="review-group__head">
                <h2 id={`review-q${group.number}`}>
                  {group.number}. {group.title ?? group.fields[0]?.label}
                </h2>
                <Link to={`/validate/${i + 1}`} className="review-group__edit">
                  Edit<span className="visually-hidden"> question {group.number}</span>
                </Link>
              </div>
              <dl className="review-list">
                {group.fields.map((field) => {
                  const { text, empty } = renderValue(field, answers);
                  return (
                    <div key={field.id} className="review-row">
                      <dt>{field.label.replace(/^Acknowledgement: /, 'Acknowledged: ')}</dt>
                      <dd className={empty ? 'is-empty' : ''}>{text}</dd>
                    </div>
                  );
                })}
              </dl>
            </section>
          )),
        )}
      </div>

      <form noValidate onSubmit={handleSubmit} style={{ marginTop: 'var(--space-10)' }}>
        <div className="card card--raised stack">
          {pilot && (
            <Notice tone="info" title="Owner pilot run" role="note">
              <p>
                No payment is taken. The real research pipeline runs and the report is delivered only to
                the pilot address configured on the server.
              </p>
            </Notice>
          )}
          <h2 style={{ fontSize: 'var(--text-xl)' }}>Where should we send the report?</h2>
          <p className="muted">
            We will email your private report link and PDF to <strong>{email || 'the address you gave'}</strong>.
            Type it again to make sure it is right; there is no account to log into if it is wrong.
          </p>
          <ConfirmEmailInput value={confirmEmail} error={confirmError} onChange={setConfirmEmail} />
          {submitError && (
            <Notice tone="danger" title="We could not start checkout" role="alert">
              <p>{submitError}</p>
            </Notice>
          )}
          <div className="form-actions" style={{ marginTop: 'var(--space-4)' }}>
            <Button variant="secondary" onClick={() => navigate(`/validate/${STEPS.length}`)}>
              Back
            </Button>
            <Button type="submit" size="lg" disabled={submitting}>
              {submitting ? (
                <>
                  <span className="spinner" aria-hidden="true" /> {pilot ? 'Starting pilot report…' : 'Preparing checkout…'}
                </>
              ) : pilot ? (
                <>Create pilot report (no payment)</>
              ) : (
                <>Continue to payment · {PRICE.display} one-time</>
              )}
            </Button>
          </div>
          <p className="small muted">
            {pilot ? (
              <>Pilot orders are recorded explicitly as unpaid owner tests.</>
            ) : DEMO_MODE ? (
              <>
                <DemoBadge /> No payment will be taken. The next screen simulates checkout.
              </>
            ) : (
              <>You will be taken to a secure checkout page to pay {PRICE.display} (one-time). {DELIVERY_COPY.short}</>
            )}
          </p>
        </div>
      </form>
    </div>
  );
}
