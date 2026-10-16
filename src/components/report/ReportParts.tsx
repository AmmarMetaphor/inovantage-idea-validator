import { useId, useState } from 'react';
import { CONSULTATION, DETAILED_REPORT_SECTIONS, PRODUCTS, READINESS_RUBRIC, SCORECARD_DIMENSIONS } from '@/config/product';
import type { FinancialResult } from '@/lib/api';
import type { Claim, Source, StandardReport, VerdictLabel } from './types';

const TONE: Record<VerdictLabel, 'go' | 'caution' | 'stop'> = {
  'Worth testing': 'go',
  'Refine before investing': 'caution',
  'Reconsider the current approach': 'stop',
};

export function scoreLabel(score: number | null): string {
  if (score === null) return 'Insufficient evidence';
  return ['', 'Weak', 'Limited', 'Moderate', 'Good', 'Strong'][score] ?? '';
}

export function readiness(scores: (number | null)[]): { score: number | null; rated: number } {
  const rated = scores.filter((s): s is number => typeof s === 'number');
  if (rated.length < 3) return { score: null, rated: rated.length };
  const avg = rated.reduce((a, b) => a + b, 0) / rated.length;
  return { score: Math.round(((avg - 1) / 4) * 100), rated: rated.length };
}

export function money(n: number, currency: string): string {
  const sym = currency === 'GBP' ? '£' : currency === 'USD' ? '$' : currency === 'AUD' ? 'A$' : `${currency} `;
  return `${sym}${new Intl.NumberFormat('en-GB', { maximumFractionDigits: n % 1 === 0 ? 0 : 2 }).format(n)}`;
}

/* ---- Status label (text + colour, never colour alone) --------------------- */
export function StatusLabel({ tone, children }: { tone: 'go' | 'caution' | 'stop' | 'na'; children: React.ReactNode }) {
  return <span className={`status status--${tone}`}>{children}</span>;
}

/* ---- Verdict ------------------------------------------------------------- */
export function VerdictBanner({ report }: { report: StandardReport }) {
  const tone = TONE[report.verdict.label];
  return (
    <section className={`verdict-banner verdict-banner--${tone}`} aria-labelledby="verdict-h">
      <p className="eyebrow">Verdict</p>
      <h2 id="verdict-h" className="verdict-banner__label">
        {report.verdict.label} <StatusLabel tone={tone}>{tone === 'go' ? 'Go: test it' : tone === 'caution' ? 'Caution: refine' : 'Stop: rethink'}</StatusLabel>
      </h2>
      <p className="verdict-banner__text">{report.verdict.explanation}</p>
    </section>
  );
}

/* ---- Scorecard ----------------------------------------------------------- */
export function Scorecard({ report }: { report: StandardReport }) {
  const r = readiness(report.scorecard.map((s) => s.score));
  return (
    <section className="report-section" aria-labelledby="score-h">
      <h2 id="score-h">Readiness scorecard</h2>
      <ol className="scorecard">
        {report.scorecard.map((item) => {
          const dim = SCORECARD_DIMENSIONS.find((d) => d.id === item.id);
          const tone = item.score === null ? 'na' : item.score >= 4 ? 'go' : item.score >= 3 ? 'caution' : 'stop';
          return (
            <li key={item.id} className="scorecard__row">
              <div className="scorecard__head">
                <span className="scorecard__dim">{dim?.label ?? item.id}</span>
                <span className="scorecard__pips" role="img" aria-label={item.score === null ? 'not rated' : `${item.score} out of 5`}>
                  {[1, 2, 3, 4, 5].map((i) => (
                    <span key={i} className={`pip ${item.score !== null && i <= item.score ? 'pip--on' : ''}`} />
                  ))}
                </span>
                <StatusLabel tone={tone}>{scoreLabel(item.score)}</StatusLabel>
              </div>
              <p className="scorecard__note">{item.note}</p>
              {dim && <p className="scorecard__rubric">{dim.rubric}</p>}
            </li>
          );
        })}
      </ol>
      <p className="small muted">
        {r.score === null ? `Indicative readiness score: insufficient evidence (${r.rated} of 5 dimensions rated).` : `Indicative readiness score: ${r.score}/100 (${r.rated} of 5 rated).`}{' '}
        {READINESS_RUBRIC}
      </p>
    </section>
  );
}

