import type { FinancialResult } from '@/lib/api';
import { FinancialTable, Sources } from './ReportParts';
import type { DetailedReport } from './types';

export function DetailedReportView({ report, fin, generatedAt }: { report: DetailedReport; fin: FinancialResult; generatedAt: string | null }) {
  return (
    <article className="web-report web-report--detailed" aria-label="Detailed report">
      <header className="web-report__head">
        <p className="eyebrow eyebrow--gold">Detailed report</p>
        <h2>{report.title}</h2>
      </header>
      <section className="report-section" aria-labelledby="exec-h">
        <h2 id="exec-h">Executive summary</h2>
        <ul>{report.executive_summary.map((s, i) => <li key={i}>{s}</li>)}</ul>
      </section>
      {report.sections.map((s) => (
        <section key={s.id} className="report-section" aria-labelledby={`d-${s.id}`}>
          <h2 id={`d-${s.id}`}>{s.heading}</h2>
          {s.paragraphs.map((p, i) => <p key={i}>{p}</p>)}
          {s.bullets.length > 0 && <ul>{s.bullets.map((b, i) => <li key={i}>{b}</li>)}</ul>}
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
