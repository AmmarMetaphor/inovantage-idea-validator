import { useEffect, useRef, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { Button } from '@/components/Button';
import { FieldRenderer } from '@/components/fields';
import { Stepper } from '@/components/Stepper';
import { usePageTitle } from '@/components/usePageTitle';
import { MARKETS } from '@/config/product';
import { asString } from '@/questionnaire/helpers';
import { STEPS, visibleFields } from '@/questionnaire/schema';
import { useQuestionnaire } from '@/questionnaire/store';
import type { AnswerValue, StepErrors } from '@/questionnaire/types';
import { isStepComplete, validateStep } from '@/questionnaire/validate';

export function QuestionnairePage() {
  const { step: stepParam } = useParams();
  const navigate = useNavigate();
  const { answers, furthestStep, setAnswer, setAnswers, reachStep } = useQuestionnaire();

  const stepNumber = Number(stepParam ?? '1');
  const stepIndex = Number.isInteger(stepNumber) ? stepNumber - 1 : -1;
  const step = STEPS[stepIndex];

  const [errors, setErrors] = useState<StepErrors>({});
  const [attempted, setAttempted] = useState(false);
  const summaryRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  usePageTitle(step ? `Step ${stepIndex + 1}: ${step.shortTitle}` : 'Questionnaire');

  // Reset validation state and move focus when the step changes.
  useEffect(() => {
    setErrors({});
    setAttempted(false);
    headingRef.current?.focus();
  }, [stepIndex]);

  // Default currency from the chosen market the first time pricing is reached.
  useEffect(() => {
    if (step?.id === 'pricing' && !asString(answers.currency)) {
      const market = MARKETS.find((m) => m.code === asString(answers.country));
      if (market) setAnswers({ currency: market.currency });
    }
  }, [step?.id, answers.currency, answers.country, setAnswers]);

  if (!step) return <Navigate to="/validate/1" replace />;

  // Prevent skipping ahead past unreached steps via the URL.
  if (stepIndex > furthestStep) {
    return <Navigate to={`/validate/${furthestStep + 1}`} replace />;
  }

  const fields = visibleFields(step, answers);
  const isLast = stepIndex === STEPS.length - 1;
  const completed = STEPS.map((_, i) => isStepComplete(i, answers));

  const handleChange = (id: string, value: AnswerValue | undefined) => {
    setAnswer(id, value);
    if (id === 'country') {
      // Default the pricing currency to the chosen market; the customer can
      // still change it on the pricing step.
      const market = MARKETS.find((m) => m.code === value);
      if (market) setAnswer('currency', market.currency);
    }
    if (attempted) {
      // Re-validate live once the customer has tried to continue.
      const next = validateStep(stepIndex, { ...answers, [id]: value });
      setErrors(next);
    }
  };

  const handleNext = (e: React.FormEvent) => {
    e.preventDefault();
    const next = validateStep(stepIndex, answers);
    setErrors(next);
    setAttempted(true);
    if (Object.keys(next).length > 0) {
      requestAnimationFrame(() => summaryRef.current?.focus());
      return;
    }
    reachStep(stepIndex + 1);
    if (isLast) navigate('/review');
    else navigate(`/validate/${stepIndex + 2}`);
  };

  const handleBack = () => {
    if (stepIndex === 0) navigate('/');
    else navigate(`/validate/${stepIndex}`);
  };

  const errorEntries = Object.entries(errors);

  return (
    <div className="container container--form form-page page-enter">
      <Stepper current={stepIndex} furthest={furthestStep} completed={completed} />

      <div className="form-page__head">
        <h1 ref={headingRef} tabIndex={-1}>
          {step.title}
        </h1>
        <p>{step.intro}</p>
      </div>

      <form noValidate onSubmit={handleNext}>
        {errorEntries.length > 0 && (
          <div
            ref={summaryRef}
            className="error-summary"
            tabIndex={-1}
            role="alert"
            aria-labelledby="error-summary-title"
          >
            <h2 id="error-summary-title" className="error-summary__title">
              {errorEntries.length === 1
                ? 'There is a problem with one answer'
                : `There are problems with ${errorEntries.length} answers`}
            </h2>
            <ul>
              {errorEntries.map(([id, message]) => {
                const field = step.fields.find((f) => f.id === id);
                return (
                  <li key={id}>
                    <a href={`#${id}`} onClick={(ev) => focusField(ev, id)}>
                      {field?.label ?? id}
                    </a>
                    : {message}
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {fields.map((field) => (
          <div key={field.id} className={`field-wrap ${field.type === 'checkbox' ? 'field-wrap--checkbox' : ''}`}>
            {field.sectionHeading && (
              <div className="form-section">
                <h2 className="form-section__title">{field.sectionHeading}</h2>
                {field.sectionIntro && <p className="form-section__intro">{field.sectionIntro}</p>}
              </div>
            )}
            <FieldRenderer field={field} answers={answers} error={errors[field.id]} onChange={handleChange} />
          </div>
        ))}

        <div className="form-actions">
          <Button variant="secondary" onClick={handleBack}>
            {stepIndex === 0 ? 'Back to home' : 'Back'}
          </Button>
          <Button type="submit">{isLast ? 'Review my answers' : 'Continue'}</Button>
        </div>
        <p className="form-actions__note" style={{ marginTop: 'var(--space-4)' }}>
          Your answers are kept in this browser tab only until you submit. Nothing is saved to your
          device.
        </p>
      </form>
    </div>
  );
}

function focusField(ev: React.MouseEvent, id: string) {
  ev.preventDefault();
  const el =
    document.getElementById(id) ??
    (document.querySelector(`[name="${id}"]`) as HTMLElement | null);
  if (el) {
    el.scrollIntoView({ block: 'center' });
    el.focus();
  }
}
