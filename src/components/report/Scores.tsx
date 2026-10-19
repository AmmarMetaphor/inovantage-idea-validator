import { useId, useState } from 'react';
import { CRITERIA, GROUPS, SCORE_DISCLAIMER, SCORE_LABEL, SCORE_RUBRIC, criterion, type CriterionGroup, type Tone } from '@/config/scoring';
import { itemsForGroup, scoreTone, scoreWord, type Headline } from './derive';
import type { ScorecardItem, StandardReport } from './types';

/* ---- Small shared pieces ------------------------------------------------- */

export function ToneChip({ tone, children }: { tone: Tone | 'evidence' | 'assumption'; children: React.ReactNode }) {
  return <span className={`chip chip--${tone}`}>{children}</span>;
}

/** Circular score indicator; the number and the word always accompany the colour. */
export function ScoreRing({ score, size = 148, label }: { score: number | null; size?: number; label?: string }) {
  const r = 44;
  const c = 2 * Math.PI * r;
  const pct = score === null ? 0 : Math.max(0, Math.min(100, score)) / 100;
  const tone = scoreTone(score);
  return (
    <div className={`score-ring score-ring--${tone}`} style={{ width: size, height: size }} role="img" aria-label={label ?? (score === null ? `${SCORE_LABEL}: assessment incomplete` : `${SCORE_LABEL}: ${score} out of 100, ${scoreWord(score)}`)}>
      <svg viewBox="0 0 100 100" aria-hidden="true" focusable="false">
        <circle cx="50" cy="50" r={r} className="score-ring__track" />
        <circle cx="50" cy="50" r={r} className="score-ring__value" strokeDasharray={`${c * pct} ${c}`} transform="rotate(-90 50 50)" />
      </svg>
      <div className="score-ring__text">
        {score === null ? (
          <span className="score-ring__na">Incomplete</span>
        ) : (
          <>
            <span className="score-ring__num">{score}</span>
            <span className="score-ring__of">/100</span>
          </>
        )}
      </div>
    </div>
  );
}

/* ---- Report header: the score panel --------------------------------------- */

export function ScoreHeader({ report, headline, marketLabel, reportRef, generatedOn, illustrative }: { report: StandardReport; headline: Headline; marketLabel: string; reportRef?: string; generatedOn?: string | null; illustrative?: boolean }) {
  const [showRubric, setShowRubric] = useState(false);
  const id = useId();
  const { overall, band, confidence } = headline;
  return (
    <section className={`score-header score-header--${band.tone}`} aria-labelledby={`${id}-title`} id="overview">
      <div className="score-header__meta">
        <p className="eyebrow eyebrow--light">{illustrative ? 'Illustrative sample report' : 'Idea validation report'}{reportRef ? ` · ${reportRef}` : ''}{generatedOn ? ` · ${generatedOn}` : ''}</p>
        <h2 id={`${id}-title`} className="score-header__title">{report.title}</h2>
        <p className="score-header__sub">{report.idea_summary}</p>
        <dl className="score-header__facts">
          <div><dt>Launch market</dt><dd>{marketLabel}</dd></div>
          <div><dt>Evidence confidence</dt><dd><ToneChip tone={confidence.level === 'high' ? 'strong' : confidence.level === 'medium' ? 'moderate' : 'weak'}>{confidence.label}</ToneChip> <span className="score-header__detail">{confidence.detail}</span></dd></div>
        </dl>
      </div>
      <div className="score-header__score">
        <ScoreRing score={overall.score} />
        <div className="score-header__scoretext">
          <p className="score-header__label">{SCORE_LABEL}</p>
          <p className="score-header__band">{band.title}</p>
          <p className="score-header__count">
            {overall.score === null
              ? `Only ${overall.scored} of ${overall.total} criteria could be scored. An overall score needs at least six.`
              : `${overall.scored} of ${overall.total} criteria scored${overall.missing.length ? `; ${overall.missing.length} not enough evidence` : ''}.`}
          </p>
          <button type="button" className="linklike" aria-expanded={showRubric} onClick={() => setShowRubric((v) => !v)}>
            {showRubric ? 'Hide how this is calculated' : 'How this is calculated'}
          </button>
          {showRubric && <p className="score-header__rubric">{SCORE_RUBRIC}</p>}
        </div>
      </div>
      <div className="score-header__assess">
        <h3 className="h4">Assessment</h3>
        <p>{report.verdict.explanation}</p>
        <div className="score-header__cards">
          <div className="mini-card">
            <p className="mini-card__label">Strongest supported opportunity</p>
            <p>{headline.strongest.text}</p>
          </div>
          <div className="mini-card">
            <p className="mini-card__label">Most useful next action</p>
            <p>{headline.nextAction}</p>
          </div>
        </div>
        {overall.score === null && overall.missing.length > 0 && (
          <p className="small score-header__missing">
            Evidence needed before an overall score can be shown: {overall.missing.map((m) => criterion(m)?.label.toLowerCase() ?? m).join(', ')}.
          </p>
        )}
        <p className="small score-header__disclaimer">{SCORE_DISCLAIMER}</p>
      </div>
    </section>
  );
}

