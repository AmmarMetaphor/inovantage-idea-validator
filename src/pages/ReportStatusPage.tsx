import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { Button } from '@/components/Button';
import { DemoBadge } from '@/components/DemoBadge';
import { Notice } from '@/components/Notice';
import { usePageTitle } from '@/components/usePageTitle';
import { DetailedReportView } from '@/components/report/DetailedReportView';
import { ConsultationCta } from '@/components/report/ReportParts';
import { StandardReportView } from '@/components/report/StandardReportView';
import type { DetailedReport, StandardReport } from '@/components/report/types';
import { COMPANY, DELIVERY_COPY, MARKETS } from '@/config/product';
import { DEMO_MODE } from '@/config/runtime';
import { createUpgradeCheckout, getReportContent, getReportDownloadUrl, getReportStatus, isDemoReference, type FinancialResult, type ReportStage, type ReportStatus, type TierStatus } from '@/lib/api';
import { useQuestionnaire } from '@/questionnaire/store';
import '@/styles/web-report.css';

/** Real backend states, in display order. Paid orders and pilot orders have different first steps. */
interface Step { stage: ReportStage; title: string; desc: string }

const PAID_STEPS: Step[] = [
  { stage: 'confirming_payment', title: 'Confirming your payment', desc: 'Checking with the payment provider.' },
  { stage: 'payment_confirmed', title: 'Payment confirmed', desc: 'Your order is queued for research.' },
  { stage: 'researching', title: 'Researching', desc: 'Gathering public evidence for your market.' },
  { stage: 'writing', title: 'Writing your report', desc: 'Scoring the criteria, computing the scenarios and rendering the PDF.' },
  { stage: 'ready', title: 'Report ready', desc: 'The web report and PDF are available below.' },
  { stage: 'email_sent', title: 'Email sent', desc: 'The report email with the PDF has been sent.' },
];

const PILOT_STEPS: Step[] = [
  { stage: 'submission_received', title: 'Submission received', desc: 'Your answers are stored and the job is created. No payment is involved.' },
  { stage: 'queued_for_research', title: 'Queued for research', desc: 'Waiting for a worker to start the research.' },
  { stage: 'researching', title: 'Researching', desc: 'Gathering public evidence for your market.' },
  { stage: 'writing', title: 'Writing your report', desc: 'Scoring the criteria, computing the scenarios and rendering the PDF.' },
  { stage: 'ready', title: 'Report ready', desc: 'The web report and PDF are available below.' },
  { stage: 'email_sent', title: 'Email sent', desc: 'The report email with the PDF has been sent.' },
];

function Timeline({ tier, emailMasked, pilot }: { tier: TierStatus; emailMasked: string; pilot: boolean }) {
  const steps = pilot ? PILOT_STEPS : PAID_STEPS;
  const order = steps.map((s) => s.stage);
  const current = order.indexOf(tier.stage);
  const job = tier.job;
  return (
    <ol className="timeline" aria-label="Report progress">
      {steps.map((s, i) => {
        const r = order.indexOf(s.stage);
        const cls = r < current ? 'done' : r === current ? (tier.stage === 'email_sent' ? 'done' : 'active') : 'pending';
        let desc = s.desc;
        if (s.stage === 'email_sent' && tier.emailSent) desc = `Your report has been sent to ${emailMasked}.`;
        if ((s.stage === 'payment_confirmed' || s.stage === 'submission_received') && tier.confirmationEmailSent) desc += ` A confirmation email (not the report) was sent to ${emailMasked}.`;
        if (cls === 'active' && job.state === 'retrying') desc = `A step failed and will be retried automatically${job.nextRetryAt ? ` after ${new Date(job.nextRetryAt).toLocaleTimeString('en-GB')}` : ''} (attempt ${job.attempts}).`;
        if (cls === 'active' && job.state === 'queued' && s.stage !== 'queued_for_research' && s.stage !== 'submission_received') desc += ' Queued; waiting for a worker.';
        return (
          <li key={s.stage} className={`timeline__item timeline__item--${cls}`}>
            <span className="timeline__dot" aria-hidden="true">{cls === 'done' ? '✓' : i + 1}</span>
            <div>
              <p className="timeline__title">
                {s.title}
                {cls === 'active' && job.state === 'retrying' && <span className="status status--caution" style={{ marginLeft: '0.5rem' }}>Retrying</span>}
                {cls === 'active' && <span className="visually-hidden"> (in progress)</span>}
                {cls === 'done' && <span className="visually-hidden"> (complete)</span>}
              </p>
              <p className="timeline__desc">{desc}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function marketLabelFor(code: string | undefined): string {
  return MARKETS.find((m) => m.code === code)?.label ?? 'your market';
}

export function ReportStatusPage() {
  usePageTitle('Your report');
  const { token = '' } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { reset } = useQuestionnaire();

  // Arriving from a successful submission: clear the questionnaire draft now.
  // This page has no answers-based guard, so clearing here cannot redirect
  // anyone back to the questionnaire. Refreshes carry no state and skip this.
  useEffect(() => {
    if ((location.state as { clearDraft?: boolean } | null)?.clearDraft) {
      reset();
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [location.state, location.pathname, navigate, reset]);
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
  const title = !std ? 'Your report' : std.stage === 'failed' ? 'We hit a problem with your report' : std.stage === 'expired' ? 'Access to this report has ended' : std.stage === 'ready' || std.stage === 'email_sent' ? 'Your report is ready' : std.stage === 'confirming_payment' ? 'Confirming your payment' : 'We are working on your report';

  return (
    <div className="container form-page page-enter report-page">
      <div className="form-page__head">
        <span className="eyebrow">Your private report page {demoRef && <DemoBadge />}</span>
        <h1>{title}</h1>
        {status && (
          <p>
            {status.ideaName} · reference <span className="code">{status.reportRef}</span>. The link in your email brings you back here any time.
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
          <Timeline tier={std} emailMasked={status.emailMasked} pilot={status.isPilot} />
          {std.stage !== 'ready' && std.stage !== 'email_sent' && <p className="small muted">{DELIVERY_COPY.short} This page updates itself; you can close it and come back with your link.</p>}
          {status.isPilot && <p className="small muted">Owner pilot run: no payment was taken or recorded.</p>}
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
          <Timeline tier={status.detailed} emailMasked={status.emailMasked} pilot={status.isPilot} />
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
            <StandardReportView
              report={standard.content}
              fin={standard.fin}
              marketLabel={marketLabelFor(status!.market)}
              reportRef={status!.reportRef}
              generatedOn={standard.generatedAt ? standard.generatedAt.slice(0, 10) : null}
              ideaName={status!.ideaName}
              upgrade={{ onUpgrade: upgrade, busy: upgradeBusy, error: upgradeError, available: status!.upgrade.available, purchased: !!status!.detailed?.purchased }}
            />
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
