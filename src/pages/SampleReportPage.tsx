import { Link } from 'react-router-dom';
import { ButtonLink } from '@/components/Button';
import { Notice } from '@/components/Notice';
import { usePageTitle } from '@/components/usePageTitle';
import { PRICE } from '@/config/product';
import '@/styles/report.css';

/*
  ILLUSTRATIVE SAMPLE. The idea, the customer and every figure below are
  invented to show the structure and tone of a report. Nothing here is
  research. Where a real report would cite a source, this sample shows a
  bracketed placeholder instead of a fabricated statistic.
*/

const SECTIONS = [
  { id: 's1', label: '1. Summary and verdict' },
  { id: 's2', label: '2. The idea as submitted' },
  { id: 's3', label: '3. Market and demand' },
  { id: 's4', label: '4. Competition and positioning' },
  { id: 's5', label: '5. The numbers' },
  { id: 's6', label: '6. Fit with your circumstances' },
  { id: 's7', label: '7. Risks and your biggest concern' },
  { id: 's8', label: '8. Recommended next steps' },
  { id: 's9', label: '9. Sources and assumptions' },
];

function Placeholder({ children }: { children: string }) {
  return <span className="placeholder">[{children}]</span>;
}

export function SampleReportPage() {
  usePageTitle('Sample report (illustrative)');

  return (
    <div className="page-enter">
      <div className="container report-intro">
        <span className="eyebrow">Sample report</span>
        <h1>What a report looks like</h1>
        <p className="lead">
          This is an illustrative sample for a made-up idea. It shows the sections, the tone and how
          evidence and assumptions are separated. Real reports are researched for your idea and
          market and run longer.
        </p>
        <Notice tone="warning" title="Illustrative content, not research" role="note">
          <p>
            The business, the customer and all figures below are invented for demonstration. Items
            shown in square brackets mark where a real report cites a source or a researched figure.
            Do not use anything here as market data.
          </p>
        </Notice>
      </div>

      <div className="container report-layout">
        <nav className="report-toc" aria-label="Report sections">
          <p className="report-toc__title">Contents</p>
          <ol>
            {SECTIONS.map((s) => (
              <li key={s.id}>
                <a href={`#${s.id}`}>{s.label}</a>
              </li>
            ))}
          </ol>
        </nav>

        <article className="report prose" aria-label="Illustrative sample report">
          <header className="report__head">
            <p className="report__stamp">Illustrative sample</p>
            <p className="report__meta">Feasibility report · Prepared for a fictional customer</p>
            <h2 className="report__title">Northside Mobile Dog Grooming</h2>
            <dl className="report__facts">
              <div>
                <dt>Primary market</dt>
                <dd>United Kingdom · Leeds (fictional)</dd>
              </div>
              <div>
                <dt>Stage</dt>
                <dd>Just an idea</dd>
              </div>
              <div>
                <dt>Customer type</dt>
                <dd>Consumers (B2C)</dd>
              </div>
              <div>
                <dt>Report date</dt>
                <dd>
                  <Placeholder>date</Placeholder>
                </dd>
              </div>
            </dl>
          </header>

          <section id="s1">
            <h2>1. Summary and verdict</h2>
            <div className="verdict">
              <p className="verdict__label">Overall assessment</p>
              <p className="verdict__value">
                <Placeholder>e.g. Feasible with conditions</Placeholder>
              </p>
              <p className="verdict__note">
                Verdicts use a five-point scale from “Not feasible as described” to “Feasible”. Each is
                explained, never just scored.
              </p>
            </div>
            <p>
              A real summary states, in plain language, whether the idea can reach the customer’s
              income objective within their capital, hours and timeframe; what the evidence supports;
              what it does not; and the two or three things that would change the verdict.
            </p>
            <ul>
              <li>
                <strong>Demand:</strong> <Placeholder>one-line finding with confidence level</Placeholder>
              </li>
              <li>
                <strong>Competition:</strong> <Placeholder>one-line finding</Placeholder>
              </li>
              <li>
                <strong>Economics:</strong> break-even at roughly <Placeholder>n</Placeholder> grooms per
                month on the customer’s stated price and cost assumptions (worked in section 5).
              </li>
              <li>
                <strong>Fit:</strong> <Placeholder>one-line finding on capital, hours and experience</Placeholder>
              </li>
            </ul>
          </section>

          <section id="s2">
            <h2>2. The idea as submitted</h2>
            <p>
              This section restates what the customer told us so the reasoning can be checked against
              it. Figures the customer marked as unknown are listed, and section 9 shows what we
              assumed instead.
            </p>
            <table>
              <thead>
                <tr>
                  <th>Input</th>
                  <th>Customer’s answer (fictional)</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Offer</td>
                  <td>Van-based dog grooming at the customer’s home, full groom or wash-and-tidy.</td>
                </tr>
                <tr>
                  <td>Expected price</td>
                  <td>£45 per full groom</td>
                </tr>
                <tr>
                  <td>Capital available</td>
                  <td>£8,000</td>
                </tr>
                <tr>
                  <td>Hours per week</td>
                  <td>20 to 35</td>
                </tr>
                <tr>
                  <td>Start-up costs</td>
                  <td>Unknown (to be researched)</td>
                </tr>
                <tr>
                  <td>Income objective</td>
                  <td>Replace current income; target £26,000 per year</td>
                </tr>
                <tr>
                  <td>Biggest concern</td>
                  <td>“Is there enough demand near me to fill a week?”</td>
                </tr>
              </tbody>
            </table>
          </section>

          <section id="s3">
            <h2>3. Market and demand</h2>
            <p>
              A real report draws on public sources for the primary market: official statistics,
              trade bodies, regulators, planning and licensing data, search and listing volumes, and
              local demographic data for the stated area. Each finding is tagged with how much weight
              it can bear.
            </p>
            <h3>What the evidence says</h3>
            <ul>
              <li>
                Household pet ownership in the area: <Placeholder>figure, source, year</Placeholder>
              </li>
              <li>
                Indicators of local demand for mobile grooming (listings, searches, waiting times):{' '}
                <Placeholder>finding, source</Placeholder>
              </li>
              <li>
                Seasonality and repeat frequency typical for the service:{' '}
                <Placeholder>finding, source</Placeholder>
              </li>
            </ul>
            <h3>Confidence</h3>
            <p>
              <Placeholder>High / Medium / Low</Placeholder>, with one sentence explaining why, for
              example because the data is national rather than local.
            </p>
          </section>

          <section id="s4">
            <h2>4. Competition and positioning</h2>
            <p>
              Who already serves this customer in the stated area, what they charge, how they are
              rated, and whether the customer’s proposed difference is visible and valued.
            </p>
            <table>
              <thead>
                <tr>
                  <th>Competitor type</th>
                  <th>Typical price</th>
                  <th>How they win</th>
                  <th>Gap you could use</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Established mobile groomers</td>
                  <td>
                    <Placeholder>range, source</Placeholder>
                  </td>
                  <td>
                    <Placeholder>finding</Placeholder>
                  </td>
                  <td>
                    <Placeholder>finding</Placeholder>
                  </td>
                </tr>
                <tr>
                  <td>Salon groomers</td>
                  <td>
                    <Placeholder>range, source</Placeholder>
                  </td>
                  <td>
                    <Placeholder>finding</Placeholder>
                  </td>
                  <td>
                    <Placeholder>finding</Placeholder>
                  </td>
                </tr>
                <tr>
                  <td>Pet retail chains with grooming</td>
                  <td>
                    <Placeholder>range, source</Placeholder>
                  </td>
                  <td>
                    <Placeholder>finding</Placeholder>
                  </td>
                  <td>
                    <Placeholder>finding</Placeholder>
                  </td>
                </tr>
              </tbody>
            </table>
            <p>
              The customer’s stated differentiation (“convenience for owners of anxious dogs”) is then
              tested: is anyone already claiming it, and does the price support it?
            </p>
          </section>

          <section id="s5">
            <h2>5. The numbers</h2>
            <p>
              Worked from the customer’s own figures, with researched estimates filling any unknowns.
              The arithmetic below uses only the fictional inputs from section 2 plus clearly marked
              assumptions, so you can see the method.
            </p>
            <h3>Assumptions used in this sample</h3>
            <ul>
              <li>Price per groom: £45 (customer input)</li>
              <li>
                Variable cost per groom (consumables, fuel): £7{' '}
                <em>(illustrative assumption, would be researched)</em>
              </li>
              <li>
                Fixed monthly costs (van finance, insurance, phone, software): £650{' '}
                <em>(illustrative assumption, would be researched)</em>
              </li>
            </ul>
            <h3>Break-even</h3>
            <p>
              Contribution per groom = £45 − £7 = <strong>£38</strong>. Fixed costs ÷ contribution = £650
              ÷ £38 ≈ <strong>18 grooms per month</strong> to cover costs before paying yourself.
            </p>
            <h3>Reaching the income objective</h3>
            <p>
              To draw £26,000 a year (about £2,170 per month) on top of fixed costs requires (£650 +
              £2,170) ÷ £38 ≈ <strong>75 grooms per month</strong>, or roughly 17 to 19 per week. At an
              assumed 90 minutes per visit including travel, that is 26 to 29 hours of appointments,
              inside the customer’s 20 to 35 hour window but with little slack for admin, marketing or
              quiet weeks.
            </p>
            <h3>Sensitivity</h3>
            <table>
              <thead>
                <tr>
                  <th>Scenario</th>
                  <th>Grooms per month for target</th>
                  <th>Comment</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Price £40</td>
                  <td>≈ 86</td>
                  <td>Target becomes hard to reach within hours available.</td>
                </tr>
                <tr>
                  <td>Price £45 (base)</td>
                  <td>≈ 75</td>
                  <td>Feasible on hours, tight on utilisation.</td>
                </tr>
                <tr>
                  <td>Price £55</td>
                  <td>≈ 59</td>
                  <td>More headroom, if the local market supports the price (section 4).</td>
                </tr>
              </tbody>
            </table>
            <p className="small muted">
              All scenario figures derive from the illustrative assumptions above, not from market data.
            </p>
          </section>

          <section id="s6">
            <h2>6. Fit with your circumstances</h2>
            <table>
              <thead>
                <tr>
                  <th>Factor</th>
                  <th>What the idea needs</th>
                  <th>What you have</th>
                  <th>Read</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Capital</td>
                  <td>
                    <Placeholder>researched start-up range</Placeholder>
                  </td>
                  <td>£8,000</td>
                  <td>
                    <Placeholder>e.g. Sufficient / Gap of £x</Placeholder>
                  </td>
                </tr>
                <tr>
                  <td>Hours</td>
                  <td>≈ 26 to 29 hours of appointments plus admin</td>
                  <td>20 to 35 hours</td>
                  <td>Tight but workable</td>
                </tr>
                <tr>
                  <td>Experience</td>
                  <td>Grooming skill and animal handling; qualifications expected by customers</td>
                  <td>None in this industry (customer input)</td>
                  <td>Training needed before launch; affects timeframe</td>
                </tr>
                <tr>
                  <td>Timeframe</td>
                  <td>
                    <Placeholder>training + van fit-out lead time</Placeholder>
                  </td>
                  <td>3 to 6 months</td>
                  <td>
                    <Placeholder>finding</Placeholder>
                  </td>
                </tr>
              </tbody>
            </table>
          </section>

          <section id="s7">
            <h2>7. Risks and your biggest concern</h2>
            <p>
              <strong>Your concern:</strong> “Is there enough demand near me to fill a week?”
            </p>
            <p>
              The report answers this directly using section 3 and 5: how many households within a
              realistic travel radius own dogs, what share use paid grooming, how often, and what
              share of that a new entrant could plausibly win in year one. It then states whether 75
              grooms a month is a small or large share of that pool.
            </p>
            <h3>Other material risks</h3>
            <ol>
              <li>
                <strong>Skill and reputation risk.</strong> No industry experience; early reviews carry
                weight in a local service business.
              </li>
              <li>
                <strong>Vehicle downtime.</strong> One van means no revenue when it is off the road.
              </li>
              <li>
                <strong>Utilisation.</strong> Travel between appointments limits daily capacity more
                than a salon.
              </li>
            </ol>
          </section>

          <section id="s8">
            <h2>8. Recommended next steps</h2>
            <ol>
              <li>Price-test with 20 local dog owners before buying a van: ask for a deposit on a first appointment.</li>
              <li>Get quotes for van fit-out and insurance to replace the unknown start-up cost with a real figure.</li>
              <li>Complete a recognised grooming course; plan launch date from its end, not from today.</li>
              <li>Map competitors within your radius and note who is not taking new clients.</li>
              <li>Re-run the break-even with real quotes; if grooms-per-month exceeds 80, revisit price or hours.</li>
            </ol>
          </section>

          <section id="s9">
            <h2>9. Sources and assumptions</h2>
            <p>
              Every researched figure in a real report is listed here with its source and date, and
              every assumption is listed with why it was chosen, so you or an adviser can challenge it.
            </p>
            <table>
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Type</th>
                  <th>Source or basis</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Pet ownership, local area</td>
                  <td>Researched</td>
                  <td>
                    <Placeholder>named public source, year</Placeholder>
                  </td>
                </tr>
                <tr>
                  <td>Variable cost per groom</td>
                  <td>Assumption</td>
                  <td>Illustrative figure for this sample only</td>
                </tr>
                <tr>
                  <td>Fixed monthly costs</td>
                  <td>Assumption</td>
                  <td>Illustrative figure for this sample only</td>
                </tr>
              </tbody>
            </table>
            <p className="small muted">
              Reports are desk research and general guidance, not financial, legal, tax or investment
              advice. Outcomes are not guaranteed.
            </p>
          </section>
        </article>
      </div>

      <div className="container report-cta">
        <h2>Want this for your idea?</h2>
        <p className="lead">Six short sections, one payment, your report by email.</p>
        <ButtonLink to="/validate" size="lg">
          Validate my idea · {PRICE.display}
        </ButtonLink>
        <p className="small muted">
          Or read the draft <Link to="/terms">terms</Link> and <Link to="/refunds">refund policy</Link>{' '}
          first.
        </p>
      </div>
    </div>
  );
}
