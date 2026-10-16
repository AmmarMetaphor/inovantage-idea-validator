import { Link } from 'react-router-dom';
import { ButtonLink } from '@/components/Button';
import { Notice } from '@/components/Notice';
import { usePageTitle } from '@/components/usePageTitle';
import { COMBINED_TOTAL, DETAILED_REPORT_SECTIONS, PRICE, PRODUCTS, SCORECARD_DIMENSIONS } from '@/config/product';
import { StatusLabel } from '@/components/report/ReportParts';
import '@/styles/report.css';
import '@/styles/web-report.css';

/*
  ILLUSTRATIVE SAMPLE. The idea, the customer and every figure below are
  invented to show the structure and tone of the two-page standard report.
  Nothing here is research. Where a real report cites a source, this sample
  shows a bracketed placeholder instead of a fabricated statistic.
*/

function Placeholder({ children }: { children: string }) {
  return <span className="placeholder">[{children}]</span>;
}

export function SampleReportPage() {
  usePageTitle('Sample report (illustrative)');

  return (
    <div className="page-enter">
      <div className="container report-intro">
        <span className="eyebrow">Sample report</span>
        <h1>What the two-page report looks like</h1>
        <p className="lead">
          An illustrative sample for a made-up idea. It shows every section of the {PRICE.display} standard report
          and how evidence, assumptions and gaps are separated. Your report is researched for your idea and market.
        </p>
        <Notice tone="warning" title="Illustrative content, not research" role="note">
          <p>The business, the customer and all figures are invented for demonstration. Square brackets mark where a real report cites a retrievable source with its publisher and date. Do not use anything here as market data.</p>
        </Notice>
      </div>

      <div className="container" style={{ maxWidth: '52rem', paddingBottom: 'var(--space-16)' }}>
        <article className="web-report" aria-label="Illustrative sample report">
          <header className="web-report__head">
            <p className="eyebrow eyebrow--gold">Illustrative sample · page 1</p>
            <h2>Northside Mobile Dog Grooming</h2>
            <p className="lead">Van-based grooming at the owner’s home in north Leeds (fictional), United Kingdom.</p>
          </header>

          <section className="verdict-banner verdict-banner--caution" aria-labelledby="sv">
            <p className="eyebrow">Verdict</p>
            <h2 id="sv" className="verdict-banner__label">Refine before investing <StatusLabel tone="caution">Caution: refine</StatusLabel></h2>
            <p className="verdict-banner__text">
              A real verdict explains, in under 85 words, what the evidence supports and what it does not: for example that
              local demand indicators were <Placeholder>finding with source and date</Placeholder>, that competitors price
              at <Placeholder>range with source</Placeholder>, and that the income objective needs roughly 75 grooms a month
              on the stated price and assumed costs, which is tight for the hours available.
            </p>
          </section>

          <div className="web-report__grid">
            <section className="report-section" aria-labelledby="ssc">
              <h2 id="ssc">Readiness scorecard</h2>
              <ol className="scorecard">
                {SCORECARD_DIMENSIONS.map((d, i) => {
                  const score = [null, 3, 4, 2, 3][i];
                  const tone = score === null ? 'na' : score >= 4 ? 'go' : score >= 3 ? 'caution' : 'stop';
                  return (
                    <li key={d.id} className="scorecard__row">
                      <div className="scorecard__head">
                        <span className="scorecard__dim">{d.label}</span>
                        <span className="scorecard__pips" role="img" aria-label={score === null ? 'not rated' : `${score} out of 5`}>
                          {[1, 2, 3, 4, 5].map((n) => <span key={n} className={`pip ${score !== null && n <= score ? 'pip--on' : ''}`} />)}
                        </span>
                        <StatusLabel tone={tone}>{score === null ? 'Insufficient evidence' : ['', 'Weak', 'Limited', 'Moderate', 'Good', 'Strong'][score]}</StatusLabel>
                      </div>
                      <p className="scorecard__note"><Placeholder>one-line note grounded in a source or the answers</Placeholder></p>
                      <p className="scorecard__rubric">{d.rubric}</p>
                    </li>
                  );
                })}
              </ol>
              <p className="small muted">Indicative readiness score: shown only when at least three dimensions can be rated; never a probability of success.</p>
            </section>
            <section className="report-section" aria-labelledby="sch">
              <p className="eyebrow eyebrow--gold">Illustrative scenario</p>
              <h2 id="sch">Grooms needed per month</h2>
              <svg viewBox="0 0 320 180" className="chart__svg" role="img" aria-label="Illustrative bars: break-even 18, target at £45 is 75, target at £55 is 59">
                {[['Break-even', 18], ['Target @£45', 75], ['Target @£55', 59]].map(([l, v], i) => {
                  const h = (Number(v) / 75) * 120;
                  const x = 20 + i * 100;
                  return (
                    <g key={String(l)}>
                      <rect x={x} y={150 - h} width={70} height={h} className="bar bar--scenario" />
                      <text x={x + 35} y={145 - h} textAnchor="middle" className="chart__value">{v}</text>
                      <text x={x + 35} y={166} textAnchor="middle" className="chart__label">{l}</text>
                    </g>
                  );
                })}
              </svg>
              <p className="small muted">Computed from the fictional inputs below, not from market data. A real report uses an evidence chart only when a source supplies the series; otherwise it labels the scenario or states the data gap.</p>
            </section>
          </div>

          <section className="report-section" aria-labelledby="ssw">
            <h2 id="ssw">Compact SWOT</h2>
            <div className="swot">
              <div className="swot__quad swot__quad--go"><h3>Strengths</h3><ul><li>Convenience for owners of anxious dogs</li><li>Low fixed premises cost</li></ul></div>
              <div className="swot__quad swot__quad--stop"><h3>Weaknesses</h3><ul><li>No grooming qualification yet</li><li>Single van, no cover</li></ul></div>
              <div className="swot__quad swot__quad--caution"><h3>Opportunities</h3><ul><li><Placeholder>evidence-backed gap, with source</Placeholder></li></ul></div>
              <div className="swot__quad swot__quad--na"><h3>Threats</h3><ul><li>Established mobile groomers with reviews</li></ul></div>
            </div>
          </section>

          <header className="web-report__head" style={{ marginTop: 'var(--space-10)' }}>
            <p className="eyebrow eyebrow--gold">Illustrative sample · page 2</p>
          </header>

          <section className="report-section" aria-labelledby="sfin">
            <h2 id="sfin">Financial scenarios (computed from stated inputs)</h2>
            <div className="table-scroll">
              <table className="data-table">
                <caption className="visually-hidden">Monthly scenarios, fictional</caption>
                <thead><tr><th scope="col">Scenario</th><th scope="col">Units</th><th scope="col">Revenue</th><th scope="col">Contribution</th><th scope="col">Fixed</th><th scope="col">Profit</th></tr></thead>
                <tbody>
                  <tr><th scope="row">Low</th><td>30</td><td>£1,350</td><td>£1,140</td><td>£650</td><td>£490</td></tr>
                  <tr><th scope="row">Base</th><td>60</td><td>£2,700</td><td>£2,280</td><td>£650</td><td>£1,630</td></tr>
                  <tr><th scope="row">High</th><td>90</td><td>£4,050</td><td>£3,420</td><td>£650</td><td>£2,770</td></tr>
                </tbody>
              </table>
            </div>
            <p style={{ marginTop: 'var(--space-3)' }}><strong>Break-even:</strong> 18 grooms a month cover fixed costs of £650 at £38 contribution per groom.</p>
            <p className="small muted">Assumptions: price £45 per groom (customer input); cost per groom £7 (assumption, illustrative); fixed costs £650 per month (assumption, illustrative); volumes 30 / 60 / 90 (assumption). Every assumption is listed like this in a real report.</p>
          </section>

          <section className="report-section" aria-labelledby="srk">
            <h2 id="srk">Three key risks and how to validate them</h2>
            <ol className="risks">
              <li><p><strong>Risk:</strong> Not enough local demand to fill a week.</p><p><strong>Validate:</strong> Take deposits for 20 first appointments before buying the van.</p></li>
              <li><p><strong>Risk:</strong> Skill and reputation with no qualification.</p><p><strong>Validate:</strong> Complete a recognised course; launch with ten reviewed trial grooms.</p></li>
              <li><p><strong>Risk:</strong> Van downtime stops all revenue.</p><p><strong>Validate:</strong> Price a hire fallback and insurance before committing.</p></li>
            </ol>
          </section>

          <div className="web-report__grid">
            <section className="report-section" aria-labelledby="simp">
              <h2 id="simp">Five prioritised improvements</h2>
              <ol className="actions">
                <li>Replace the unknown start-up cost with three real van fit-out quotes.</li>
                <li>Decide the travel radius and price travel time into the £45.</li>
                <li>Name the two nearest mobile competitors and position against them.</li>
                <li>Plan the training end date and launch from it, not from today.</li>
                <li>Set a minimum monthly volume that would trigger a rethink.</li>
              </ol>
            </section>
            <section className="report-section experiment" aria-labelledby="sexp">
              <h2 id="sexp">A practical validation experiment</h2>
              <p>Offer 20 discounted first grooms to local owners via two community groups, with a £10 deposit.</p>
              <dl className="kv"><dt>Budget</dt><dd>£150</dd><dt>Duration</dt><dd>4 weeks</dd><dt>Success criterion</dt><dd>At least 12 deposits paid and 8 grooms completed with a rebooking request.</dd></dl>
            </section>
          </div>

          <section className="report-section" aria-labelledby="ssrc">
            <h2 id="ssrc">Sources and research limitations</h2>
            <ol className="sources">
              <li><Placeholder>Source title</Placeholder><span className="sources__meta"><Placeholder>publisher · date · geography · historical or forecast</Placeholder></span><span className="sources__url"><Placeholder>retrievable URL</Placeholder></span></li>
              <li><Placeholder>Source title</Placeholder><span className="sources__meta"><Placeholder>publisher · date · geography</Placeholder></span><span className="sources__url"><Placeholder>retrievable URL</Placeholder></span></li>
            </ol>
            <h3 className="h4">Limitations</h3>
            <ul><li>No local figure for paid-grooming frequency was found; the base volume is an assumption.</li><li>Start-up cost was marked “not sure” and is assumed pending quotes.</li></ul>
          </section>

          <section className="cta-box" aria-labelledby="scta">
            <h2 id="scta" className="h4">Talk to an expert</h2>
            <p>For detailed consultation on market research for your product, business planning, and financial feasibility, book a call with our experts by emailing <a href="mailto:support@inovantage.co.uk?subject=Consultation%20request">support@inovantage.co.uk</a>.</p>
          </section>

          <section className="upgrade" aria-labelledby="sup">
            <div className="upgrade__preview" aria-hidden="true">
              <p className="upgrade__preview-label">Illustrative preview</p>
              <div className="upgrade__blur"><p /><p /><p /><p /></div>
            </div>
            <div className="upgrade__body">
              <p className="eyebrow eyebrow--gold">{PRODUCTS.upgrade.name}</p>
              <h2 id="sup">Go deeper on this idea</h2>
              <p className="muted">{PRODUCTS.upgrade.display} additional to the {PRICE.display} standard report ({COMBINED_TOTAL.display} in total). Offered on your report page after you have read the verdict.</p>
              <ul className="upgrade__list">{DETAILED_REPORT_SECTIONS.map((s) => <li key={s}>{s}</li>)}</ul>
            </div>
          </section>
        </article>

        <div className="report-cta">
          <h2>Want this for your idea?</h2>
          <p className="lead">Eight questions, one payment of {PRICE.display}, a verdict you can act on.</p>
          <ButtonLink to="/validate" size="lg">Validate my idea · {PRICE.display}</ButtonLink>
          <p className="small muted">Or read the draft <Link to="/terms">terms</Link> and <Link to="/refunds">refund policy</Link> first.</p>
        </div>
      </div>
    </div>
  );
}
