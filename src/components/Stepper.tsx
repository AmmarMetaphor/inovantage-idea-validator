import { Link } from 'react-router-dom';
import { STEPS } from '@/questionnaire/schema';

interface StepperProps {
  current: number;
  /** Highest step the customer may jump to. */
  furthest: number;
  completed: boolean[];
}

export function Stepper({ current, furthest, completed }: StepperProps) {
  const pct = Math.round(((current + 1) / STEPS.length) * 100);
  return (
    <nav className="stepper" aria-label="Questionnaire progress">
      <p className="stepper__summary">
        <span className="stepper__count">
          Step {current + 1} of {STEPS.length}
        </span>
        <span className="stepper__current">{STEPS[current].shortTitle}</span>
      </p>
      <div
        className="stepper__bar"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-label="Progress"
      >
        <span className="stepper__fill" style={{ width: `${pct}%` }} />
      </div>
      <ol className="stepper__list">
        {STEPS.map((step, i) => {
          const isCurrent = i === current;
          const reachable = i <= furthest;
          const state = isCurrent ? 'current' : completed[i] ? 'done' : reachable ? 'open' : 'locked';
          const content = (
            <>
              <span className="stepper__num" aria-hidden="true">
                {completed[i] && !isCurrent ? '✓' : i + 1}
              </span>
              <span className="stepper__label">{step.shortTitle}</span>
            </>
          );
          return (
            <li key={step.id} className={`stepper__item stepper__item--${state}`}>
              {reachable && !isCurrent ? (
                <Link to={`/validate/${i + 1}`} className="stepper__link">
                  {content}
                  <span className="visually-hidden">{completed[i] ? ', completed' : ''}</span>
                </Link>
              ) : (
                <span className="stepper__link" aria-current={isCurrent ? 'step' : undefined}>
                  {content}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
