import { useEffect, useRef, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { Button } from '@/components/Button';
import { Notice } from '@/components/Notice';
import { FieldRenderer } from '@/components/fields';
import { Stepper } from '@/components/Stepper';
import { usePageTitle } from '@/components/usePageTitle';
import { MARKETS } from '@/config/product';
import { asString } from '@/questionnaire/helpers';
import { groupByQuestion, QUESTION_COUNT, STEPS, visibleFields } from '@/questionnaire/schema';
import { useQuestionnaire } from '@/questionnaire/store';
import type { AnswerValue, StepErrors } from '@/questionnaire/types';
import { isStepComplete, validateStep } from '@/questionnaire/validate';

export function QuestionnairePage() {
  const { step: stepParam } = useParams();
  const navigate = useNavigate();
  const { answers, furthestStep, setAnswer, setAnswers, reachStep, pilot } = useQuestionnaire();

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

  // Currency follows the chosen market (set on country change; backfilled here for restored drafts).
  useEffect(() => {
    if (asString(answers.country) && !asString(answers.currency)) {
      const market = MARKETS.find((m) => m.code === asString(answers.country));
      if (market) setAnswers({ currency: market.currency });
    }
  }, [answers.currency, answers.country, setAnswers]);

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
        {pilot && step.id === 'final' && (
          <Notice tone="info" title="Owner pilot" role="note">
            <p>The server will only deliver pilot reports to the configured pilot address; other addresses are refused.</p>
          </Notice>
        )}
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

        {groupByQuestion(fields).map((group, gi) => {
          const multi = group.fields.length > 1;
          const inner = group.fields.map((field) => (
            <div key={field.id} className={`field-wrap ${field.type === 'checkbox' ? 'field-wrap--checkbox' : ''}`}>
              <FieldRenderer field={field} answers={answers} error={errors[field.id]} onChange={handleChange} />
            </div>
          ));
          if (group.number === null) return <div key={gi}>{inner}</div>;
          const legend = (
            <>
              <span className="question__num" aria-hidden="true">{group.number}</span>
              <span>
                <span className="visually-hidden">Question {group.number} of {QUESTION_COUNT}. </span>
                {group.title}
              </span>
            </>
          );
          return multi ? (
            <fieldset key={gi} className="question question--multi">
              <legend className="question__legend">{legend}</legend>
              {group.help && <p className="question__help">{group.help}</p>}
              <div className="question__fields">{inner}</div>
            </fieldset>
          ) : (
            <div key={gi} className="question">
              <p className="question__legend" aria-hidden="true">{legend}</p>
              {group.help && <p className="question__help">{group.help}</p>}
              <div className="question__fields">{inner}</div>
            </div>
          );
        })}

        <div className="form-actions">
          <Button variant="secondary" onClick={handleBack}>
            {stepIndex === 0 ? 'Back to home' : 'Back'}
          </Button>
          <Button type="submit">{isLast ? 'Review my answers' : 'Continue'}</Button>
        </div>
        <p className="form-actions__note" style={{ marginTop: 'var(--space-4)' }}>
          Your draft is kept in this browser tab until you submit or close the tab. Nothing is saved to
          your device beyond that.
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