/* ---- Factor cards with bars ----------------------------------------------- */

function FactorRow({ item }: { item: ScorecardItem }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const c = criterion(item.id);
  const tone = scoreTone(item.score);
  const na = item.score === null;
  return (
    <li className="factor">
      <button type="button" className="factor__head" aria-expanded={open} aria-controls={`${id}-detail`} onClick={() => setOpen((v) => !v)}>
        <span className="factor__label">{c?.label ?? item.id}</span>
        <span className="factor__score">{na ? <><span aria-hidden="true">—</span><span className="visually-hidden">not scored</span></> : `${item.score}/100`}</span>
        <span className={`factor__bar factor__bar--${tone}`} aria-hidden="true">
          {!na && <span className="factor__fill" style={{ width: `${item.score}%` }} />}
        </span>
        <span className="factor__word">
          <ToneChip tone={tone}>{scoreWord(item.score)}</ToneChip>
          {!na && <ToneChip tone={item.basis === 'evidence' ? 'evidence' : 'assumption'}>{item.basis === 'evidence' ? 'evidence' : 'assumption'}</ToneChip>}
        </span>
        <span className="factor__toggle" aria-hidden="true">{open ? '−' : '+'}</span>
      </button>
      <div id={`${id}-detail`} className="factor__detail" hidden={!open}>
        <p><strong>Why:</strong> {item.note}</p>
        {item.improvement && <p><strong>To strengthen:</strong> {item.improvement}</p>}
        {c && <p className="small muted">{c.rubric} Weight {c.weight}% of the overall score.</p>}
      </div>
    </li>
  );
}

