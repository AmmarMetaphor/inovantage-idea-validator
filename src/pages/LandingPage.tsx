import { Link } from 'react-router-dom';
import { ButtonLink } from '@/components/Button';
import { usePageTitle } from '@/components/usePageTitle';
import { COMBINED_TOTAL, DELIVERY_COPY, DETAILED_REPORT_SECTIONS, MARKETS, PRICE, PRODUCTS } from '@/config/product';
import '@/styles/landing.css';

const STEPS = [
  { title: 'Answer eight questions', body: 'Your idea, industry, market, customer, pricing, resources, stage and email. About five minutes over three short screens. “Not sure” is allowed.' },
  { title: 'Review and pay once', body: `Check your answers, confirm your email and pay ${PRICE.display}. No account, no subscription.` },
  { title: 'Watch real progress, then read', body: `Your private page shows the real stages: payment confirmed, researching, writing, ready, email sent. ${DELIVERY_COPY.short}` },
];

const REPORT_CONTENTS = [
  { title: 'A clear verdict', body: 'Worth testing, refine before investing, or reconsider the current approach, with a short evidence-based explanation.' },
  { title: 'Readiness scorecard', body: 'Demand, competition, differentiation, financial clarity and founder fit, each rated or marked “insufficient evidence”.' },
  { title: 'Chart and compact SWOT', body: 'One chart where the evidence supports it, clearly labelled when it is a scenario or a data gap, plus a compact SWOT.' },
  { title: 'Financial scenarios', body: 'Low, base and high scenarios computed in code from your inputs, with every assumption listed and break-even explained.' },
  { title: 'Risks, fixes and an experiment', body: 'Three key risks with validation methods, five prioritised improvements, and a practical experiment with budget and success criterion.' },
  { title: 'Sources and limitations', body: 'Retrievable sources with publisher and date, evidence separated from assumptions, and an honest list of what could not be found.' },
];

const AUDIENCES = [
  { title: 'First-time founders', body: 'You have an idea and a nagging worry. Get an independent read before you spend money, quit a job or tell your family.' },
  { title: 'Existing business owners', body: 'You are weighing a new service, location or product line. We assess it against your resources and the local evidence.' },
  { title: 'Early-stage startups', body: 'You need a structured, sourced view for a pitch, a partner or your own conviction.' },
];

const FAQS = [
  { q: 'What do I actually get?', a: 'A two-page PDF and an interactive web report on your private page, with a verdict, scorecard, chart, SWOT, financial scenarios, risks, improvements, an experiment, sources and limitations. See the illustrative sample.' },
  { q: 'How long does it take?', a: `${DELIVERY_COPY.long} We do not promise a fixed turnaround; the page shows the real stage your report is at.` },
  { q: 'Is this advice?', a: 'No. It is desk research and general guidance to help you decide. It is not financial, legal, tax or investment advice, and it does not state a probability of success.' },
  { q: 'Which countries do you cover?', a: `${MARKETS.map((m) => m.label).join(', ')}. One report covers one idea in one primary market.` },
  { q: 'Do I need an account?', a: 'No. Your private link is emailed to you and keeps working; if you lose it, “Find my report” re-sends it to the same address.' },
  { q: 'What is the detailed report upgrade?', a: `An optional full report for ${PRODUCTS.upgrade.display} additional to the ${PRICE.display} standard report (${COMBINED_TOTAL.display} in total if you buy both), offered after you have read the standard report.` },
  { q: 'What if I don’t know my costs or prices?', a: 'Choose “Not sure”. The report uses clearly labelled assumptions and lists what was missing.' },
];

