import { describe, expect, it } from 'vitest';
import { deriveHeadline } from '../src/config/headline';
import { assessmentCoverage, CRITERIA, CRITERION_IDS, groupScore, overallBand, overallScore, readinessFraming, scoreTone, scoreWord, sourceConfidence, TOTAL_WEIGHT, type ScoredCriterion } from '../src/config/scoring';
import { buildBrief, stubStandardReport } from '../netlify/lib/research';
import { validAnswers } from './helpers';

const all = (score: number | null, basis: ScoredCriterion['basis'] = 'evidence'): ScoredCriterion[] => CRITERION_IDS.map((id) => ({ id, score, basis }));

describe('Scoring model: nine criteria, published weights, honest overall score', () => {
  it('has five market and four execution criteria whose weights sum to 100, half each', () => {
    expect(CRITERIA).toHaveLength(9);
    expect(CRITERIA.filter((c) => c.group === 'market')).toHaveLength(5);
    expect(CRITERIA.filter((c) => c.group === 'execution')).toHaveLength(4);
    expect(TOTAL_WEIGHT).toBe(100);
    expect(CRITERIA.filter((c) => c.group === 'market').reduce((n, c) => n + c.weight, 0)).toBe(50);
  });

  it('computes the weighted mean without any floor, rounding up or adjustment', () => {
    expect(overallScore(all(100)).score).toBe(100);
    expect(overallScore(all(0)).score).toBe(0);
    expect(overallScore(all(40)).score).toBe(40);
    // Market 5 × 10 at 80, execution 4 × 12.5 at 40 → (400 + 200) / 100 = 60
    const mixed = CRITERIA.map((c) => ({ id: c.id, score: c.group === 'market' ? 80 : 40, basis: 'evidence' as const }));
    expect(overallScore(mixed).score).toBe(60);
  });

  it('excludes insufficient criteria instead of counting them as zero', () => {
    const items = all(80).map((i, k) => (k < 3 ? { ...i, score: null, basis: 'insufficient' as const } : i));
    const r = overallScore(items);
    expect(r.score).toBe(80);
    expect(r.scored).toBe(6);
    expect(r.missing).toHaveLength(3);
  });

  it('withholds the overall score when fewer than six criteria or under 60% of the weight can be scored', () => {
    const five = all(90).map((i, k) => (k < 4 ? { ...i, score: null, basis: 'insufficient' as const } : i));
    expect(overallScore(five).score).toBeNull();
    expect(overallBand(null).title).toBe('Assessment incomplete');
    // Six scored but all execution missing except two → weight 50 + 25 = 75% ok; drop one more market → 65%, still ≥ 60.
    const sixLowWeight = CRITERIA.map((c, k) => ({ id: c.id, score: 70, basis: (k === 5 || k === 6 || k === 7 ? 'insufficient' : 'evidence') as ScoredCriterion['basis'] }));
    expect(overallScore(sixLowWeight).score).toBe(70);
  });

  it('bands and tones are constructive and consistent', () => {
    expect(overallBand(75)).toEqual({ title: 'A promising direction to test', tone: 'strong' });
    expect(overallBand(55).tone).toBe('moderate');
    expect(overallBand(30).title).toMatch(/small test/);
    expect(scoreTone(null)).toBe('na');
    expect(scoreWord(null)).toBe('Not enough evidence');
    expect(scoreWord(90)).toBe('Strong');
  });

  it('group scores average only scored criteria', () => {
    const items = all(60).map((i) => (i.id === 'market_timing' ? { ...i, score: null, basis: 'insufficient' as const } : i));
    expect(groupScore(items, 'market')).toEqual({ score: 60, scored: 4, total: 5 });
    expect(groupScore(all(null, 'insufficient'), 'execution').score).toBeNull();
  });

  it('source confidence and assessment coverage are separate: good sources do not imply covered criteria', () => {
    const good = { published_date: '2025', geography: 'Leeds', publisher: 'ONS', claim_type: 'historical' as const };
    const bare = { published_date: null, geography: null, publisher: null, claim_type: 'other' as const };
    expect(sourceConfidence([]).level).toBe('none');
    expect(sourceConfidence([bare]).level).toBe('low');
    expect(sourceConfidence([good, good, good]).level).toBe('high');
    // Three excellent sources, but every criterion is assumed: coverage stays low.
    const cov = assessmentCoverage(all(70, 'assumption'));
    expect(cov).toMatchObject({ evidence: 0, assumption: 9, insufficient: 0, level: 'low' });
    expect(assessmentCoverage(all(70, 'evidence')).level).toBe('high');
    const mixed = all(70, 'evidence').map((i, k) => (k < 5 ? { ...i, score: null, basis: 'insufficient' as const } : i));
    expect(assessmentCoverage(mixed)).toMatchObject({ evidence: 4, insufficient: 5, level: 'medium' });
    expect(assessmentCoverage(all(null, 'insufficient')).level).toBe('none');
  });

  it('framing is encouraging but never dismissive or promising', () => {
    for (const s of [null, 20, 50, 80]) {
      const f = readinessFraming(s);
      expect(f.next + f.note).not.toMatch(/bad idea|doomed|failure|guarantee/i);
    }
    expect(readinessFraming(30).next).toBe('Your next step: test a more focused version.');
    expect(readinessFraming(55).next).toMatch(/Clarify this assumption|Clarify the weakest assumption/);
  });

  it('the headline, factor bars, radar and PDF all read the same report fields', () => {
    const brief = buildBrief({ orderRef: 'S', market: 'UK', currency: 'GBP', ideaName: 'S', answers: validAnswers(), answersVersion: 3 });
    const report = stubStandardReport(brief);
    const h = deriveHeadline(report);
    const items = report.scorecard.map((s) => ({ id: s.id, score: s.score, basis: s.basis }));
    expect(h.overall.score).toBe(overallScore(items).score);
    expect(h.groups.market.score).toBe(groupScore(items, 'market').score);
    expect(h.nextAction).toBe(report.experiment.description);
    expect(['criterion', 'opportunity']).toContain(h.strongest.kind);
    expect(h.strongest.text.length).toBeGreaterThan(0);
  });
});
