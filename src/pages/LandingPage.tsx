import { Link } from 'react-router-dom';
import { ButtonLink } from '@/components/Button';
import { usePageTitle } from '@/components/usePageTitle';
import { SampleDashboard } from '@/components/report/SampleDashboard';
import { COMBINED_TOTAL, DELIVERY_COPY, MARKETS, PRICE, PRODUCTS, UPGRADE_INCLUDES } from '@/config/product';
import '@/styles/landing.css';
import '@/styles/web-report.css';

const JOURNEY = [
  { title: 'Share your idea', body: 'Eight short questions over three screens. “Not sure yet” is a valid answer.' },
  { title: 'Get a researched assessment', body: `Pay ${PRICE.display} once. We research your market, score nine criteria and compute the scenarios in code. ${DELIVERY_COPY.short}` },
  { title: 'Choose your next steps', body: 'Read the strengths, what to strengthen, prioritised recommendations and the first test to run. Go deeper with the detailed report if you want to.' },
];

const REPORT_CONTENTS = [
  { title: 'Idea readiness score', body: 'A score out of 100 from nine criteria with published weights, with the evidence confidence shown separately. Withheld, not guessed, when evidence is thin.' },
  { title: 'Market and execution scorecards', body: 'Customer clarity, timing, ease of entry, differentiation and problem fit; MVP practicality, value proposition, feasibility and resources. Each with a reason and one way to strengthen it.' },
  { title: 'Criteria radar and market chart', body: 'The same scores on one shape, and a chart only where a source supports the figures; otherwise a labelled scenario or an honest gap.' },
  { title: 'Financial scenarios', body: 'Low, base and high scenarios computed in code from your inputs, with every assumption listed and break-even explained.' },
  { title: 'Recommendations and the first test', body: 'Key risks with the cheapest way to test them, prioritised recommendations with a purpose and a measure, and one experiment to run first.' },
  { title: 'Sources and limitations', body: 'Retrievable sources with publisher and date, evidence separated from assumptions, and a plain list of what could not be found.' },
];

const AUDIENCES = [
  { title: 'First-time founders', body: 'You have an idea and a nagging worry. Get an independent read before you spend money, quit a job or tell your family.' },
  { title: 'Existing business owners', body: 'You are weighing a new service, location or product line. We assess it against your resources and the local evidence.' },
  { title: 'Early-stage startups', body: 'You need a structured, sourced view for a pitch, a partner or your own conviction.' },
];

const FAQS = [
  { q: 'What do I actually get?', a: 'An interactive web report on your private page and a two-page PDF: readiness score, scorecards, radar, market evidence, financial scenarios, risks, recommendations, the first test, sources and limitations. See the illustrative sample.' },
  { q: 'How long does it take?', a: `${DELIVERY_COPY.long} We do not promise a fixed turnaround; the page shows the real stage your report is at.` },
  { q: 'Is the score a prediction?', a: 'No. It is a directional assessment based on your answers and the available evidence, computed from nine criterion scores with published weights. It is not a probability of business success, and it is withheld when too little can be scored.' },
  { q: 'Is this advice?', a: 'No. It is desk research and general guidance to help you decide. It is not financial, legal, tax or investment advice.' },
  { q: 'Which countries do you cover?', a: `${MARKETS.map((m) => m.label).join(', ')}. One report covers one idea in one primary market.` },
  { q: 'Do I need an account?', a: 'No. Your private link is emailed to you and keeps working; if you lose it, “Find my report” re-sends it to the same address.' },
  { q: 'What is the detailed report upgrade?', a: `An optional detailed report for ${PRODUCTS.upgrade.display} additional to the ${PRICE.display} standard report (${COMBINED_TOTAL.display} in total if you buy both), offered after you have read the standard report.` },
  { q: 'What if I don’t know my costs or prices?', a: 'Choose “Not sure yet”. The report uses clearly labelled assumptions and lists what was missing.' },
];

