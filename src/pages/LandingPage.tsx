import { Link } from 'react-router-dom';
import { ButtonLink } from '@/components/Button';
import { usePageTitle } from '@/components/usePageTitle';
import { MARKETS, PRICE, TURNAROUND } from '@/config/product';
import '@/styles/landing.css';

const STEPS = [
  {
    title: 'Answer six short sections',
    body: 'Your idea, customer, pricing, circumstances, costs and concerns. About 15 minutes. “I don’t know yet” is allowed for estimates.',
  },
  {
    title: 'Review and pay once',
    body: `Check your answers, confirm your email and pay ${PRICE.display}. No account, no subscription.`,
  },
  {
    title: 'Receive your report by email',
    body: `A link and a downloadable PDF arrive ${TURNAROUND.label}, researched for your idea and your primary market.`,
  },
];

const REPORT_CONTENTS = [
  {
    title: 'Feasibility verdict',
    body: 'A clear overall assessment with the reasoning behind it, written for your situation rather than a generic template.',
  },
  {
    title: 'Market and demand',
    body: 'What the available evidence says about demand in your country and area, and how confident we are in it.',
  },
  {
    title: 'Competition and positioning',
    body: 'Who already serves your customer, how they price, and where your proposed difference holds up or does not.',
  },
  {
    title: 'Numbers that matter',
    body: 'Break-even, what it takes to reach your income objective, and how sensitive that is to price and volume.',
  },
  {
    title: 'Fit with your circumstances',
    body: 'Capital, hours, experience and timeframe tested against what the idea actually needs.',
  },
  {
    title: 'Risks and next steps',
    body: 'The biggest risks, your stated concern answered directly, and a short list of what to do or check next.',
  },
];

const AUDIENCES = [
  {
    title: 'First-time founders',
    body: 'You have an idea and a nagging worry. Get an independent read before you spend money, quit a job or tell your family.',
  },
  {
    title: 'Existing business owners',
    body: 'You are weighing a new service, location or product line. We assess it alongside what your business already does.',
  },
  {
    title: 'Early-stage startups',
    body: 'You need evidence for a pitch, a partner or your own conviction. A structured, sourced report helps the conversation.',
  },
];

const FAQS = [
  {
    q: 'What do I actually get?',
    a: 'A written feasibility report, delivered as a web link and a PDF, researched from public sources and your answers. See the sample report for the structure.',
  },
  {
    q: 'Is this advice?',
    a: 'No. It is desk research and general guidance to help you decide. It is not financial, legal, tax or investment advice, and it cannot guarantee any outcome.',
  },
  {
    q: 'Which countries do you cover?',
    a: `${MARKETS.map((m) => m.label).join(', ')}. One report covers one idea in one primary market. If you want a second market, that is a second report.`,
  },
  {
    q: 'Do I need an account?',
    a: 'No. We send the report to the email address you give us. If you lose the link, use “Find my report” to have it re-sent.',
  },
  {
    q: 'What if I don’t know my costs or prices?',
    a: 'Mark the estimate as unknown. We research typical figures for your industry and area, and the report states which figures are assumed.',
  },
  {
    q: 'Can I get a refund?',
    a: 'The refund policy is published as a draft for review on this pre-launch site. Read it before purchasing; it will be finalised before launch.',
  },
];

export function LandingPage() {
  usePageTitle();

  return (
    <div className="page-enter">
      {/* Hero */}
      <section className="hero section--dark">
        <div className="container hero__inner">
          <div className="hero__copy">
            <span className="eyebrow">Business idea feasibility reports</span>
            <h1>Know whether your idea can work before you bet on it.</h1>
            <p className="lead">
              Describe your idea and your circumstances. Pay once. Receive an evidence-based
              feasibility report by email, with a PDF you can keep, share or take to the bank.
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
              <li>Delivered {TURNAROUND.label}</li>
            </ul>
          </div>
          <div className="hero__panel" aria-hidden="true">
            <div className="report-preview">
              <div className="report-preview__bar">
                <span />
                <span />
                <span />
              </div>
              <p className="report-preview__title">Feasibility report</p>
              <p className="report-preview__sub">One idea · One primary market</p>
              <div className="report-preview__lines">
                <span style={{ width: '92%' }} />
                <span style={{ width: '78%' }} />
                <span style={{ width: '85%' }} />
                <span style={{ width: '60%' }} />
              </div>
              <div className="report-preview__blocks">
                <span />
                <span />
                <span />
              </div>
              <div className="report-preview__lines">
                <span style={{ width: '88%' }} />
                <span style={{ width: '70%' }} />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="section">
        <div className="container">
          <div className="section-head">
            <span className="eyebrow">How it works</span>
            <h2>Three steps. One decision, better informed.</h2>
          </div>
          <ol className="grid grid--3 steps-grid">
            {STEPS.map((s, i) => (
              <li key={s.title} className="card">
                <span className="card__num" aria-hidden="true">
                  {i + 1}
                </span>
                <h3>{s.title}</h3>
                <p className="muted">{s.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* What's in the report */}
      <section className="section section--tint">
        <div className="container">
          <div className="section-head">
            <span className="eyebrow">What you receive</span>
            <h2>A report built around your idea, your market and your situation.</h2>
            <p className="lead">
              Every section draws on public evidence and your own answers. Where we assume a figure
              because you did not know it, the report says so.
            </p>
          </div>
          <div className="grid grid--3">
            {REPORT_CONTENTS.map((c) => (
              <div key={c.title} className="feature">
                <h3>{c.title}</h3>
                <p className="muted">{c.body}</p>
              </div>
            ))}
          </div>
          <p className="section-foot">
            <Link to="/sample-report">Read an illustrative sample report</Link>
          </p>
        </div>
      </section>

      {/* Who it's for */}
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

      {/* Pricing */}
      <section id="pricing" className="section section--dark">
        <div className="container pricing">
          <div className="pricing__copy">
            <span className="eyebrow">Pricing</span>
            <h2>One report, one price.</h2>
            <p className="lead">{PRICE.note}</p>
          </div>
          <div className="pricing__card">
            <p className="pricing__amount">
              <span className="pricing__value">{PRICE.display}</span>
              <span className="pricing__per">per report</span>
            </p>
            <ul className="pricing__list">
              <li>One idea, one primary market (UK, US or Australia)</li>
              <li>Six-section questionnaire, about 15 minutes</li>
              <li>Evidence-based report by email, with PDF</li>
              <li>Delivered {TURNAROUND.label}</li>
              <li>No account, no subscription</li>
            </ul>
            <ButtonLink to="/validate" variant="accent" size="lg" full>
              Start the questionnaire
            </ButtonLink>
            <p className="small pricing__note">
              Price shown in GBP for all markets. Payment is taken at checkout; the questionnaire is
              free to complete.
            </p>
          </div>
        </div>
      </section>

      {/* FAQ */}
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

      {/* Final CTA */}
      <section className="section section--tint">
        <div className="container cta-band">
          <h2>Ready when you are.</h2>
          <p className="lead">Fifteen minutes of honest answers. A report you can act on.</p>
          <ButtonLink to="/validate" size="lg">
            Validate my idea · {PRICE.display}
          </ButtonLink>
        </div>
      </section>
    </div>
  );
}
