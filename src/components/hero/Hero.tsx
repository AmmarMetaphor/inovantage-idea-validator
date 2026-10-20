import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { ButtonLink } from '@/components/Button';
import { SceneArt } from '@/components/report/Journey';
import { JOURNEY_PHASES, PLAN_CAVEAT, PLAN_LABEL } from '@/config/journey';
import { PRICE } from '@/config/product';
import { HERO_EXAMPLE_ORDER, HERO_EXAMPLES, HERO_SAMPLE_SCORE, type HeroExample, type HeroExampleId } from '@/content/hero-examples';

/* ---------------------------------------------------------------------------
   Motion control: one state for the whole hero. Continuous movement runs
   only while the visitor has not paused it, the hero is on screen and the
   tab is visible. Reduced motion starts paused; the Play control can still
   opt in. Nothing animates values, progress or status.
--------------------------------------------------------------------------- */
function useHeroMotion(ref: React.RefObject<HTMLElement | null>) {
  const [playing, setPlaying] = useState(() => typeof window === 'undefined' || !window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [inView, setInView] = useState(true);
  const [visible, setVisible] = useState(() => typeof document === 'undefined' || document.visibilityState !== 'hidden');
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), { threshold: 0.05 });
    io.observe(el);
    return () => io.disconnect();
  }, [ref]);
  useEffect(() => {
    const onVis = () => setVisible(document.visibilityState !== 'hidden');
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);
  return { playing, toggle: () => setPlaying((p) => !p), active: playing && inView && visible };
}

/* ---------------------------------------------------------------------------
   Central illustration: lightbulb, halo, globe lines, orbits with a few
   travelling dots, and curved connections toward the preview panels.
   Pure SVG + CSS animation; no canvas, no library.
--------------------------------------------------------------------------- */
const CX = 330;
const CY = 232;
const ORBITS = [
  { rx: 250, ry: 92, rot: -16, dots: [{ dur: 24, delay: -3, tone: 'amber' }, { dur: 24, delay: -15, tone: 'teal' }] },
  { rx: 300, ry: 142, rot: 14, dots: [{ dur: 30, delay: -8, tone: 'teal' }, { dur: 30, delay: -22, tone: 'amber' }] },
  { rx: 180, ry: 186, rot: 0, dots: [{ dur: 19, delay: -5, tone: 'teal' }] },
] as const;
const CONNECTIONS = [
  { d: 'M 300 160 C 240 110, 200 96, 150 84', delay: 0 },
  { d: 'M 372 150 C 440 100, 500 80, 560 66', delay: 1.6 },
  { d: 'M 400 230 C 470 236, 540 262, 610 278', delay: 3.2 },
  { d: 'M 296 300 C 250 350, 210 380, 150 404', delay: 4.8 },
] as const;

function orbitPath(rx: number, ry: number) {
  return `M ${CX - rx} ${CY} a ${rx} ${ry} 0 1 0 ${2 * rx} 0 a ${rx} ${ry} 0 1 0 ${-2 * rx} 0`;
}

