import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { DemoBadge } from '@/components/DemoBadge';
import { Notice } from '@/components/Notice';
import { usePageTitle } from '@/components/usePageTitle';
import { COMPANY, DEMO_MODE, TURNAROUND } from '@/config/product';
import { getReportStatus, type ReportStage, type ReportStatus } from '@/lib/api';

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

export function ReportStatusPage() {
  usePageTitle('Report status');
  const { reportId = '' } = useParams();
  const [params] = useSearchParams();
  const justPaid = params.get('paid') === '1';
  const [status, setStatus] = useState<ReportStatus | null>(null);
  const [error, setError] = useState<string>();

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;

    const poll = async () => {
      try {
        const s = await getReportStatus(reportId);
        if (cancelled) return;
        setStatus(s);
        setError(undefined);
        if (s.stage !== 'ready' && s.stage !== 'failed') {
          timer = window.setTimeout(poll, DEMO_MODE ? 2500 : 15000);
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
  }, [reportId]);

  const rank = status ? stageRank(status.stage) : -1;

  return (
    <div className="container container--form form-page page-enter">
      <div className="form-page__head">
        <span className="eyebrow">
          Report status <DemoBadge />
        </span>
        <h1>{status?.stage === 'ready' ? 'Your report is ready' : 'We are working on your report'}</h1>
        <p>
          Reference <span className="code">{reportId}</span>. Keep this page or the email we sent; both
          bring you back here.
        </p>
      </div>

      {justPaid && !error && (
        <Notice tone="success" title="Thank you — your order is confirmed" role="status">
          <p>
            A confirmation email {DEMO_MODE ? 'would be' : 'has been'} sent to{' '}
            <strong>{status?.emailMasked ?? 'your address'}</strong>. Your report will follow{' '}
            {TURNAROUND.label}.
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

      {status && (
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
                    attached to the email. Report generation is not connected in this build, so there
                    is nothing to download.
                  </p>
                  <p>
                    <Link to="/sample-report">See the illustrative sample report</Link> for the format.
                  </p>
                </Notice>
              ) : (
                <a href={status.pdfUrl} className="btn btn--primary btn--lg" download>
                  Download PDF
                </a>
              )}
            </div>
          )}

          <p className="small muted">
            Sent to {status.emailMasked}. Ordered {new Date(status.createdAt).toLocaleString('en-GB')}.
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
