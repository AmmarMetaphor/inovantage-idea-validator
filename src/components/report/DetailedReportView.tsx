import type { FinancialResult } from '@/lib/api';
import { FinancialTable, SectionTitle, Sources } from './ReportParts';
import type { DetailedReport } from './types';

const SECTION_NAV: Record<string, string> = {
  market_opportunity: 'Market',
  customer_segments: 'Customers',
  competitors: 'Competitors',
  pricing_route_to_market: 'Pricing',
  cost_assumptions: 'Costs',
  financial_scenarios: 'Financials',
  sensitivity_risks: 'Sensitivity',
  roadmap: 'Roadmap',
  sources_limitations: 'Sources',
};

export function DetailedReportView({ report, fin, generatedAt }: { report: DetailedReport; fin: FinancialResult; generatedAt: string | null }) {
  return (
    <article className="web-report web-report--detailed" aria-label="Detailed report">
      <nav className="report-nav" aria-label="Detailed report sections">
        <ul>
          <li><a href="#d-summary">Summary</a></li>
          {report.sections.map((s) => <li key={s.id}><a href={`#d-${s.id}`}>{SECTION_NAV[s.id] ?? s.heading}</a></li>)}
        </ul>
      </nav>
      <header className="web-report__head" id="d-summary">
        <p className="eyebrow eyebrow--gold">Detailed report</p>
        <h2>{report.title}</h2>
      </header>
      <section className="report-section" aria-labelledby="exec-h">
        <SectionTitle id="exec-h" title="Executive summary" />
        <ul className="exec">{report.executive_summary.map((s, i) => <li key={i}>{s}</li>)}</ul>
      </section>
      {report.sections.map((s) => (
        <section key={s.id} className="report-section" id={`d-${s.id}`} aria-labelledby={`dh-${s.id}`}>
          <SectionTitle id={`dh-${s.id}`} title={s.heading} />
          {s.paragraphs.map((p, i) => <p key={i}>{p}</p>)}
          {s.bullets.length > 0 && <ul className="insight__list">{s.bullets.map((b, i) => <li key={i}>{b}</li>)}</ul>}
          {s.table && (
            <div className="table-scroll">
              <table className="data-table">
                <caption className="visually-hidden">{s.heading}</caption>
                <thead><tr>{s.table.columns.map((c) => <th key={c} scope="col">{c}</th>)}</tr></thead>
                <tbody>{s.table.rows.map((r, i) => <tr key={i}>{r.map((c, j) => (j === 0 ? <th key={j} scope="row">{c}</th> : <td key={j}>{c}</td>))}</tr>)}</tbody>
              </table>
            </div>
          )}
          {s.id === 'financial_scenarios' && <FinancialTable fin={fin} />}
          {s.id === 'sensitivity_risks' && report.sensitivity.length > 0 && (
            <table className="data-table">
              <caption className="visually-hidden">Sensitivity</caption>
              <thead><tr><th scope="col">Change</th><th scope="col">Effect</th></tr></thead>
              <tbody>{report.sensitivity.map((r, i) => <tr key={i}><th scope="row">{r.change}</th><td>{r.effect}</td></tr>)}</tbody>
            </table>
          )}
        </section>
      ))}
      <Sources sources={report.sources} claims={report.claims} limitations={report.limitations} retrievedOn={generatedAt ? generatedAt.slice(0, 10) : null} />
    </article>
  );
}