export function LandingPage() {
  usePageTitle();

  return (
    <div className="page-enter">
      <section className="hero section--dark">
        <div className="container hero__inner">
          <div className="hero__copy">
            <span className="eyebrow">Idea validation reports</span>
            <h1>Know whether your idea is worth testing before you bet on it.</h1>
            <p className="lead">
              Answer eight questions. Pay {PRICE.display} once. Get an evidence-based verdict, scorecard and
              financial scenarios on a private web page and a two-page PDF.
            </p>
            <div className="hero__actions">
              <ButtonLink to="/validate" variant="accent" size="lg">
                Validate my idea · {PRICE.display}
              </ButtonLink>
              <ButtonLink to="/sample-report" variant="secondary" size="lg">
                See a sample report
              </ButtonLink>
            </div>
            <ul className="hero__facts" aria-label="Key facts">
              <li>UK, US and Australia</li>
              <li>No account needed</li>
              <li>Real progress, honest sources</li>
            </ul>
          </div>
          <div className="hero__panel" aria-hidden="true">
            <div className="report-preview">
              <div className="report-preview__bar"><span /><span /><span /></div>
              <p className="report-preview__title">Idea validation report</p>
              <p className="report-preview__sub">Verdict · Scorecard · SWOT · Scenarios</p>
              <div className="report-preview__lines"><span style={{ width: '92%' }} /><span style={{ width: '78%' }} /><span style={{ width: '85%' }} /></div>
              <div className="report-preview__blocks"><span /><span /><span /></div>
              <div className="report-preview__lines"><span style={{ width: '88%' }} /><span style={{ width: '70%' }} /></div>
            </div>
          </div>
        </div>
      </section>

      <section id="how-it-works" className="section">
        <div className="container">
          <div className="section-head">
            <span className="eyebrow">How it works</span>
            <h2>Three steps. One decision, better informed.</h2>
          </div>
          <ol className="grid grid--3 steps-grid">
            {STEPS.map((s, i) => (
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
            <span className="eyebrow">What you receive</span>
            <h2>Two pages that say what the evidence supports, and what it does not.</h2>
            <p className="lead">Every number is either sourced, computed from your inputs, or labelled as an assumption. Nothing is invented to fill a gap.</p>
          </div>
          <div className="grid grid--3">
            {REPORT_CONTENTS.map((c) => (
              <div key={c.title} className="feature">
                <h3>{c.title}</h3>
                <p className="muted">{c.body}</p>
              </div>
            ))}
          </div>
          <p className="section-foot"><Link to="/sample-report">Read an illustrative sample report</Link></p>
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
            <p className="muted">The detailed upgrade is offered after you have read the standard report. It is {PRODUCTS.upgrade.display} additional, not a {PRODUCTS.upgrade.display} package: buying both costs {COMBINED_TOTAL.display} in total.</p>
          </div>
          <div className="pricing__stack">
            <div className="pricing__card">
              <p className="pricing__amount">
                <span className="pricing__value">{PRODUCTS.standard.display}</span>
                <span className="pricing__per">{PRODUCTS.standard.priceNote}</span>
              </p>
              <p className="pricing__name">{PRODUCTS.standard.name}</p>
              <ul className="pricing__list">
                <li>Two-page PDF and interactive web report</li>
                <li>Verdict, scorecard, chart, SWOT, scenarios</li>
                <li>Risks, improvements, experiment, sources</li>
                <li>One idea, one primary market</li>
              </ul>
              <ButtonLink to="/validate" variant="accent" size="lg" full>Start the questionnaire</ButtonLink>
            </div>
            <div className="pricing__card pricing__card--secondary">
              <p className="pricing__amount">
                <span className="pricing__value">+{PRODUCTS.upgrade.display}</span>
                <span className="pricing__per">{PRODUCTS.upgrade.priceNote}</span>
              </p>
              <p className="pricing__name">{PRODUCTS.upgrade.name}</p>
              <ul className="pricing__list">
                {DETAILED_REPORT_SECTIONS.slice(0, 5).map((s) => <li key={s}>{s}</li>)}
                <li>…and four more sections</li>
              </ul>
              <p className="small pricing__note">Available from your standard report page. {PRODUCTS.standard.display} + {PRODUCTS.upgrade.display} = {COMBINED_TOTAL.display} total.</p>
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
          <p className="lead">Eight honest answers. A verdict you can act on.</p>
          <ButtonLink to="/validate" size="lg">Validate my idea · {PRICE.display}</ButtonLink>
        </div>
      </section>
    </div>
  );
}
