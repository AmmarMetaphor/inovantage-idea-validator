import { CRITERIA, criterion } from '@/config/scoring';
import { SAMPLE_REPORT } from '@/content/sample-report';
import { deriveHeadline, scoreTone } from './derive';
import { Radar, ScoreRing } from './Scores';

/** Compact, clearly labelled illustrative dashboard for the landing page. Same data as the sample report. */
export function SampleDashboard() {
  const headline = deriveHeadline(SAMPLE_REPORT);
  const rows = CRITERIA.slice(0, 5).map((c) => SAMPLE_REPORT.scorecard.find((s) => s.id === c.id)!);
  return (
    <div className="dash" aria-label="Illustrative sample dashboard">
      <p className="dash__note">Illustrative sample, not your assessment</p>
      <div className="dash__head">
        <ScoreRing score={headline.overall.score} size={96} label={`Illustrative readiness score ${headline.overall.score ?? 'incomplete'} out of 100`} />
        <div>
          <p className="dash__label">Idea readiness score (sample)</p>
          <p className="dash__band">{headline.band.title}</p>
          <p className="small muted">Coverage: {headline.coverage.evidence} of {headline.coverage.total} criteria evidence-based</p>
        </div>
      </div>
      <div className="dash__grid">
        <div>
          <p className="dash__label">Market factors</p>
          <ul className="dash__bars">
            {rows.map((r) => (
              <li key={r.id}>
                <span>{criterion(r.id)?.short}</span>
                <span className={`factor__bar factor__bar--${scoreTone(r.score)}`} aria-hidden="true">{r.score !== null && <span className="factor__fill" style={{ width: `${r.score}%` }} />}</span>
                <span>{r.score === null ? 'n/a' : r.score}</span>
              </li>
            ))}
          </ul>
        </div>
        <Radar report={SAMPLE_REPORT} compact />
      </div>
      <div>
        <p className="dash__label">Recommendations (sample)</p>
        <ol className="dash__recs">
          {SAMPLE_REPORT.improvements.slice(0, 3).map((r, i) => <li key={i}>{r.action}</li>)}
        </ol>
      </div>
    </div>
  );
}