export function LandingPage() {
  usePageTitle();

  return (
    <div className="page-enter">
      <section className="hero section--dark">
        <div className="container hero__inner">
          <div className="hero__copy">
            <span className="eyebrow">Idea validation reports · from {PRICE.display}</span>
            <h1>Give your business idea a clearer next step.</h1>
            <p className="lead">
              Explore its strengths, understand your market and discover practical ways to improve your chances.
            </p>
            <div className="hero__actions">
              <ButtonLink to="/validate" variant="accent" size="lg">Explore my idea</ButtonLink>
              <ButtonLink to="/sample-report" variant="secondary" size="lg">See a sample report</ButtonLink>
            </div>
            <ul className="hero__facts" aria-label="Key facts">
              <li>{PRICE.display} one-time, no account</li>
              <li>UK, US and Australia</li>
              <li>Sourced evidence, labelled assumptions</li>
            </ul>
          </div>
          <div className="hero__panel">
            <SampleDashboard />
          </div>
        </div>
      </section>

      <section id="how-it-works" className="section">
        <div className="container">
          <div className="section-head">
            <span className="eyebrow">How it works</span>
            <h2>Share your idea → Get a researched assessment → Choose your next steps.</h2>
          </div>
          <ol className="grid grid--3 steps-grid">
            {JOURNEY.map((s, i) => (
              <li key={s.title} className="card">
                <span className="card__num" aria-hidden="true">{i + 1}</span>
                <h3>{s.title}</h3>
                <p className="muted">{s.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="section section--tint">
        <div className="container">
          <div className="section-head">
            <span className="eyebrow">What you receive for {PRICE.display}</span>
            <h2>A report that says what the evidence supports, and what it does not.</h2>
            <p className="lead">Every number is sourced, computed from your inputs, or labelled as an assumption. Nothing is invented to fill a gap, and nothing is softened to sell an upgrade.</p>
          </div>
          <div className="grid grid--3">
            {REPORT_CONTENTS.map((c) => (
              <div key={c.title} className="feature">
                <h3>{c.title}</h3>
                <p className="muted">{c.body}</p>
              </div>
            ))}
          </div>
          <p className="section-foot"><Link to="/sample-report">Read the illustrative sample report</Link></p>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="section-head">
            <span className="eyebrow">Who it is for</span>
            <h2>Written for the person making the decision.</h2>
          </div>
          <div className="grid grid--3">
            {AUDIENCES.map((a) => (
              <div key={a.title} className="card">
                <h3>{a.title}</h3>
                <p className="muted">{a.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="pricing" className="section section--dark">
        <div className="container pricing">
          <div className="pricing__copy">
            <span className="eyebrow">Pricing</span>
            <h2>Start at {PRICE.display}. Go deeper only if you want to.</h2>
            <p className="lead">{PRICE.note}</p>
            <p className="muted">The detailed report is offered after you have read the standard report. It is {PRODUCTS.upgrade.display} additional, not a {PRODUCTS.upgrade.display} total: buying both costs {COMBINED_TOTAL.display}.</p>
          </div>
          <div className="pricing__stack">
            <div className="pricing__card">
              <p className="pricing__amount">
                <span className="pricing__value">{PRODUCTS.standard.display}</span>
                <span className="pricing__per">{PRODUCTS.standard.priceNote}</span>
              </p>
              <p className="pricing__name">{PRODUCTS.standard.name}</p>
              <ul className="pricing__list">
                <li>Idea readiness score with published weights</li>
                <li>Market and execution scorecards, criteria radar</li>
                <li>Market evidence, financial scenarios, risks</li>
                <li>Recommendations, the first test, sources</li>
                <li>Interactive web report and two-page PDF</li>
              </ul>
              <ButtonLink to="/validate" variant="accent" size="lg" full>Explore my idea</ButtonLink>
            </div>
            <div className="pricing__card pricing__card--secondary">
              <p className="pricing__amount">
                <span className="pricing__value">+{PRODUCTS.upgrade.display}</span>
                <span className="pricing__per">{PRODUCTS.upgrade.priceNote}</span>
              </p>
              <p className="pricing__name">{PRODUCTS.upgrade.name}</p>
              <ul className="pricing__list">
                {UPGRADE_INCLUDES.map((u) => <li key={u.title}><strong>{u.title}:</strong> {u.body}</li>)}
              </ul>
              <p className="small pricing__note">One-time upgrade · {PRODUCTS.upgrade.display}, additional to the {PRODUCTS.standard.display} standard report ({COMBINED_TOTAL.display} in total).</p>
            </div>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container container--narrow">
          <div className="section-head">
            <span className="eyebrow">Questions</span>
            <h2>Before you start</h2>
          </div>
          <div className="faq">
            {FAQS.map((f) => (
              <details key={f.q} className="faq__item">
                <summary className="faq__q">{f.q}</summary>
                <p className="faq__a">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="section section--tint">
        <div className="container cta-band">
          <h2>Ready when you are.</h2>
          <p className="lead">Eight honest answers. A clearer next step.</p>
          <ButtonLink to="/validate" size="lg">Explore my idea · {PRICE.display}</ButtonLink>
        </div>
      </section>
    </div>
  );
}
