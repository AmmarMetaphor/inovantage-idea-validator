import { useId, useState } from 'react';
import { JOURNEY_PHASES, PLAN_CAVEAT, PLAN_LABEL, SCENE_LABELS, sceneFor, type PhaseId, type SceneFamily } from '@/config/journey';
import type { Plan } from './types';

/** One original line-art scene as inline SVG; colours come from CSS classes so themes stay in tokens. */
export function SceneArt({ family, phase, className }: { family: SceneFamily; phase: PhaseId; className?: string }) {
  const scene = sceneFor(family, phase);
  return (
    <svg viewBox={scene.viewBox} className={`scene ${className ?? ''}`} role="img" aria-label={SCENE_LABELS[family][phase]} focusable="false">
      {scene.paths.map((p, i) => (
        <path key={i} d={p.d} className={`scene__${p.role}`} strokeWidth={p.width ?? 2} />
      ))}
    </svg>
  );
}

/**
 * "Your first four weeks in action": four illustrated milestones on a curved
 * path. Desktop: horizontal; mobile: stacked along a vertical path. Each
 * milestone is a real button that expands its detail (Enter/Space work
 * natively); the action and measure are always visible without hover.
 */
export function Journey({ plan, expansions, ideaName }: { plan: Plan; expansions?: string[]; ideaName?: string }) {
  const id = useId();
  const [open, setOpen] = useState<number | null>(null);
  return (
    <section className="journey" id="plan" aria-labelledby={`${id}-h`}>
      <div className="section-title">
        <p className="eyebrow eyebrow--gold">Suggested plan. Adapt the timing to your circumstances.</p>
        <h2 id={`${id}-h`}>{PLAN_LABEL}</h2>
        <p className="muted">
          Four suggested weeks to learn the most about {ideaName ? ideaName : 'this idea'} for the least money. Select a milestone to see what to record and how the result shapes the next decision.
        </p>
      </div>
      <ol className="journey__track" aria-label="Four weekly milestones">
        <svg className="journey__path" viewBox="0 0 1200 120" preserveAspectRatio="none" aria-hidden="true" focusable="false">
          <path d="M 150 56 C 250 16, 350 96, 450 56 S 650 16, 750 56 S 950 96, 1050 56" className="journey__curve" />
        </svg>
        <svg className="journey__path journey__path--vertical" viewBox="0 0 60 1000" preserveAspectRatio="none" aria-hidden="true" focusable="false">
          <path d="M 30 0 C 55 150, 5 300, 30 450 S 55 750, 30 1000" className="journey__curve" />
        </svg>
        {plan.weeks.map((w, i) => {
          const phase = JOURNEY_PHASES.find((p) => p.id === w.phase) ?? JOURNEY_PHASES[i];
          const expanded = open === i;
          const panelId = `${id}-w${w.week}`;
          return (
            <li key={w.week} className={`milestone milestone--${w.phase}`}>
              <div className="milestone__art">
                <SceneArt family={plan.scene_family} phase={w.phase} />
                <span className="milestone__num" aria-hidden="true">{w.week}</span>
              </div>
              <div className="milestone__text">
                <p className="milestone__week">Week {w.week} · {phase.title}</p>
                <p className="milestone__action">{w.action}</p>
                <p className="milestone__measure"><strong>Record:</strong> {w.measure}</p>
                <button type="button" className="milestone__toggle" aria-expanded={expanded} aria-controls={panelId} onClick={() => setOpen(expanded ? null : i)}>
                  {expanded ? 'Hide details' : 'Show details'}
                </button>
                <div id={panelId} className="milestone__detail" hidden={!expanded}>
                  <p><strong>Purpose:</strong> {phase.purpose}</p>
                  {w.detail && <p><strong>How the result informs the next step:</strong> {w.detail}</p>}
                  {expansions?.[i] && <p>{expansions[i]}</p>}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
      {plan.caveat && <p className="journey__caveat"><strong>Timing note:</strong> {plan.caveat}</p>}
      <p className="small muted">{PLAN_CAVEAT} A four-week period is a suggested starting point, not a launch schedule; nothing here promises sales, demand or a change in score.</p>
    </section>
  );
}
