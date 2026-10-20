import { useEffect, useId, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { Link } from 'react-router-dom';
import { ButtonLink } from '@/components/Button';
import { SceneArt } from '@/components/report/Journey';
import { JOURNEY_PHASES, PLAN_LABEL } from '@/config/journey';
import { HERO_EXAMPLE_ORDER, HERO_EXAMPLES, type HeroExample, type HeroExampleId } from '@/content/hero-examples';

/* ---------------------------------------------------------------------------
   Illumination: the illustration rests in a polished static state. It lights
   up while the pointer is over it, or when the bulb control is toggled
   (keyboard, tap). Decorative movement runs only while lit, on screen and in
   a visible tab; under reduced motion only the glow changes.
--------------------------------------------------------------------------- */
function useIllumination(ref: React.RefObject<HTMLElement | null>) {
  const [toggled, setToggled] = useState(false);
  const [hover, setHover] = useState(false);
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
  const onPointerEnter = (e: ReactPointerEvent) => { if (e.pointerType === 'mouse') setHover(true); };
  const onPointerLeave = (e: ReactPointerEvent) => { if (e.pointerType === 'mouse') setHover(false); };
  return { lit: toggled || hover, toggled, toggle: () => setToggled((t) => !t), active: inView && visible, onPointerEnter, onPointerLeave };
}

/* ---------------------------------------------------------------------------
   Central illustration: lightbulb, halo, globe lines and orbits with a few
   dots that travel only while lit. Pure SVG + CSS; no canvas, no library.
--------------------------------------------------------------------------- */
const CX = 360;
const CY = 240;
const ORBITS = [
  { rx: 262, ry: 96, rot: -16, dots: [{ dur: 22, delay: -3, tone: 'amber' }, { dur: 22, delay: -14, tone: 'teal' }] },
  { rx: 318, ry: 150, rot: 14, dots: [{ dur: 28, delay: -8, tone: 'teal' }, { dur: 28, delay: -21, tone: 'amber' }] },
  { rx: 176, ry: 182, rot: 0, dots: [{ dur: 18, delay: -5, tone: 'teal' }] },
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
          <stop offset="0" stopColor="var(--color-amber-300)" stopOpacity="0.6" />
          <stop offset="1" stopColor="var(--color-amber-300)" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${gid}-glass`} cx="0.4" cy="0.35" r="0.7">
          <stop offset="0" stopColor="#fff4cf" />
          <stop offset="0.45" stopColor="var(--color-amber-300)" />
          <stop offset="1" stopColor="var(--color-amber-500)" />
        </radialGradient>
      </defs>
      <circle className="idea__halo" cx={CX} cy={CY} r={150} fill={`url(#${gid}-halo)`} />
      <g className="idea__globe">
        <circle cx={CX} cy={CY} r={112} />
        <ellipse cx={CX} cy={CY} rx={52} ry={112} />
        <ellipse cx={CX} cy={CY} rx={112} ry={42} />
        <ellipse cx={CX} cy={CY} rx={112} ry={84} />
      </g>
      {ORBITS.map((o, i) => (
        <g key={i} className="idea__orbit" transform={`rotate(${o.rot} ${CX} ${CY})`}>
          <ellipse cx={CX} cy={CY} rx={o.rx} ry={o.ry} />
          {o.dots.map((d, j) => (
            <circle
              key={j}
              className={`idea__dot idea__dot--${d.tone}`}
              cx={CX - o.rx}
              cy={CY}
              r={4}
              style={{ offsetPath: `path('${orbitPath(o.rx, o.ry)}')`, animationDuration: `${d.dur}s`, animationDelay: `${d.delay}s` } as CSSProperties}
            />
          ))}
        </g>
      ))}
      <circle className="idea__glow" cx={CX} cy={CY - 14} r={96} fill={`url(#${gid}-glow)`} />
      <g className="idea__bulb">
        <path d={`M ${CX - 46} ${CY - 20} a 46 46 0 1 1 92 0 c 0 20 -10 30 -18 42 l -4 18 h -48 l -4 -18 c -8 -12 -18 -22 -18 -42 Z`} fill={`url(#${gid}-glass)`} />
        <path className="idea__filament" d={`M ${CX - 10} ${CY + 16} v -14 l 5 -8 l 5 8 l 5 -8 l 5 8 v 14`} />
        <rect x={CX - 24} y={CY + 42} width={48} height={8} rx={2} className="idea__cap" />
        <rect x={CX - 20} y={CY + 52} width={40} height={7} rx={2} className="idea__cap" />
        <rect x={CX - 16} y={CY + 61} width={32} height={6} rx={2} className="idea__cap" />
        <rect x={CX - 9} y={CY + 69} width={18} height={6} rx={3} className="idea__cap idea__cap--tip" />
      </g>
      <g className="idea__sparks">
        <circle cx={128} cy={300} r={3} /><circle cx={590} cy={150} r={2.5} /><circle cx={250} cy={420} r={2} /><circle cx={660} cy={430} r={2.5} /><circle cx={90} cy={160} r={2} />
      </g>
    </svg>
  );
}

/* ---------------------------------------------------------------------------
   Compact preview panels: real HTML, decorative graphics without numbers.
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

function PanelIcon({ d }: { d: string }) {
  return (
    <span className="panel__icon" aria-hidden="true">
      <svg viewBox="0 0 24 24" focusable="false"><path d={d} /></svg>
    </span>
  );
}

const ICON_SEARCH = 'M 10.5 4 a 6.5 6.5 0 1 0 0 13 a 6.5 6.5 0 0 0 0 -13 Z M 15.5 15.5 l 5 5';
const ICON_LIST = 'M 4 6 h 2 M 9 6 h 11 M 4 12 h 2 M 9 12 h 11 M 4 18 h 2 M 9 18 h 11';
const ICON_PEOPLE = 'M 9 11 a 3.5 3.5 0 1 0 0 -7 a 3.5 3.5 0 0 0 0 7 Z M 2 20 a 7 7 0 0 1 14 0 M 16 4.5 a 3.5 3.5 0 0 1 0 6.5 M 18 13 a 6 6 0 0 1 4 6';

function Panels({ ex }: { ex: HeroExample }) {
  return (
    <>
      <article className="panel panel--insights" aria-label="Market insights preview">
        <PanelIcon d={ICON_SEARCH} />
        <p className="panel__title">Market insights</p>
        <span className="panel__chart" aria-hidden="true">{ex.bars.map((h, i) => <span key={i} style={{ height: `${h}%` }} />)}</span>
      </article>
      <article className="panel panel--potential" aria-label="Idea potential preview">
        <svg viewBox="0 0 64 64" className="panel__ring" aria-hidden="true" focusable="false">
          <circle cx="32" cy="32" r="26" className="panel__ring-track" />
          <circle cx="32" cy="32" r="26" className="panel__ring-arc" />
        </svg>
        <div>
          <p className="panel__title">Idea potential</p>
          <p className="panel__sub">Explore the possibilities</p>
        </div>
      </article>
      <article className="panel panel--steps" aria-label="Your next steps preview">
        <PanelIcon d={ICON_LIST} />
        <div className="panel__col">
          <p className="panel__title">Your next steps</p>
          <ol className="panel__steps">
            {ex.stepsShort.map((s, i) => (
              <li key={s}><span className="panel__num" aria-hidden="true">{i + 1}</span>{s}</li>
            ))}
          </ol>
        </div>
      </article>
      <article className="panel panel--customers" aria-label="Customer clarity preview">
        <PanelIcon d={ICON_PEOPLE} />
        <div className="panel__col">
          <p className="panel__title">Customer clarity</p>
          <ul className="panel__people">
            {ex.customers.map((c) => (
              <li key={c.who} title={`${c.who}: ${c.need}`}><Avatar tone={c.tone} /><span>{c.label}</span></li>
            ))}
          </ul>
        </div>
      </article>
    </>
  );
}

/* ---------------------------------------------------------------------------
   Example selector: native buttons with aria-pressed; local state only.
--------------------------------------------------------------------------- */
const ICONS: Record<HeroExampleId, string> = {
  product: 'M 4 7 l 8 -4 l 8 4 v 10 l -8 4 l -8 -4 Z M 4 7 l 8 4 l 8 -4 M 12 11 v 10',
  service: ICON_PEOPLE,
  software: 'M 3 5 h 18 v 11 h -18 Z M 1 19 h 22 M 9 8 h 6',
};

function ExampleSelector({ selected, onSelect }: { selected: HeroExampleId; onSelect: (id: HeroExampleId) => void }) {
  return (
    <div className="examples" role="group" aria-label="Try an example">
      <div className="examples__row">
        {HERO_EXAMPLE_ORDER.map((id) => (
          <button key={id} type="button" className="example" aria-pressed={selected === id} onClick={() => onSelect(id)}>
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d={ICONS[id]} /></svg>
            <span>{HERO_EXAMPLES[id].label}</span>
            <span className="example__chev" aria-hidden="true">›</span>
          </button>
        ))}
      </div>
      <p className="visually-hidden" aria-live="polite">Showing the {HERO_EXAMPLES[selected].label.toLowerCase()} example.</p>
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Compact four-week journey (scenes from the vetted library).
--------------------------------------------------------------------------- */
function HeroJourney({ ex }: { ex: HeroExample }) {
  return (
    <section className="hero-journey" aria-labelledby="hero-journey-h">
      <h2 id="hero-journey-h" className="hero-journey__title">{PLAN_LABEL}</h2>
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
  const stageRef = useRef<HTMLDivElement | null>(null);
  const light = useIllumination(stageRef);
  const [selected, setSelected] = useState<HeroExampleId>('product');
  const ex = HERO_EXAMPLES[selected];
  return (
    <section className="hero section--dark" aria-labelledby="hero-h">
      <div className="container hero__inner">
        <div className="hero__copy">
          <p className="eyebrow hero__eyebrow">From what if to what next</p>
          <h1 id="hero-h" className="hero__title">Your next big idea<br />starts with a <span className="hero__highlight">little proof.</span></h1>
          <p className="lead hero__lead">Explore the opportunity. Understand your market. Find your next move.</p>
          <div className="hero__actions">
            <ButtonLink to="/validate" variant="teal" size="lg">Explore my idea <span aria-hidden="true">→</span></ButtonLink>
            <ButtonLink to="/sample-report" variant="secondary" size="lg">See it in action</ButtonLink>
          </div>
          <ExampleSelector selected={selected} onSelect={setSelected} />
        </div>
        <div className="hero__visual">
          <div
            ref={stageRef}
            className="hero__stage"
            data-lit={light.lit ? 'true' : 'false'}
            data-active={light.active ? 'true' : 'false'}
            onPointerEnter={light.onPointerEnter}
            onPointerLeave={light.onPointerLeave}
          >
            <IdeaVisual />
            <button type="button" className="idea__toggle" aria-pressed={light.toggled} onClick={light.toggle}>
              <span className="visually-hidden">Light up the idea illustration</span>
            </button>
            <Panels ex={ex} />
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
