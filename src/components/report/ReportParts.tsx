import { useId, useState } from 'react';
import { CONSULTATION, PRODUCTS, UPGRADE_INCLUDES } from '@/config/product';
import type { FinancialResult } from '@/lib/api';
import { chartProvenance, toStrengthen } from './derive';
import type { Chart, Claim, Source, StandardReport } from './types';

export function money(n: number, currency: string): string {
  const sym = currency === 'GBP' ? '£' : currency === 'USD' ? '$' : currency === 'AUD' ? 'A$' : `${currency} `;
  return `${sym}${new Intl.NumberFormat('en-GB', { maximumFractionDigits: n % 1 === 0 ? 0 : 2 }).format(n)}`;
}

/* ---- Status label (text + colour, never colour alone) --------------------- */
export function StatusLabel({ tone, children }: { tone: 'go' | 'caution' | 'stop' | 'na'; children: React.ReactNode }) {
  return <span className={`status status--${tone}`}>{children}</span>;
}

/* ---- Section title -------------------------------------------------------- */
export function SectionTitle({ id, title, intro, eyebrow }: { id: string; title: string; intro?: string; eyebrow?: string }) {
  return (
    <div className="section-title">
      {eyebrow && <p className="eyebrow eyebrow--gold">{eyebrow}</p>}
      <h2 id={id}>{title}</h2>
      {intro && <p className="muted">{intro}</p>}
    </div>
  );
}

/* ---- Chart with axes, legend, provenance and an accessible table ---------- */

/** Wrap a category label into at most two short lines so it is never clipped. */
function wrapLabel(label: string, max = 11): string[] {
  const words = label.split(/\s+/);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length <= max) cur = (cur + ' ' + w).trim();
    else {
      if (cur) lines.push(cur);
      cur = w.length > max ? w.slice(0, max - 1) + '…' : w;
    }
    if (lines.length === 2) break;
  }
  if (lines.length < 2 && cur) lines.push(cur);
  return lines.slice(0, 2);
}

function niceMax(max: number): number {
  if (max <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(max)));
  const m = max / p;
  const step = m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10;
  return step * p;
}

