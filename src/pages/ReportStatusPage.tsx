import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/Button';
import { DemoBadge } from '@/components/DemoBadge';
import { Notice } from '@/components/Notice';
import { usePageTitle } from '@/components/usePageTitle';
import { COMPANY, TURNAROUND } from '@/config/product';
import { DEMO_MODE } from '@/config/runtime';
import { getReportDownloadUrl, getReportStatus, isDemoReference, type ReportStage, type ReportStatus } from '@/lib/api';

const STAGES: { stage: ReportStage; title: string; desc: string }[] = [
  { stage: 'paid', title: 'Payment confirmed', desc: 'Your order is in the queue.' },
  { stage: 'researching', title: 'Researching', desc: 'Gathering evidence on your market, competitors and costs.' },
  { stage: 'compiling', title: 'Writing the report', desc: 'Turning the findings into your feasibility report.' },
  { stage: 'ready', title: 'Report ready', desc: 'Emailed to you with a PDF attached.' },
];

const ORDER: ReportStage[] = ['received', 'paid', 'researching', 'compiling', 'ready'];

function stageRank(stage: ReportStage) {
  return ORDER.indexOf(stage);
}

/**
 * /report/:token — the token is the private access key from the customer's
 * email (or the demo reference in demo mode). It is sent to the API in a POST
 * body and never appears in a query string or Referer header.
 */
export function ReportStatusPage() {
  usePageTitle('Report status');
  const { token = '' } = useParams();
  const [params] = useSearchParams();
  const justPaid = params.get('paid') === '1';
  const [status, setStatus] = useState<ReportStatus | null>(null);
  const [error, setError] = useState<string>();
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string>();
  const demoRef = DEMO_MODE && isDemoReference(token);

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;

    const poll = async () => {
      try {
        const s = await getReportStatus(token);
        if (cancelled) return;
        setStatus(s);
        setError(undefined);
        if (s.stage !== 'ready' && s.stage !== 'failed' && s.stage !== 'expired') {
          timer = window.setTimeout(poll, s.demo ? 2500 : 20000);
        }
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Could not load the report status.');
      }
    };

    void poll();
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [token]);

  const download = async () => {
    setDownloading(true);
    setDownloadError(undefined);
    try {
      const { url } = await getReportDownloadUrl(token);
      window.location.assign(url);
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : 'Could not prepare the download.');
    } finally {
      setDownloading(false);
    }
  };

  const rank = status ? stageRank(status.stage) : -1;
  const title =
    status?.stage === 'ready'
      ? 'Your report is ready'
      : status?.stage === 'failed'
        ? 'We hit a problem with your report'
        : status?.stage === 'expired'
          ? 'This report link has expired'
          : 'We are working on your report';

  return (
    <div className="container container--form form-page page-enter">
      <div className="form-page__head">
        <span className="eyebrow">
          Report status {demoRef && <DemoBadge />}
        </span>
        <h1>{title}</h1>
        {status && (
          <p>
            Reference <span className="code">{status.reportRef}</span>. Keep the email we sent; its link
            brings you back here.
          </p>
        )}
      </div>

      {justPaid && !error && status && status.stage !== 'expired' && (
        <Notice tone="success" title="Thank you — your order is confirmed" role="status">
          <p>
            A confirmation email {status.demo ? 'would be' : 'has been'} sent to <strong>{status.emailMasked}</strong>.
            Your report will follow {TURNAROUND.label}.
          </p>
        </Notice>
      )}

      {error && (
        <Notice tone="danger" title="We could not find that report" role="alert">
          <p>{error}</p>
          <p>
            If you have paid and the link in your email does not work, use{' '}
            <Link to="/find-report">Find my report</Link> or contact {COMPANY.supportEmail}.
          </p>
        </Notice>
      )}

      {!status && !error && (
        <p className="muted" role="status">
          <span className="spinner" aria-hidden="true" /> Checking status…
        </p>
      )}

      {status && status.stage === 'expired' && (
        <Notice tone="warning" title="Access period ended">
          <p>Reports stay available for a limited time after delivery. Contact {COMPANY.supportEmail} if you need a copy.</p>
        </Notice>
      )}

      {status && status.stage === 'failed' && (
        <Notice tone="danger" title="Report generation did not complete" role="alert">
          <p>
            Something went wrong on our side. We have been notified and will contact you at{' '}
            {status.emailMasked}. No action is needed from you. If you do not hear from us, email{' '}
            {COMPANY.supportEmail} quoting {status.reportRef}.
          </p>
        </Notice>
      )}

      {status && status.stage !== 'expired' && status.stage !== 'failed' && (
        <div className="card stack" style={{ marginTop: 'var(--space-6)' }}>
          <ol className="timeline" aria-label="Report progress">
            {STAGES.map((s, i) => {
              const r = stageRank(s.stage);
              const state = r < rank ? 'done' : r === rank ? 'active' : 'pending';
              const isReadyDone = s.stage === 'ready' && status.stage === 'ready';
              const cls = isReadyDone ? 'done' : state;
              return (
                <li key={s.stage} className={`timeline__item timeline__item--${cls}`}>
                  <span className="timeline__dot" aria-hidden="true">
                    {cls === 'done' ? '✓' : i + 1}
                  </span>
                  <div>
                    <p className="timeline__title">
                      {s.title}
                      {cls === 'active' && <span className="visually-hidden"> (in progress)</span>}
                      {cls === 'done' && <span className="visually-hidden"> (complete)</span>}
                    </p>
                    <p className="timeline__desc">{s.desc}</p>
                  </div>
                </li>
              );
            })}
          </ol>

          {status.stage === 'ready' && (
            <div className="stack" style={{ borderTop: '1px solid var(--color-border)', paddingTop: 'var(--space-5)' }}>
              {status.demo ? (
                <Notice tone="warning" title="Demo mode: no PDF was generated" role="note">
                  <p>
                    In the live product a “Download PDF” button appears here and the same file is
                    attached to the email. Report generation is simulated in this build, so there is
                    nothing to download.
                  </p>
                  <p>
                    <Link to="/sample-report">See the illustrative sample report</Link> for the format.
                  </p>
                </Notice>
              ) : status.pdfAvailable ? (
                <>
                  <Button size="lg" onClick={download} disabled={downloading}>
                    {downloading ? (
                      <>
                        <span className="spinner" aria-hidden="true" /> Preparing download…
                      </>
                    ) : (
                      'Download PDF'
                    )}
                  </Button>
                  {downloadError && (
                    <Notice tone="danger" role="alert">
                      <p>{downloadError}</p>
                    </Notice>
                  )}
                  <p className="small muted">The download link is private and valid for two minutes.</p>
                </>
              ) : (
                <p className="muted">The PDF is being finalised. Check your email shortly.</p>
              )}
            </div>
          )}

          <p className="small muted">
            Sent to {status.emailMasked}. Ordered {new Date(status.orderedAt).toLocaleString('en-GB')}.
            {status.expiresAt && ` Available until ${new Date(status.expiresAt).toLocaleDateString('en-GB')}.`}
            {status.demo && ' This demo order exists only in this browser tab.'}
          </p>
        </div>
      )}

      <p className="small muted" style={{ marginTop: 'var(--space-8)' }}>
        Lost the email? <Link to="/find-report">Have the link re-sent</Link>.
      </p>
    </div>
  );
}
