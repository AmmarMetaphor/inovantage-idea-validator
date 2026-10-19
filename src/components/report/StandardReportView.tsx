import { useEffect, useState } from 'react';
import type { FinancialResult } from '@/lib/api';
import { deriveHeadline } from './derive';
import { ConsultationCta, EvidenceChart, Experiment, FinancialTable, Insights, LockedPreview, Recommendations, Risks, Sources, UpgradePanel } from './ReportParts';
import { FactorCards, Radar, ScoreHeader } from './Scores';
import type { StandardReport } from './types';

export const REPORT_NAV = [
  { id: 'overview', label: 'Overview' },
  { id: 'scores', label: 'Scores' },
  { id: 'market', label: 'Market' },
  { id: 'financials', label: 'Financials' },
  { id: 'roadmap', label: 'Roadmap' },
  { id: 'journey', label: 'Journey' },
] as const;

export function ReportNav({ locked, extra }: { locked?: string[]; extra?: { id: string; label: string }[] }) {
  const [current, setCurrent] = useState<string>('overview');
  const items = [...REPORT_NAV, ...(extra ?? [])];
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible) setCurrent(visible.target.id);
      },
      { rootMargin: '-30% 0px -60% 0px' },
    );
    for (const i of items) {
      const el = document.getElementById(i.id);
      if (el) obs.observe(el);
    }
    return () => obs.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <nav className="report-nav" aria-label="Report sections">
      <ul>
        {items.map((i) => (
          <li key={i.id}>
            <a href={`#${i.id}`} aria-current={current === i.id ? 'location' : undefined} className={locked?.includes(i.id) ? 'report-nav__locked' : ''}>
              {i.label}
              {locked?.includes(i.id) && <span className="visually-hidden"> (detailed report, locked)</span>}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export interface StandardViewProps {
  report: StandardReport;
  fin: FinancialResult;
  marketLabel: string;
  reportRef: string;
  generatedOn: string | null;
  ideaName?: string;
  illustrative?: boolean;
  upgrade?: { onUpgrade?: () => void; busy?: boolean; error?: string; available?: boolean; purchased?: boolean };
}

export function StandardReportView({ report, fin, marketLabel, reportRef, generatedOn, ideaName, illustrative, upgrade }: StandardViewProps) {
  const headline = deriveHeadline(report);
  const purchased = upgrade?.purchased ?? false;
  const lockedIds = purchased ? [] : ['journey'];
  return (
    <article className="web-report" aria-label={illustrative ? 'Illustrative sample report' : 'Standard report'}>
      <ReportNav locked={lockedIds} />
      <ScoreHeader report={report} headline={headline} marketLabel={marketLabel} reportRef={reportRef} generatedOn={generatedOn ?? undefined} illustrative={illustrative} />
      <FactorCards report={report} headline={headline} />
      <Radar report={report} />

      <section className="report-block" id="market" aria-labelledby="market-h">
        <div className="section-title section-title--block">
          <h2 id="market-h">Market</h2>
          <p className="muted">What the research found, what it supports, and the gaps.</p>
        </div>
        <div className="web-report__grid">
          <EvidenceChart chart={report.chart} sources={report.sources} marketLabel={marketLabel} currency={fin.currency} />
          <Insights report={report} />
        </div>
        {!purchased && <LockedPreview title="Market insights" body="Audience segments, demand evidence and competitors, with a market strategy: positioning, acquisition channels and pricing options." ideaName={ideaName} onUpgrade={upgrade?.onUpgrade} busy={upgrade?.busy} available={upgrade?.available} />}
      </section>

      <FinancialTable fin={fin} />
      {!purchased && <LockedPreview title="Financial details" body="Start-up cost assumptions, unit economics, break-even analysis and clearly labelled scenarios." ideaName={ideaName} onUpgrade={upgrade?.onUpgrade} busy={upgrade?.busy} available={upgrade?.available} />}

      <Risks risks={report.risks} />
      <Recommendations items={report.improvements} />
      <Experiment ex={report.experiment} currency={fin.currency} />
      {!purchased && <LockedPreview title="Roadmap" body="Prioritised steps and milestones from first test to launch." ideaName={ideaName} onUpgrade={upgrade?.onUpgrade} busy={upgrade?.busy} available={upgrade?.available} />}

      <section className="report-block" id="journey" aria-labelledby="journey-h">
        <div className="section-title section-title--block">
          <h2 id="journey-h">Customer journey</h2>
          <p className="muted">How customers discover, buy, receive and come back. Part of the detailed report.</p>
        </div>
        {!purchased && <LockedPreview title="Customer journey" body="Discovery, purchase, delivery and retention, mapped for your customer." ideaName={ideaName} onUpgrade={upgrade?.onUpgrade} busy={upgrade?.busy} available={upgrade?.available} />}
      </section>

      <Sources sources={report.sources} claims={report.claims} limitations={report.limitations} retrievedOn={generatedOn} />
      <UpgradePanel onUpgrade={upgrade?.onUpgrade} busy={upgrade?.busy} error={upgrade?.error} available={upgrade?.available} purchased={purchased} ideaName={ideaName} marketLabel={marketLabel} />
      <ConsultationCta reportRef={reportRef} />
    </article>
  );
}