/* ---- Chart with tooltips and an accessible data table -------------------- */
export function EvidenceChart({ chart, sources }: { chart: StandardReport['chart']; sources: Source[] }) {
  const id = useId();
  const [showTable, setShowTable] = useState(false);
  const [active, setActive] = useState<number | null>(null);
  const label = chart.kind === 'evidence' ? 'Evidence chart' : chart.kind === 'scenario' ? 'Illustrative scenario' : 'Data gap';
  const max = Math.max(...chart.series.map((s) => Math.abs(s.value)), 1);
  const W = 320;
  const H = 180;
  const padL = 8;
  const padB = 28;
  const n = Math.max(chart.series.length, 1);
  const gap = 10;
  const bw = (W - padL * 2 - gap * (n - 1)) / n;
  return (
    <section className="report-section chart" aria-labelledby={`${id}-h`}>
      <p className={`eyebrow ${chart.kind !== 'evidence' ? 'eyebrow--gold' : ''}`}>{label}</p>
      <h2 id={`${id}-h`}>{chart.title || 'Market indicator'}</h2>
      {chart.kind === 'none' || chart.series.length === 0 ? (
        <p className="muted">{chart.note || 'No suitable local market data was found for a chart.'}</p>
      ) : (
        <>
          <svg viewBox={`0 0 ${W} ${H}`} className="chart__svg" role="img" aria-labelledby={`${id}-h`} aria-describedby={`${id}-desc`}>
            <desc id={`${id}-desc`}>
              {chart.series.map((s) => `${s.label}: ${s.value}${chart.unit ? ' ' + chart.unit : ''}`).join('; ')}
            </desc>
            {chart.series.map((s, i) => {
              const bh = ((H - padB - 20) * Math.abs(s.value)) / max;
              const x = padL + i * (bw + gap);
              const y = H - padB - bh;
              return (
                <g key={i} onMouseEnter={() => setActive(i)} onMouseLeave={() => setActive(null)} onFocus={() => setActive(i)} onBlur={() => setActive(null)} tabIndex={0}>
                  <rect x={x} y={y} width={bw} height={bh} className={chart.kind === 'evidence' ? 'bar bar--evidence' : 'bar bar--scenario'} />
                  <text x={x + bw / 2} y={y - 5} textAnchor="middle" className="chart__value">
                    {Intl.NumberFormat('en-GB', { notation: 'compact' }).format(s.value)}
                  </text>
                  <text x={x + bw / 2} y={H - padB + 14} textAnchor="middle" className="chart__label">
                    {s.label.length > 12 ? s.label.slice(0, 11) + '…' : s.label}
                  </text>
                  <title>{`${s.label}: ${s.value}${chart.unit ? ' ' + chart.unit : ''}${s.source_index ? ` (source ${s.source_index})` : ''}`}</title>
                </g>
              );
            })}
          </svg>
          {active !== null && chart.series[active] && (
            <p className="chart__tooltip" role="status">
              <strong>{chart.series[active].label}</strong>: {chart.series[active].value} {chart.unit}
              {chart.series[active].source_index ? ` · source [${chart.series[active].source_index}] ${sources.find((s) => s.index === chart.series[active!].source_index)?.publisher ?? ''}` : ''}
            </p>
          )}
          <p className="small muted">{chart.unit ? `${chart.unit}. ` : ''}{chart.note}</p>
          <button type="button" className="btn btn--ghost btn--md" aria-expanded={showTable} onClick={() => setShowTable((v) => !v)}>
            {showTable ? 'Hide data table' : 'Show data table'}
          </button>
          {showTable && (
            <table className="data-table">
              <caption className="visually-hidden">{chart.title}</caption>
              <thead>
                <tr>
                  <th scope="col">Series</th>
                  <th scope="col">Value{chart.unit ? ` (${chart.unit})` : ''}</th>
                  <th scope="col">Source</th>
                </tr>
              </thead>
              <tbody>
                {chart.series.map((s, i) => (
                  <tr key={i}>
                    <th scope="row">{s.label}</th>
                    <td>{s.value}</td>
                    <td>{s.source_index ? `[${s.source_index}]` : chart.kind === 'scenario' ? 'scenario' : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </section>
  );
}

/* ---- SWOT ---------------------------------------------------------------- */
export function Swot({ swot }: { swot: StandardReport['swot'] }) {
  const quads: [string, string[], 'go' | 'stop' | 'caution' | 'na'][] = [
    ['Strengths', swot.strengths, 'go'],
    ['Weaknesses', swot.weaknesses, 'stop'],
    ['Opportunities', swot.opportunities, 'caution'],
    ['Threats', swot.threats, 'na'],
  ];
  return (
    <section className="report-section" aria-labelledby="swot-h">
      <h2 id="swot-h">Compact SWOT</h2>
      <div className="swot">
        {quads.map(([t, items, tone]) => (
          <div key={t} className={`swot__quad swot__quad--${tone}`}>
            <h3>{t}</h3>
            <ul>{items.length ? items.map((s, i) => <li key={i}>{s}</li>) : <li>None identified from the available evidence</li>}</ul>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ---- Financial table ----------------------------------------------------- */
export function FinancialTable({ fin }: { fin: FinancialResult }) {
  return (
    <section className="report-section" aria-labelledby="fin-h">
      <h2 id="fin-h">Financial scenarios</h2>
      <p className="small muted">Computed from the stated inputs and labelled assumptions. Monthly figures in {fin.currency}.</p>
      <div className="table-scroll">
        <table className="data-table">
          <caption className="visually-hidden">Monthly scenarios</caption>
          <thead>
            <tr>
              <th scope="col">Scenario</th>
              <th scope="col">Units</th>
              <th scope="col">Revenue</th>
              <th scope="col">Contribution</th>
              <th scope="col">Fixed costs</th>
              <th scope="col">Profit</th>
            </tr>
          </thead>
          <tbody>
            {fin.rows.map((r) => (
              <tr key={r.label}>
                <th scope="row">{r.label}</th>
                <td>{r.units.toLocaleString('en-GB')}</td>
                <td>{money(r.revenue, fin.currency)}</td>
                <td>{money(r.contribution, fin.currency)}</td>
                <td>{money(r.fixedCosts, fin.currency)}</td>
                <td className={r.profit < 0 ? 'neg' : ''}>{r.profit < 0 ? '−' : ''}{money(Math.abs(r.profit), fin.currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className={fin.breakEvenUnits === null ? 'notice notice--warning' : ''} style={{ marginTop: 'var(--space-3)' }}>
        <strong>Break-even:</strong> {fin.breakEvenNote}
        {fin.contributionMarginPct !== null && ` Contribution margin ${fin.contributionMarginPct.toFixed(0)}%.`}
      </p>
      <details className="details">
        <summary>Assumptions used</summary>
        <ul>
          {fin.assumptions.map((a) => (
            <li key={a.label}>
              <strong>{a.label}:</strong> {a.value} <StatusLabel tone="na">{a.basis.replace('_', ' ')}</StatusLabel>
              {a.note ? ` — ${a.note}` : ''}
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}

/* ---- Risks, improvements, experiment ------------------------------------- */
export function Risks({ risks }: { risks: StandardReport['risks'] }) {
  return (
    <section className="report-section" aria-labelledby="risk-h">
      <h2 id="risk-h">Three key risks and how to validate them</h2>
      <ol className="risks">
        {risks.map((r, i) => (
          <li key={i}>
            <p><strong>Risk:</strong> {r.risk}</p>
            <p><strong>Validate:</strong> {r.validation_method}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function Improvements({ items }: { items: string[] }) {
  return (
    <section className="report-section" aria-labelledby="imp-h">
      <h2 id="imp-h">Five prioritised improvements</h2>
      <ol className="actions">{items.map((s, i) => <li key={i}>{s}</li>)}</ol>
    </section>
  );
}

export function Experiment({ ex, currency }: { ex: StandardReport['experiment']; currency: string }) {
  return (
    <section className="report-section experiment" aria-labelledby="exp-h">
      <h2 id="exp-h">A practical validation experiment</h2>
      <p>{ex.description}</p>
      <dl className="kv">
        <dt>Budget</dt><dd>{money(ex.budget_amount, currency)}</dd>
        <dt>Duration</dt><dd>{ex.duration}</dd>
        <dt>Success criterion</dt><dd>{ex.success_criterion}</dd>
      </dl>
    </section>
  );
}

/* ---- Sources, evidence, limitations -------------------------------------- */
export function Sources({ sources, claims, limitations, retrievedOn }: { sources: Source[]; claims: Claim[]; limitations: string[]; retrievedOn: string | null }) {
  return (
    <section className="report-section" aria-labelledby="src-h">
      <h2 id="src-h">Sources and research limitations</h2>
      {sources.length === 0 ? (
        <p className="muted">No retrievable sources were found for this idea and market; every statement is an assumption or a customer input.</p>
      ) : (
        <ol className="sources">
          {sources.map((s) => (
            <li key={s.index} id={`source-${s.index}`}>
              <a href={s.url} target="_blank" rel="noopener noreferrer nofollow">{s.title}</a>
              <span className="sources__meta">
                {[s.publisher, s.published_date ?? 'date unknown', s.geography, s.period, s.claim_type !== 'other' ? s.claim_type : null].filter(Boolean).join(' · ')}
                {s.unit ? ` · ${s.unit}` : ''}
              </span>
              <span className="sources__url">{s.url}</span>
            </li>
          ))}
        </ol>
      )}
      {retrievedOn && <p className="small muted">Retrieved on {retrievedOn}.</p>}
      <details className="details">
        <summary>Evidence behind the claims ({claims.length})</summary>
        <ul className="claims">
          {claims.map((c, i) => (
            <li key={i}>
              <StatusLabel tone={c.kind === 'evidence' ? 'go' : c.kind === 'assumption' ? 'caution' : 'na'}>{c.kind.replace('_', ' ')}</StatusLabel>{' '}
              <span className="small muted">{c.confidence} confidence{c.evidence_date ? `, ${c.evidence_date}` : ''}</span> {c.text}
              {c.source_indexes.length > 0 && (
                <span className="small"> {c.source_indexes.map((n) => <a key={n} href={`#source-${n}`}>[{n}]</a>)}</span>
              )}
            </li>
          ))}
        </ul>
      </details>
      <h3 className="h4">Limitations</h3>
      <ul>{limitations.map((l, i) => <li key={i}>{l}</li>)}</ul>
    </section>
  );
}

/* ---- CTAs ---------------------------------------------------------------- */
export function ConsultationCta({ reportRef }: { reportRef: string }) {
  const [before, after] = CONSULTATION.text.split(CONSULTATION.email);
  return (
    <section className="cta-box" aria-labelledby="consult-h">
      <h2 id="consult-h" className="h4">Talk to an expert</h2>
      <p>
        {before}
        <a href={CONSULTATION.mailto(reportRef)}>{CONSULTATION.email}</a>
        {after}
      </p>
    </section>
  );
}

export function UpgradeCta({ onUpgrade, busy, error, available, purchased }: { onUpgrade: () => void; busy: boolean; error?: string; available: boolean; purchased: boolean }) {
  if (purchased) return null;
  return (
    <section className="upgrade" aria-labelledby="upg-h">
      <div className="upgrade__preview" aria-hidden="true">
        <p className="upgrade__preview-label">Illustrative preview</p>
        <div className="upgrade__blur">
          <p>Market opportunity and sizing methodology</p>
          <p>Competitor comparison and positioning</p>
          <p>Revenue, cash-flow and break-even scenarios</p>
          <p>Sensitivity analysis and principal risks</p>
        </div>
      </div>
      <div className="upgrade__body">
        <p className="eyebrow eyebrow--gold">{PRODUCTS.upgrade.name}</p>
        <h2 id="upg-h">Go deeper on this idea</h2>
        <p className="muted">
          A full report that builds on this verdict. <strong>{PRODUCTS.upgrade.display} additional</strong> to the {PRODUCTS.standard.display} you have paid, so {PRODUCTS.standard.display} + {PRODUCTS.upgrade.display} = £52 in total. One-time payment.
        </p>
        <ul className="upgrade__list">{DETAILED_REPORT_SECTIONS.map((s) => <li key={s}>{s}</li>)}</ul>
        <p className="small muted">The preview above is illustrative; your detailed report is written from your answers and research after payment.</p>
        {error && <p className="field__error" role="alert">{error}</p>}
        <button type="button" className="btn btn--primary btn--lg" onClick={onUpgrade} disabled={busy || !available}>
          {busy ? 'Preparing checkout…' : `Get the detailed report — ${PRODUCTS.upgrade.display} additional`}
        </button>
      </div>
    </section>
  );
}