function IdeaVisual() {
  const gid = useId().replace(/[^a-zA-Z0-9]/g, '');
  return (
    <svg className="idea" viewBox="0 0 720 480" aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id={`${gid}-halo`}>
          <stop offset="0" stopColor="var(--color-teal-300)" stopOpacity="0.55" />
          <stop offset="0.55" stopColor="var(--color-teal-500)" stopOpacity="0.18" />
          <stop offset="1" stopColor="var(--color-teal-500)" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${gid}-glow`}>
          <stop offset="0" stopColor="var(--color-amber-300)" stopOpacity="0.55" />
          <stop offset="1" stopColor="var(--color-amber-300)" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${gid}-glass`} cx="0.4" cy="0.35" r="0.7">
          <stop offset="0" stopColor="#fff4cf" />
          <stop offset="0.45" stopColor="var(--color-amber-300)" />
          <stop offset="1" stopColor="var(--color-amber-500)" />
        </radialGradient>
      </defs>
      {/* Halo and globe */}
      <circle className="idea__halo hero-anim" cx={CX} cy={CY} r={150} fill={`url(#${gid}-halo)`} />
      <g className="idea__globe">
        <circle cx={CX} cy={CY} r={112} />
        <ellipse cx={CX} cy={CY} rx={52} ry={112} />
        <ellipse cx={CX} cy={CY} rx={112} ry={42} />
        <ellipse cx={CX} cy={CY} rx={112} ry={84} />
      </g>
      {/* Orbits with travelling dots */}
      {ORBITS.map((o, i) => (
        <g key={i} className="idea__orbit" transform={`rotate(${o.rot} ${CX} ${CY})`}>
          <ellipse cx={CX} cy={CY} rx={o.rx} ry={o.ry} />
          {o.dots.map((d, j) => (
            <circle
              key={j}
              className={`idea__dot idea__dot--${d.tone} hero-anim`}
              cx={CX - o.rx}
              cy={CY}
              r={4}
              style={{ offsetPath: `path('${orbitPath(o.rx, o.ry)}')`, animationDuration: `${d.dur}s`, animationDelay: `${d.delay}s` } as CSSProperties}
            />
          ))}
        </g>
      ))}
      {/* Connections toward the preview panels, each with a travelling highlight */}
      {CONNECTIONS.map((c, i) => (
        <g key={i} className="idea__link">
          <path d={c.d} className="idea__link-base" />
          <path d={c.d} className="idea__link-glow hero-anim" pathLength={100} style={{ animationDelay: `${c.delay}s` }} />
          <circle className="idea__node" r={4} cx={Number(c.d.split(' ').at(-2))} cy={Number(c.d.split(' ').at(-1))} />
        </g>
      ))}
      {/* Lightbulb */}
      <circle className="idea__glow hero-anim" cx={CX} cy={CY - 14} r={92} fill={`url(#${gid}-glow)`} />
      <g className="idea__bulb">
        <path d={`M ${CX - 46} ${CY - 20} a 46 46 0 1 1 92 0 c 0 20 -10 30 -18 42 l -4 18 h -48 l -4 -18 c -8 -12 -18 -22 -18 -42 Z`} fill={`url(#${gid}-glass)`} />
        <path className="idea__filament" d={`M ${CX - 10} ${CY + 16} v -14 l 5 -8 l 5 8 l 5 -8 l 5 8 v 14`} />
        <rect x={CX - 24} y={CY + 42} width={48} height={8} rx={2} className="idea__cap" />
        <rect x={CX - 20} y={CY + 52} width={40} height={7} rx={2} className="idea__cap" />
        <rect x={CX - 16} y={CY + 61} width={32} height={6} rx={2} className="idea__cap" />
        <rect x={CX - 9} y={CY + 69} width={18} height={6} rx={3} className="idea__cap idea__cap--tip" />
      </g>
      {/* A few resting sparks */}
      <g className="idea__sparks">
        <circle cx={118} cy={300} r={3} /><circle cx={560} cy={150} r={2.5} /><circle cx={240} cy={420} r={2} /><circle cx={640} cy={430} r={2.5} /><circle cx={80} cy={160} r={2} />
      </g>
    </svg>
  );
}

/* ---------------------------------------------------------------------------
   Preview panels: real HTML text, labelled illustrative.
--------------------------------------------------------------------------- */
function Avatar({ tone }: { tone: 'teal' | 'amber' | 'navy' }) {
  return (
    <svg viewBox="0 0 40 40" className={`avatar avatar--${tone}`} aria-hidden="true" focusable="false">
      <circle cx="20" cy="20" r="20" className="avatar__bg" />
      <circle cx="20" cy="15" r="7" className="avatar__skin" />
      <path d="M 13 14 a 7 7 0 0 1 14 0 Z" className="avatar__hair" />
      <path d="M 8 36 a 12 12 0 0 1 24 0 Z" className="avatar__shirt" />
    </svg>
  );
}

