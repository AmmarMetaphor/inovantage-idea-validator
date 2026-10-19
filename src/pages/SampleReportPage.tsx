import { Link } from 'react-router-dom';
import { ButtonLink } from '@/components/Button';
import { Notice } from '@/components/Notice';
import { usePageTitle } from '@/components/usePageTitle';
import { StandardReportView } from '@/components/report/StandardReportView';
import { PRICE } from '@/config/product';
import { SAMPLE_FIN, SAMPLE_MARKET_LABEL, SAMPLE_REPORT } from '@/content/sample-report';
import '@/styles/report.css';
import '@/styles/web-report.css';

/*
  ILLUSTRATIVE SAMPLE. See src/content/sample-report.ts: the idea, the
  customer, the scores and every figure are invented to show the structure
  and tone of the standard report. Nothing here is research.
*/
export function SampleReportPage() {
  usePageTitle('Sample report (illustrative)');

  return (
    <div className="page-enter">
      <div className="container report-intro">
        <span className="eyebrow">Sample report</span>
        <h1>What your report looks like</h1>
        <p className="lead">
          An illustrative sample for a made-up idea. It shows every part of the {PRICE.display} standard report: the readiness score, the market and execution scorecards, the criteria radar, evidence and assumptions, recommendations and the first test. Your report is researched for your idea and market.
        </p>
        <Notice tone="warning" title="Illustrative content, not research" role="note">
          <p>The business, the customer, the scores and all figures are invented for demonstration. Square brackets mark where a real report cites a retrievable source with its publisher and date. Nothing here is a visitor’s assessment or market data.</p>
        </Notice>
      </div>

      <div className="container report-page" style={{ paddingBottom: 'var(--space-16)' }}>
        <StandardReportView report={SAMPLE_REPORT} fin={SAMPLE_FIN} marketLabel={SAMPLE_MARKET_LABEL} reportRef="SAMPLE" generatedOn={null} ideaName="your idea" illustrative />

        <div className="report-cta">
          <h2>Want this for your idea?</h2>
          <p className="lead">Eight questions, one payment of {PRICE.display}, a clearer next step.</p>
          <ButtonLink to="/validate" size="lg">Explore my idea · {PRICE.display}</ButtonLink>
          <p className="small muted">Or read the draft <Link to="/terms">terms</Link> and <Link to="/refunds">refund policy</Link> first.</p>
        </div>
      </div>
    </div>
  );
}