export function EvidenceChart({ chart, sources, marketLabel, currency }: { chart: Chart; sources: Source[]; marketLabel: string; currency?: string }) {
  const id = useId();
  const [showTable, setShowTable] = useState(false);
  const [active, setActive] = useState<number | null>(null);
  const prov = chartProvenance(chart, sources, marketLabel);
  const kindLabel = chart.kind === 'evidence' ? 'Market evidence' : chart.kind === 'scenario' ? 'Illustrative scenario' : 'Data gap';
  const unit = chart.unit || '';
  const W = 360;
  const H = 220;
  const padL = 46;
  const padR = 10;
  const padT = 22;
  const padB = 44;
  const n = Math.max(chart.series.length, 1);
  const top = niceMax(Math.max(...chart.series.map((s) => Math.abs(s.value)), 0));
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const gap = Math.min(16, plotW / n / 4);
  const bw = (plotW - gap * (n - 1)) / n;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * top);
  const fmt = (v: number) => Intl.NumberFormat('en-GB', { notation: Math.abs(v) >= 10000 ? 'compact' : 'standard', maximumFractionDigits: 1 }).format(v);
  const legend = chart.kind === 'evidence' ? prov.nature : 'Illustrative scenario (computed, not a forecast)';
  return (
    <section className="report-section chart" aria-labelledby={`${id}-h`}>
      <p className={`eyebrow ${chart.kind !== 'evidence' ? 'eyebrow--gold' : ''}`}>{kindLabel}</p>
      <h3 id={`${id}-h`} className="chart__title">{chart.title || 'Market indicator'}</h3>
      {chart.kind === 'none' || chart.series.length === 0 ? (
        <p className="muted">{chart.note || 'No suitable local market data was found for a chart, so none is drawn rather than an invented one.'}</p>
      ) : (
        <>
          <p className="small muted chart__prov">
            {prov.geography}{prov.period ? ` · ${prov.period}` : ''}{unit ? ` · ${unit}${currency && /£|\$|GBP|USD|AUD/.test(unit) === false && /price|revenue|cost|spend|£|\$/i.test(unit) ? ` (${currency})` : ''}` : ''}
          </p>
          <svg viewBox={`0 0 ${W} ${H}`} className="chart__svg" role="img" aria-labelledby={`${id}-h`} aria-describedby={`${id}-desc`}>
            <desc id={`${id}-desc`}>{chart.series.map((s) => `${s.label}: ${s.value}${unit ? ' ' + unit : ''}`).join('; ')}. {legend}.</desc>
            {ticks.map((t) => {
              const y = padT + plotH - (plotH * t) / top;
              return (
                <g key={t}>
                  <line x1={padL} x2={W - padR} y1={y} y2={y} className="chart__grid" />
                  <text x={padL - 6} y={y + 3} textAnchor="end" className="chart__tick">{fmt(t)}</text>
                </g>
              );
            })}
            <text x={4} y={9} className="chart__axis-title">{unit || 'value'}</text>
            {chart.series.map((s, i) => {
              const bh = (plotH * Math.abs(s.value)) / top;
              const x = padL + i * (bw + gap);
              const y = padT + plotH - bh;
              const lines = wrapLabel(s.label, n > 4 ? 8 : 11);
              const isActive = active === i;
              return (
                <g key={i} tabIndex={0} role="button" aria-label={`${s.label}: ${s.value} ${unit}`} onMouseEnter={() => setActive(i)} onMouseLeave={() => setActive(null)} onFocus={() => setActive(i)} onBlur={() => setActive(null)} onClick={() => setActive(isActive ? null : i)} onTouchStart={() => setActive(i)}>
                  <rect x={x} y={y} width={bw} height={bh} rx={2} className={`bar ${chart.kind === 'evidence' ? 'bar--evidence' : 'bar--scenario'} ${isActive ? 'bar--active' : ''}`} />
                  <text x={x + bw / 2} y={y - 4} textAnchor="middle" className="chart__value">{fmt(s.value)}</text>
                  {lines.map((ln, li) => (
                    <text key={li} x={x + bw / 2} y={padT + plotH + 14 + li * 11} textAnchor="middle" className="chart__label">{ln}</text>
                  ))}
                </g>
              );
            })}
            <line x1={padL} x2={W - padR} y1={padT + plotH} y2={padT + plotH} className="chart__baseline" />
          </svg>
          <p className="chart__legend"><span className={`chart__swatch ${chart.kind === 'evidence' ? 'chart__swatch--evidence' : 'chart__swatch--scenario'}`} aria-hidden="true" /> {legend}{prov.sourceIndexes.length ? ` · sources ${prov.sourceIndexes.map((i) => `[${i}]`).join(' ')}` : ''}</p>
          <p className="chart__tooltip" role="status" aria-live="polite">
            {active !== null && chart.series[active] ? (
              <>
                <strong>{chart.series[active].label}</strong>: {fmt(chart.series[active].value)} {unit}
                {chart.series[active].source_index ? ` · source [${chart.series[active].source_index}] ${sources.find((s) => s.index === chart.series[active!].source_index)?.publisher ?? ''}` : chart.kind === 'scenario' ? ' · computed scenario' : ''}
              </>
            ) : (
              <span className="muted">Hover, tap or focus a bar for its value and source.</span>
            )}
          </p>
          {chart.note && <p className="small muted">{chart.note}</p>}
          <button type="button" className="btn btn--ghost btn--md" aria-expanded={showTable} onClick={() => setShowTable((v) => !v)}>
            {showTable ? 'Hide data table' : 'Show data table'}
          </button>
          {showTable && (
            <table className="data-table">
              <caption className="visually-hidden">{chart.title}</caption>
              <thead>
                <tr><th scope="col">Category</th><th scope="col">Value{unit ? ` (${unit})` : ''}</th><th scope="col">Basis</th></tr>
              </thead>
              <tbody>
                {chart.series.map((s, i) => (
                  <tr key={i}><th scope="row">{s.label}</th><td>{s.value}</td><td>{s.source_index ? `source [${s.source_index}]` : chart.kind === 'scenario' ? 'illustrative scenario' : '—'}</td></tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </section>
  );
}

/* ---- Insight cards: what is working, what to strengthen ------------------- */
export function Insights({ report }: { report: StandardReport }) {
  const strengthen = toStrengthen(report);
  return (
    <section className="report-section" aria-labelledby="ins-h">
      <SectionTitle id="ins-h" title="What the evidence supports, and what to strengthen" />
      <div className="insights">
        <div className="insight insight--strong">
          <h3 className="h4">Supported strengths</h3>
          <ul>{report.swot.strengths.length ? report.swot.strengths.map((s, i) => <li key={i}>{s}</li>) : <li>No strengths could be supported from the available evidence.</li>}</ul>
          {report.swot.opportunities.length > 0 && (
            <>
              <h4 className="insight__sub">Opportunities</h4>
              <ul>{report.swot.opportunities.map((s, i) => <li key={i}>{s}</li>)}</ul>
            </>
          )}
        </div>
        <div className="insight insight--work">
          <h3 className="h4">What needs strengthening</h3>
          {strengthen.length ? (
            <ul className="insight__list">
              {strengthen.map((s) => (
                <li key={s.id}>
                  <strong>{s.id.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase())}</strong> <span className="muted">({s.score}/100)</span>
                  <br /><span className="small">Why it matters: {s.note}</span>
                  <br /><span className="small">Next: {s.improvement}</span>
                </li>
              ))}
            </ul>
          ) : (
            <ul>{report.swot.weaknesses.map((s, i) => <li key={i}>{s}</li>)}</ul>
          )}
          {report.swot.threats.length > 0 && (
            <>
              <h4 className="insight__sub">Watch out for</h4>
              <ul>{report.swot.threats.map((s, i) => <li key={i}>{s}</li>)}</ul>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

/* ---- Financial table ----------------------------------------------------- */
export function FinancialTable({ fin }: { fin: FinancialResult }) {
  const maxAbs = Math.max(...fin.rows.map((r) => Math.abs(r.revenue)), 1);
  return (
    <section className="report-section" id="financials" aria-labelledby="fin-h">
      <SectionTitle id="fin-h" title="Financial scenarios" intro={`Computed in code from your inputs and labelled assumptions. Monthly figures in ${fin.currency}. An illustrative scenario, not a forecast.`} />
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
                <td>
                  {money(r.revenue, fin.currency)}
                  <span className="inline-bar" aria-hidden="true"><span style={{ width: `${(Math.abs(r.revenue) / maxAbs) * 100}%` }} /></span>
                </td>
                <td>{money(r.contribution, fin.currency)}</td>
                <td>{money(r.fixedCosts, fin.currency)}</td>
                <td className={r.profit < 0 ? 'neg' : 'pos'}>{r.profit < 0 ? '−' : ''}{money(Math.abs(r.profit), fin.currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className={fin.breakEvenUnits === null ? 'notice notice--warning' : 'breakeven'}>
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

/* ---- Risks, recommendations, experiment ---------------------------------- */
export function Risks({ risks }: { risks: StandardReport['risks'] }) {
  return (
    <section className="report-section" aria-labelledby="risk-h">
      <SectionTitle id="risk-h" title="Key risks and how to test them" intro="Kept visible on purpose: each risk comes with the cheapest way to find out." />
      <ol className="risks">
        {risks.map((r, i) => (
          <li key={i} className="risk-card">
            <p className="risk-card__risk">{r.risk}</p>
            <p className="risk-card__test"><strong>Test it:</strong> {r.validation_method}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function Recommendations({ items }: { items: StandardReport['improvements'] }) {
  return (
    <section className="report-section" id="roadmap" aria-labelledby="imp-h">
      <SectionTitle id="imp-h" title="Prioritised recommendations" intro="In order of impact. Success measures are suggestions to adapt, not targets you must hit." />
      <ol className="recs">
        {items.map((r, i) => (
          <li key={i} className="rec">
            <p className="rec__action">{r.action}</p>
            <dl className="rec__meta">
              {r.purpose && <><dt>Why</dt><dd>{r.purpose}</dd></>}
              {r.measure && <><dt>Measure</dt><dd>{r.measure}</dd></>}
            </dl>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function Experiment({ ex, currency }: { ex: StandardReport['experiment']; currency: string }) {
  return (
    <section className="report-section experiment" aria-labelledby="exp-h">
      <SectionTitle id="exp-h" title="What to test first" intro="One cheap experiment before you commit more money or time." />
      <div className="experiment__card">
        <p className="experiment__desc">{ex.description}</p>
        <dl className="kv">
          <dt>Budget</dt><dd>{money(ex.budget_amount, currency)}</dd>
          <dt>Duration</dt><dd>{ex.duration}</dd>
          <dt>Suggested success threshold</dt><dd>{ex.success_criterion}</dd>
        </dl>
      </div>
    </section>
  );
}

/* ---- Sources, evidence, limitations -------------------------------------- */
export function Sources({ sources, claims, limitations, retrievedOn }: { sources: Source[]; claims: Claim[]; limitations: string[]; retrievedOn: string | null }) {
  return (
    <section className="report-section" id="sources" aria-labelledby="src-h">
      <SectionTitle id="src-h" title="Sources and research limitations" />
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
      <details className="details" open>
        <summary>Limitations ({limitations.length})</summary>
        <ul>{limitations.map((l, i) => <li key={i}>{l}</li>)}</ul>
      </details>
    </section>
  );
}

/* ---- CTAs ---------------------------------------------------------------- */
export function ConsultationCta({ reportRef }: { reportRef: string }) {
  const [before, after] = CONSULTATION.text.split(CONSULTATION.email);
  return (
    <section className="cta-box" aria-labelledby="consult-h">
      <h2 id="consult-h" className="h4">Need more than a report?</h2>
      <p>
        {before}
        <a href={CONSULTATION.mailto(reportRef)}>{CONSULTATION.email}</a>
        {after}
      </p>
    </section>
  );
}

/** Harmless illustrative content for the locked preview: structure only, never real findings. */
const PREVIEW_BLOCKS: Record<string, { heading: string; lines: number[]; table?: boolean }> = {
  'Market insights': { heading: 'Audience segments and demand evidence', lines: [92, 78, 85, 60], table: true },
  'Market strategy': { heading: 'Positioning, channels and pricing options', lines: [88, 70, 82] },
  Roadmap: { heading: 'Prioritised steps and milestones', lines: [75, 90, 64, 80] },
  'Customer journey': { heading: 'Discovery, purchase, delivery, retention', lines: [80, 72, 86] },
  'Financial details': { heading: 'Start-up costs, unit economics, break-even', lines: [84, 66], table: true },
};

export function LockedPreview({ title, body, ideaName, onUpgrade, busy, available, compact }: { title: string; body: string; ideaName?: string; onUpgrade?: () => void; busy?: boolean; available?: boolean; compact?: boolean }) {
  const pb = PREVIEW_BLOCKS[title] ?? { heading: title, lines: [80, 70, 85] };
  return (
    <div className={`locked ${compact ? 'locked--compact' : ''}`}>
      <div className="locked__content" aria-hidden="true">
        <p className="locked__heading">{pb.heading}{ideaName ? ` for ${ideaName}` : ''}</p>
        {pb.lines.map((w, i) => <span key={i} className="locked__line" style={{ width: `${w}%` }} />)}
        {pb.table && <div className="locked__table"><span /><span /><span /><span /><span /><span /></div>}
      </div>
      <div className="locked__overlay">
        <span className="locked__icon" aria-hidden="true">🔒</span>
        <p className="locked__title">{title}</p>
        <p className="small">{body}</p>
        <p className="small muted">Illustrative layout; written for your idea after the upgrade.</p>
        {onUpgrade && (
          <button type="button" className="btn btn--primary btn--md" onClick={onUpgrade} disabled={busy || available === false}>
            {busy ? 'Preparing checkout…' : `Unlock · ${PRODUCTS.upgrade.display} additional`}
          </button>
        )}
      </div>
    </div>
  );
}

export function UpgradePanel({ onUpgrade, busy, error, available, purchased, ideaName, marketLabel }: { onUpgrade?: () => void; busy?: boolean; error?: string; available?: boolean; purchased?: boolean; ideaName?: string; marketLabel?: string }) {
  if (purchased) return null;
  return (
    <section className="upgrade" id="upgrade" aria-labelledby="upg-h">
      <div className="upgrade__intro">
        <p className="eyebrow eyebrow--gold">Detailed report · one-time upgrade · {PRODUCTS.upgrade.display}</p>
        <h2 id="upg-h">Turn your assessment into a practical business plan.</h2>
        <p className="muted">
          {ideaName ? `Built on the research already done for ${ideaName}${marketLabel ? ` in ${marketLabel}` : ''}. ` : ''}
          <strong>{PRODUCTS.upgrade.display} additional</strong> to the {PRODUCTS.standard.display} standard report you have already bought; it is not a {PRODUCTS.upgrade.display} total. One-time payment, no subscription.
        </p>
      </div>
      <div className="upgrade__grid">
        {UPGRADE_INCLUDES.map((u) => (
          <div key={u.title} className="upgrade__item">
            <LockedPreview title={u.title} body={u.body} compact />
          </div>
        ))}
      </div>
      <div className="upgrade__foot">
        <ul className="upgrade__list">
          {UPGRADE_INCLUDES.map((u) => <li key={u.title}><strong>{u.title}:</strong> {u.body}</li>)}
        </ul>
        {error && <p className="field__error" role="alert">{error}</p>}
        {onUpgrade ? (
          <button type="button" className="btn btn--accent btn--lg" onClick={onUpgrade} disabled={busy || available === false}>
            {busy ? 'Preparing checkout…' : `Unlock my detailed report — ${PRODUCTS.upgrade.display}`}
          </button>
        ) : (
          <p className="small muted">Offered on your report page after you have read the standard report.</p>
        )}
        <p className="small muted">Previews above are illustrative placeholders, not your findings. Your detailed report is researched and written after the upgrade is confirmed; nothing is generated or sent before then.</p>
      </div>
    </section>
  );
}