export function FactorCards({ report, headline }: { report: StandardReport; headline: Headline }) {
  return (
    <section className="report-section" id="scores" aria-labelledby="scores-h">
      <div className="section-title">
        <h2 id="scores-h">Factor scorecards</h2>
        <p className="muted">Higher is more favourable on every row. Open a row for the reason, its basis and one way to strengthen it.</p>
      </div>
      <div className="factor-cards">
        {GROUPS.map((g) => {
          const gs = headline.groups[g.id as CriterionGroup];
          return (
            <div key={g.id} className="factor-card">
              <div className="factor-card__head">
                <div>
                  <h3>{g.label}</h3>
                  <p className="small muted">{g.intro}</p>
                </div>
                <p className="factor-card__avg">
                  <span className="factor-card__avgnum">{gs.score === null ? '—' : gs.score}</span>
                  <span className="small muted">{gs.score === null ? 'not scored' : `average of ${gs.scored}`}</span>
                </p>
              </div>
              <ul className="factor-list">
                {itemsForGroup(report, g.id as CriterionGroup).map((item) => <FactorRow key={item.id} item={item} />)}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/* ---- Radar ---------------------------------------------------------------- */

export function Radar({ report, compact }: { report: StandardReport; compact?: boolean }) {
  const id = useId();
  const [showTable, setShowTable] = useState(false);
  const n = CRITERIA.length;
  const W = 400;
  const H = 320;
  const cx = W / 2;
  const cy = H / 2 + 4;
  const R = compact ? 94 : 104;
  const pts = CRITERIA.map((c, i) => {
    const item = report.scorecard.find((s) => s.id === c.id);
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    const score = item && item.score !== null ? item.score : null;
    return { c, item, angle, score, x: cx + Math.cos(angle) * R * ((score ?? 0) / 100), y: cy + Math.sin(angle) * R * ((score ?? 0) / 100) };
  });
  const scored = pts.filter((p) => p.score !== null);
  const polygon = scored.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  return (
    <section className={`report-section radar ${compact ? 'radar--compact' : ''}`} aria-labelledby={`${id}-h`}>
      {!compact && (
        <div className="section-title">
          <h2 id={`${id}-h`}>Criteria radar</h2>
          <p className="muted">The same nine scores as the cards, drawn on one shape. Axes without a score are marked and left out of the shape.</p>
        </div>
      )}
      {compact && <h3 id={`${id}-h`} className="h4">Criteria radar</h3>}
      <svg viewBox={`0 0 ${W} ${H}`} className="radar__svg" role="img" aria-labelledby={`${id}-h`} aria-describedby={`${id}-desc`}>
        <desc id={`${id}-desc`}>{pts.map((p) => `${p.c.label}: ${p.score === null ? 'not enough evidence' : `${p.score} out of 100`}`).join('; ')}</desc>
        {[25, 50, 75, 100].map((v) => (
          <g key={v}>
            <polygon className="radar__ring" points={CRITERIA.map((_, i) => { const a = -Math.PI / 2 + (i * 2 * Math.PI) / n; return `${(cx + Math.cos(a) * R * v / 100).toFixed(1)},${(cy + Math.sin(a) * R * v / 100).toFixed(1)}`; }).join(' ')} />
            <text x={cx + 3} y={cy - (R * v) / 100 - 2} className="radar__tick">{v}</text>
          </g>
        ))}
        {pts.map((p) => {
          const ex = cx + Math.cos(p.angle) * R;
          const ey = cy + Math.sin(p.angle) * R;
          const lx = cx + Math.cos(p.angle) * (R + 16);
          const ly = cy + Math.sin(p.angle) * (R + 18);
          const anchor = Math.abs(Math.cos(p.angle)) < 0.2 ? 'middle' : Math.cos(p.angle) > 0 ? 'start' : 'end';
          return (
            <g key={p.c.id}>
              <line x1={cx} y1={cy} x2={ex} y2={ey} className={`radar__axis ${p.score === null ? 'radar__axis--na' : ''}`} />
              <text x={lx} y={ly + 4} textAnchor={anchor} className={`radar__label ${p.score === null ? 'radar__label--na' : ''}`}>{p.c.short}{p.score === null ? ' (n/a)' : ''}</text>
            </g>
          );
        })}
        {scored.length >= 3 && <polygon points={polygon} className="radar__shape" />}
        {scored.map((p) => (
          <g key={p.c.id}>
            <circle cx={p.x} cy={p.y} r={4} className="radar__dot" />
            <title>{`${p.c.label}: ${p.score}/100`}</title>
          </g>
        ))}
      </svg>
      {!compact && (
        <>
          <button type="button" className="btn btn--ghost btn--md" aria-expanded={showTable} onClick={() => setShowTable((v) => !v)}>{showTable ? 'Hide values' : 'Show values as a table'}</button>
          {showTable && (
            <table className="data-table">
              <caption className="visually-hidden">Criteria scores</caption>
              <thead><tr><th scope="col">Criterion</th><th scope="col">Group</th><th scope="col">Score /100</th><th scope="col">Basis</th></tr></thead>
              <tbody>
                {pts.map((p) => (
                  <tr key={p.c.id}><th scope="row">{p.c.label}</th><td>{p.c.group}</td><td>{p.score === null ? 'Not enough evidence' : p.score}</td><td>{p.item?.basis ?? '—'}</td></tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </section>
  );
}