function ScoreMini() {
  const r = 26;
  const c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 64 64" className="score-mini" aria-hidden="true" focusable="false">
      <circle cx="32" cy="32" r={r} className="score-mini__track" />
      <circle cx="32" cy="32" r={r} className="score-mini__arc" strokeDasharray={`${(c * HERO_SAMPLE_SCORE) / 100} ${c}`} transform="rotate(-90 32 32)" />
    </svg>
  );
}

function Previews({ ex }: { ex: HeroExample }) {
  return (
    <>
      <article className="preview preview--insights hero-anim" aria-label="Market insights preview">
        <p className="preview__title"><span className="preview__icon" aria-hidden="true">⌕</span> Market insights</p>
        <p className="preview__sub">Discover your opportunity</p>
        <p className="preview__body">{ex.opportunity}</p>
        <div className="preview__chart" aria-hidden="true">
          {ex.bars.map((h, i) => <span key={i} style={{ height: `${h}%` }} />)}
        </div>
        <p className="preview__tag">Illustrative chart, not data</p>
      </article>
      <article className="preview preview--score hero-anim" aria-label="Sample idea score preview">
        <div className="preview__score">
          <ScoreMini />
          <p className="preview__score-num"><strong>{HERO_SAMPLE_SCORE}</strong><span>/100</span></p>
        </div>
        <div>
          <p className="preview__title">Sample idea score</p>
          <p className="preview__tag">Illustrative sample</p>
          <p className="preview__body preview__body--xs">Not a promised score. Real scores come from nine criteria and the evidence found.</p>
        </div>
      </article>
      <article className="preview preview--customers hero-anim" aria-label="Customer clarity preview">
        <p className="preview__title">Customer clarity</p>
        <ul className="preview__people">
          {ex.customers.map((c) => (
            <li key={c.who}>
              <Avatar tone={c.tone} />
              <span><strong>{c.who}</strong> {c.need}</span>
            </li>
          ))}
        </ul>
      </article>
      <article className="preview preview--steps hero-anim" aria-label="Your next steps preview">
        <p className="preview__title">Your next steps</p>
        <ol className="preview__steps">
          {ex.nextSteps.map((s, i) => (
            <li key={s}><span className="preview__num" aria-hidden="true">{i + 1}</span>{s}</li>
          ))}
        </ol>
      </article>
    </>
  );
}

/* ---------------------------------------------------------------------------
   Example selector: native buttons with aria-pressed; local state only.
--------------------------------------------------------------------------- */
const ICONS: Record<HeroExampleId, string> = {
  product: 'M 4 7 l 8 -4 l 8 4 v 10 l -8 4 l -8 -4 Z M 4 7 l 8 4 l 8 -4 M 12 11 v 10',
  service: 'M 9 11 a 3.5 3.5 0 1 0 0 -7 a 3.5 3.5 0 0 0 0 7 Z M 2 20 a 7 7 0 0 1 14 0 M 16 4.5 a 3.5 3.5 0 0 1 0 6.5 M 18 13 a 6 6 0 0 1 4 6',
  software: 'M 3 5 h 18 v 11 h -18 Z M 1 19 h 22 M 9 8 h 6',
};

