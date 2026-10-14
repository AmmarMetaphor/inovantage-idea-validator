import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { Button } from '@/components/Button';
import { DemoBadge } from '@/components/DemoBadge';
import { ConfirmEmailInput } from '@/components/fields';
import { Notice } from '@/components/Notice';
import { usePageTitle } from '@/components/usePageTitle';
import { currencySymbol, DEMO_MODE, PRICE } from '@/config/product';
import { createCheckout } from '@/lib/api';
import { asArray, asBool, asEstimate, asString, formatNumber, parseNumberInput } from '@/questionnaire/helpers';
import { optionLabel, STEPS, visibleFields } from '@/questionnaire/schema';
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
    case 'radio': {
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
      if (est.unknown) return { text: 'Unknown (to be researched)', empty: false };
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
  const { answers, furthestStep, markReviewed } = useQuestionnaire();
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
      const session = await createCheckout(answers);
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
        {STEPS.map((step, i) => {
          const fields = visibleFields(step, answers);
          return (
            <section key={step.id} className="review-group" aria-labelledby={`review-${step.id}`}>
              <div className="review-group__head">
                <h2 id={`review-${step.id}`}>
                  {i + 1}. {step.shortTitle}
                </h2>
                <Link to={`/validate/${i + 1}`} className="review-group__edit">
                  Edit<span className="visually-hidden"> {step.shortTitle}</span>
                </Link>
              </div>
              <dl className="review-list">
                {fields.map((field) => {
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
          );
        })}
      </div>

      <form noValidate onSubmit={handleSubmit} style={{ marginTop: 'var(--space-10)' }}>
        <div className="card card--raised stack">
          <h2 style={{ fontSize: 'var(--text-xl)' }}>Where should we send the report?</h2>
          <p className="muted">
            We will email the report link and PDF to <strong>{email || 'the address you gave'}</strong>.
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
                  <span className="spinner" aria-hidden="true" /> Preparing checkout…
                </>
              ) : (
                <>Continue to payment · {PRICE.display}</>
              )}
            </Button>
          </div>
          <p className="small muted">
            {DEMO_MODE ? (
              <>
                <DemoBadge /> No payment will be taken. The next screen simulates checkout.
              </>
            ) : (
              <>You will be taken to a secure checkout page to pay {PRICE.display}.</>
            )}
          </p>
        </div>
      </form>
    </div>
  );
}
