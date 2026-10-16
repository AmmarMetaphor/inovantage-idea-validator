import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Button } from '@/components/Button';
import { DemoBadge } from '@/components/DemoBadge';
import { Notice } from '@/components/Notice';
import { usePageTitle } from '@/components/usePageTitle';
import { DetailedReportView } from '@/components/report/DetailedReportView';
import { ConsultationCta, EvidenceChart, Experiment, FinancialTable, Improvements, Risks, Scorecard, Sources, Swot, UpgradeCta, VerdictBanner } from '@/components/report/ReportParts';
import type { DetailedReport, StandardReport } from '@/components/report/types';
import { COMPANY, DELIVERY_COPY } from '@/config/product';
import { DEMO_MODE } from '@/config/runtime';
import { createUpgradeCheckout, getReportContent, getReportDownloadUrl, getReportStatus, isDemoReference, type FinancialResult, type ReportStage, type ReportStatus, type TierStatus } from '@/lib/api';
import '@/styles/web-report.css';

/** Real backend states, in display order. */
const STAGES: { stage: ReportStage; title: string; desc: string }[] = [
  { stage: 'confirming_payment', title: 'Confirming your payment', desc: 'Checking with the payment provider.' },
  { stage: 'payment_confirmed', title: 'Payment confirmed', desc: 'Your order is queued for research.' },
  { stage: 'researching', title: 'Researching', desc: 'Gathering public evidence for your market.' },
  { stage: 'writing', title: 'Writing your report', desc: 'Composing the verdict, scorecard and scenarios; rendering the PDF.' },
  { stage: 'ready', title: 'Report ready', desc: 'The web report and PDF are available below.' },
  { stage: 'email_sent', title: 'Email sent', desc: 'A copy with the PDF has been sent to you.' },
];

const ORDER: ReportStage[] = STAGES.map((s) => s.stage);
const rank = (s: ReportStage) => ORDER.indexOf(s);