function ExampleSelector({ selected, onSelect }: { selected: HeroExampleId; onSelect: (id: HeroExampleId) => void }) {
  return (
    <div className="examples" role="group" aria-label="Try an example">
      <p className="examples__label" id="examples-label">Try an example</p>
      <div className="examples__row">
        {HERO_EXAMPLE_ORDER.map((id) => (
          <button key={id} type="button" className="example" aria-pressed={selected === id} onClick={() => onSelect(id)}>
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d={ICONS[id]} /></svg>
            <span>{HERO_EXAMPLES[id].label}</span>
            <span className="example__chev" aria-hidden="true">›</span>
          </button>
        ))}
      </div>
      <p className="examples__current small" aria-live="polite">Showing: {HERO_EXAMPLES[selected].name}. {HERO_EXAMPLES[selected].summary}</p>
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Compact four-week journey for the hero (scenes from the vetted library).
--------------------------------------------------------------------------- */
function HeroJourney({ ex }: { ex: HeroExample }) {
  return (
    <section className="hero-journey" aria-labelledby="hero-journey-h">
      <div className="hero-journey__head">
        <h2 id="hero-journey-h" className="hero-journey__title">{PLAN_LABEL}</h2>
        <p className="hero-journey__caveat">{PLAN_CAVEAT}</p>
      </div>
      <ol className="hero-journey__track">
        <svg className="hero-journey__path" viewBox="0 0 1200 60" preserveAspectRatio="none" aria-hidden="true" focusable="false">
          <path d="M 150 40 C 250 10, 350 50, 450 30 S 650 10, 750 30 S 950 50, 1050 20" />
        </svg>
        {JOURNEY_PHASES.map((p, i) => (
          <li key={p.id} className="hero-milestone">
            <div className="hero-milestone__art"><SceneArt family={ex.family} phase={p.id} /></div>
            <p className="hero-milestone__title"><span className="hero-milestone__num" aria-hidden="true">{i + 1}</span>{p.title}</p>
            <p className="hero-milestone__action">{ex.weeks[i]}</p>
          </li>
        ))}
      </ol>
      <p className="small hero-journey__more"><Link to="/sample-report#plan">See the full four-week plan in the sample report</Link></p>
    </section>
  );
}

/* ---------------------------------------------------------------------------
   Process strip: an explanation, never a status.
--------------------------------------------------------------------------- */
const PROCESS = ['Your idea', 'Market research', 'Your report', 'Your next move'];
function ProcessStrip() {
  return (
    <div className="process" aria-labelledby="process-h">
      <p id="process-h" className="process__label">How it works</p>
      <ol className="process__list">
        {PROCESS.map((s) => <li key={s} className="process__item"><span className="process__dot" aria-hidden="true" />{s}</li>)}
      </ol>
      <p className="small process__note"><Link to="/#how-it-works">Read how each step works</Link></p>
    </div>
  );
}

/* ---------------------------------------------------------------------------
   The hero
--------------------------------------------------------------------------- */
export function Hero() {
  const ref = useRef<HTMLElement | null>(null);
  const motion = useHeroMotion(ref);
  const [selected, setSelected] = useState<HeroExampleId>('product');
  const ex = HERO_EXAMPLES[selected];
  return (
    <section ref={ref} className="hero section--dark" data-motion={motion.active ? 'on' : 'off'} aria-labelledby="hero-h">
      <div className="container hero__inner">
        <div className="hero__copy">
          <p className="eyebrow hero__eyebrow">From what if to what next</p>
          <h1 id="hero-h" className="hero__title">Your next big idea<br />starts with a <span className="hero__highlight">little proof.</span></h1>
          <p className="lead hero__lead">Explore the opportunity. Understand your market. Find your next move.</p>
          <div className="hero__actions">
            <ButtonLink to="/validate" variant="teal" size="lg">Explore my idea <span aria-hidden="true">→</span></ButtonLink>
            <ButtonLink to="/sample-report" variant="secondary" size="lg">See it in action</ButtonLink>
          </div>
          <p className="hero__facts">8 questions · {PRICE.display} per report · No account needed</p>
          <p className="hero__facts-sub small">Payment follows the form.</p>
          <ExampleSelector selected={selected} onSelect={setSelected} />
        </div>
        <div className="hero__visual">
          <div className="hero__stage">
            <IdeaVisual />
            <Previews ex={ex} />
            <div className="hero__stage-bar">
              <p className="hero__stage-label">Sample report preview · {ex.name}</p>
              <button type="button" className="hero__motion" onClick={motion.toggle}>
                {motion.playing ? 'Pause animation' : 'Play animation'}
              </button>
            </div>
          </div>
          <HeroJourney ex={ex} />
        </div>
      </div>
      <div className="container">
        <ProcessStrip />
      </div>
    </section>
  );
}
