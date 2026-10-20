import { useId, useState } from 'react';
import { JOURNEY_PHASES, PLAN_CAVEAT, PLAN_EYEBROW, PLAN_LABEL, PLAN_TIMING, SCENE_LABELS, sceneFor, type PhaseId, type SceneFamily } from '@/config/journey';
import type { Plan } from './types';

/**
 * One original flat-style scene as inline SVG. Colours come from CSS classes
 * (tokens), the geometry from the vetted library in src/config/journey.ts;
 * nothing here is model output.
 */
export function SceneArt({ family, phase, className }: { family: SceneFamily; phase: PhaseId; className?: string }) {
  const scene = sceneFor(family, phase);
  return (
    <svg viewBox={scene.viewBox} className={`scene ${className ?? ''}`} role="img" aria-label={SCENE_LABELS[family][phase]} focusable="false">
      {scene.paths.map((p, i) => (
        <path key={i} d={p.d} className={`${p.fill ? `scene__fill-${p.fill}` : ''} ${p.stroke ? `scene__stroke-${p.stroke}` : ''}`.trim()} strokeWidth={p.stroke ? (p.width ?? 2) : undefined} />
      ))}
    </svg>
  );
}

/**
 * "Your first four weeks in action": four illustrated milestones joined by a
 * flowing dotted path. Desktop: a horizontal row with the path running
 * through the numbered badges under the scenes; mobile: a vertical timeline.
 * Each milestone's action and measure are always visible; a real button
 * expands the detail (Enter and Space work natively).
 */
export function Journey({ plan, expansions, ideaName }: { plan: Plan; expansions?: string[]; ideaName?: string }) {
  const id = useId();
  const [open, setOpen] = useState<number | null>(null);
  return (
    <section className="journey" id="plan" aria-labelledby={`${id}-h`}>
      <div className="section-title">
        <p className="eyebrow journey__eyebrow">{PLAN_EYEBROW}</p>
        <h2 id={`${id}-h`} className="journey__title">{PLAN_LABEL}</h2>
        <p className="muted journey__intro">
          Four suggested weeks to learn the most about {ideaName ? ideaName : 'this idea'} for the least money. Select a milestone for what to record and how the result shapes the next decision.
        </p>
      </div>
      <ol className="journey__track" aria-label="Four weekly milestones">
        <svg className="journey__path" viewBox="0 0 1200 100" preserveAspectRatio="none" aria-hidden="true" focusable="false">
          <path d="M -20 70 C 60 70, 100 20, 150 50 S 300 90, 450 50 S 600 10, 750 50 S 900 90, 1050 50 S 1180 20, 1220 40" className="journey__curve" />
        </svg>
        <svg className="journey__path journey__path--vertical" viewBox="0 0 40 1000" preserveAspectRatio="none" aria-hidden="true" focusable="false">
          <path d="M 20 0 C 32 150, 8 300, 20 450 S 32 750, 20 1000" className="journey__curve" />
        </svg>
        {plan.weeks.map((w, i) => {
          const phase = JOURNEY_PHASES.find((p) => p.id === w.phase) ?? JOURNEY_PHASES[i];
          const expanded = open === i;
          const panelId = `${id}-w${w.week}`;
          return (
            <li key={w.week} className={`milestone milestone--${w.phase}`}>
              <div className="milestone__art">
                <SceneArt family={plan.scene_family} phase={w.phase} />
              </div>
              <div className="milestone__badge">
                <span className="milestone__num" aria-hidden="true">{String(w.week).padStart(2, '0')}</span>
                <span className="milestone__week">Week {w.week}</span>
              </div>
              <div className="milestone__text">
                <h3 className="milestone__title">{phase.title}</h3>
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
      <p className="small muted journey__footer"><strong>{PLAN_CAVEAT}</strong> {PLAN_TIMING} Nothing here promises sales, demand or a change in score.</p>
    </section>
  );
}