function Timeline({ tier, emailMasked }: { tier: TierStatus; emailMasked: string }) {
  const current = rank(tier.stage);
  return (
    <ol className="timeline" aria-label="Report progress">
      {STAGES.map((s, i) => {
        const r = rank(s.stage);
        const cls = r < current ? 'done' : r === current ? (tier.stage === 'email_sent' ? 'done' : 'active') : 'pending';
        return (
          <li key={s.stage} className={`timeline__item timeline__item--${cls}`}>
            <span className="timeline__dot" aria-hidden="true">{cls === 'done' ? '✓' : i + 1}</span>
            <div>
              <p className="timeline__title">
                {s.title}
                {cls === 'active' && <span className="visually-hidden"> (in progress)</span>}
                {cls === 'done' && <span className="visually-hidden"> (complete)</span>}
              </p>
              <p className="timeline__desc">{s.stage === 'email_sent' && tier.emailSent ? `Your report has been sent to ${emailMasked}.` : s.desc}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export function ReportStatusPage() {
  usePageTitle('Your report');
  const { token = '' } = useParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<ReportStatus | null>(null);
  const [error, setError] = useState<string>();
  const [standard, setStandard] = useState<{ content: StandardReport; fin: FinancialResult; generatedAt: string | null } | null>(null);
  const [detailed, setDetailed] = useState<{ content: DetailedReport; fin: FinancialResult; generatedAt: string | null } | null>(null);
  const [downloading, setDownloading] = useState<'standard' | 'detailed' | null>(null);
  const [downloadError, setDownloadError] = useState<string>();
  const [upgradeBusy, setUpgradeBusy] = useState(false);
  const [upgradeError, setUpgradeError] = useState<string>();
  const [view, setView] = useState<'standard' | 'detailed'>('standard');
  const demoRef = DEMO_MODE && isDemoReference(token);

  // Poll real status until nothing is in progress. Progress lives on the server, so refreshes are safe.
  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;
    const inProgress = (t: TierStatus | null) => !!t && !['email_sent', 'failed', 'expired'].includes(t.stage) && !(t.stage === 'ready' && t.pdfAvailable && t.emailSent);
    const poll = async () => {
      try {
        const s = await getReportStatus(token);
        if (cancelled) return;
        setStatus(s);
        setError(undefined);
        if (!s.demo && (inProgress(s.standard) || inProgress(s.detailed))) timer = window.setTimeout(poll, 15000);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load the report status.');
      }
    };
    void poll();
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [token]);

  // Load report content once each tier is ready.
  useEffect(() => {
    if (!status || status.demo) return;
    if (!standard && (status.standard.stage === 'ready' || status.standard.stage === 'email_sent')) {
      getReportContent<StandardReport>(token, 'standard').then((r) => setStandard({ content: r.content, fin: r.financials, generatedAt: r.generatedAt })).catch(() => undefined);
    }
    if (!detailed && status.detailed?.purchased && (status.detailed.stage === 'ready' || status.detailed.stage === 'email_sent')) {
      getReportContent<DetailedReport>(token, 'detailed').then((r) => setDetailed({ content: r.content, fin: r.financials, generatedAt: r.generatedAt })).catch(() => undefined);
    }
  }, [status, token, standard, detailed]);

  const download = useCallback(async (tier: 'standard' | 'detailed') => {
    setDownloading(tier);
    setDownloadError(undefined);
    try {
      const { url } = await getReportDownloadUrl(token, tier);
      window.location.assign(url);
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : 'Could not prepare the download.');
    } finally {
      setDownloading(null);
    }
  }, [token]);

  const upgrade = async () => {
    setUpgradeBusy(true);
    setUpgradeError(undefined);
    try {
      const r = await createUpgradeCheckout(token);
      if (r.checkoutUrl) window.location.assign(r.checkoutUrl);
      else if (r.reportPath) navigate(r.reportPath, { replace: true });
    } catch (err) {
      setUpgradeError(err instanceof Error ? err.message : 'Could not start the upgrade.');
      setUpgradeBusy(false);
    }
  };

  const std = status?.standard;
  const title = !std ? 'Your report' : std.stage === 'failed' ? 'We hit a problem with your report' : std.stage === 'expired' ? 'Access to this report has ended' : std.stage === 'ready' || std.stage === 'email_sent' ? 'Your report is ready' : 'We are working on your report';

  return (
    <div className="container form-page page-enter report-page">
      <div className="form-page__head">
        <span className="eyebrow">Your private report page {demoRef && <DemoBadge />}</span>
        <h1>{title}</h1>
        {status && (
          <p>
            {status.ideaName} · reference <span className="code">{status.reportRef}</span>. Keep the email we sent; its link brings you back here any time.
          </p>
        )}
      </div>

      {error && (
        <Notice tone="danger" title="We could not find that report" role="alert">
          <p>{error}</p>
          <p>If you have paid and the link in your email does not work, use <Link to="/find-report">Find my report</Link> or contact {COMPANY.supportEmail}.</p>
        </Notice>
      )}

      {!status && !error && (
        <p className="muted" role="status"><span className="spinner" aria-hidden="true" /> Checking status…</p>
      )}

      {status?.demo && (
        <Notice tone="warning" title="Demo mode" role="note">
          <p>No payment was taken and no report is produced in demo mode. The stages below are the real pipeline states, shown without processing. <Link to="/sample-report">See the illustrative sample report</Link>.</p>
        </Notice>
      )}

      {std?.stage === 'failed' && (
        <Notice tone="danger" title="Report generation did not complete" role="alert">
          <p>Something went wrong on our side. We have been notified and will contact you at {status!.emailMasked}. If you do not hear from us, email {COMPANY.supportEmail} quoting {status!.reportRef}.</p>
        </Notice>
      )}

      {status && std && std.stage !== 'failed' && std.stage !== 'expired' && (
        <div className="card stack" style={{ marginTop: 'var(--space-6)' }}>
          <Timeline tier={std} emailMasked={status.emailMasked} />
          {std.stage !== 'ready' && std.stage !== 'email_sent' && <p className="small muted">{DELIVERY_COPY.short} This page updates itself; you can close it and come back with your link.</p>}
          {(std.stage === 'ready' || std.stage === 'email_sent') && (
            <div className="cluster" style={{ borderTop: '1px solid var(--color-border)', paddingTop: 'var(--space-5)' }}>
              <Button size="lg" onClick={() => download('standard')} disabled={downloading !== null || !std.pdfAvailable}>
                {downloading === 'standard' ? 'Preparing download…' : 'Download PDF (2 pages)'}
              </Button>
              {status.detailed?.purchased && status.detailed.pdfAvailable && (
                <Button variant="secondary" size="lg" onClick={() => download('detailed')} disabled={downloading !== null}>
                  {downloading === 'detailed' ? 'Preparing download…' : 'Download detailed PDF'}
                </Button>
              )}
            </div>
          )}
          {downloadError && <Notice tone="danger" role="alert"><p>{downloadError}</p></Notice>}
          {std.stage === 'ready' && !std.emailSent && <p className="small muted">Your report is ready here. The email copy is being sent and this page will say when it has gone.</p>}
        </div>
      )}

      {status?.detailed && status.detailed.purchased && status.detailed.stage !== 'email_sent' && status.detailed.stage !== 'ready' && (
        <div className="card stack" style={{ marginTop: 'var(--space-5)' }}>
          <p className="eyebrow eyebrow--gold">Detailed report</p>
          <Timeline tier={status.detailed} emailMasked={status.emailMasked} />
        </div>
      )}

      {standard && (
        <>
          {detailed && (
            <div className="cluster report-tabs" role="tablist" aria-label="Report tier">
              <button type="button" role="tab" aria-selected={view === 'standard'} className={`btn ${view === 'standard' ? 'btn--primary' : 'btn--secondary'} btn--md`} onClick={() => setView('standard')}>Standard report</button>
              <button type="button" role="tab" aria-selected={view === 'detailed'} className={`btn ${view === 'detailed' ? 'btn--primary' : 'btn--secondary'} btn--md`} onClick={() => setView('detailed')}>Detailed report</button>
            </div>
          )}
          {view === 'standard' || !detailed ? (
            <article className="web-report" aria-label="Standard report">
              <header className="web-report__head">
                <p className="eyebrow">Idea validation report · {status!.reportRef} · {standard.generatedAt ? standard.generatedAt.slice(0, 10) : ''}</p>
                <h2>{standard.content.title}</h2>
                <p className="lead">{standard.content.idea_summary}</p>
              </header>
              <VerdictBanner report={standard.content} />
              <div className="web-report__grid">
                <Scorecard report={standard.content} />
                <EvidenceChart chart={standard.content.chart} sources={standard.content.sources} />
              </div>
              <Swot swot={standard.content.swot} />
              <FinancialTable fin={standard.fin} />
              <Risks risks={standard.content.risks} />
              <div className="web-report__grid">
                <Improvements items={standard.content.improvements} />
                <Experiment ex={standard.content.experiment} currency={standard.fin.currency} />
              </div>
              <Sources sources={standard.content.sources} claims={standard.content.claims} limitations={standard.content.limitations} retrievedOn={standard.generatedAt ? standard.generatedAt.slice(0, 10) : null} />
              <ConsultationCta reportRef={status!.reportRef} />
              <UpgradeCta onUpgrade={upgrade} busy={upgradeBusy} error={upgradeError} available={status!.upgrade.available} purchased={!!status!.detailed?.purchased} />
            </article>
          ) : (
            <>
              <DetailedReportView report={detailed.content} fin={detailed.fin} generatedAt={detailed.generatedAt} />
              <ConsultationCta reportRef={status!.reportRef} />
            </>
          )}
        </>
      )}

      <p className="small muted" style={{ marginTop: 'var(--space-8)' }}>
        Lost the email? <Link to="/find-report">Have the link re-sent</Link>.
      </p>
    </div>
  );
}
