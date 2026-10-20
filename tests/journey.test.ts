import { mkdirSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { deriveHeadline } from '../src/config/headline';
import { JOURNEY_PHASES, SCENE_FAMILIES, sceneFamilyFor, sceneFor } from '../src/config/journey';
import { mapPlan, type MappingDiagnostics } from '../netlify/lib/generation-schema';
import { renderDetailedPdf, renderStandardPdf } from '../netlify/lib/pdf';
import { StandardReportSchema } from '../netlify/lib/report-schema';
import { buildBrief, StubGenerator } from '../netlify/lib/research';
import { fixtures } from './fixtures/plan-fixtures';
import { validAnswers } from './helpers';

const meta = (title: string, marketLabel: string) => ({ orderRef: 'FIX00001', marketLabel, generatedAt: new Date('2026-10-20T00:00:00Z'), generatorName: 'stub', reportUrl: 'https://app.test/report/x', title });
const pageCount = (pdf: Buffer) => (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length;
const diag = (): MappingDiagnostics => ({ truncated: [], droppedSourceIds: [], downgradedClaims: 0, normalised: [] });

describe('Four-week journey: artwork chosen from metadata, never from model text', () => {
  it('maps industries and revenue models to scene families', () => {
    expect(sceneFamilyFor('retail-ecommerce', 'one-off')).toBe('retail');
    expect(sceneFamilyFor('software', 'subscription')).toBe('software');
    expect(sceneFamilyFor('professional-services', 'project')).toBe('services');
    expect(sceneFamilyFor('food-drink', 'one-off')).toBe('hospitality');
    expect(sceneFamilyFor('Falconry displays', 'unsure')).toBe('generic');
    expect(sceneFamilyFor(undefined, undefined)).toBe('generic');
  });

  it('every family has four original scenes with only outline, highlight and accent roles', () => {
    for (const f of SCENE_FAMILIES) {
      for (const p of JOURNEY_PHASES) {
        const s = sceneFor(f, p.id);
        expect(s.paths.length).toBeGreaterThanOrEqual(4);
        for (const path of s.paths) {
          expect(['outline', 'highlight', 'accent', 'highlightFill', 'accentFill']).toContain(path.role);
          expect(path.d).toMatch(/^[MLHVCSQTAZmlhvcsqtaz0-9 .,-]+$/); // plain path data, no markup
        }
      }
    }
  });

  it('validates the generated plan: four weeks in order, clipped, padded only when missing, family from metadata', () => {
    const d = diag();
    const plan = mapPlan({ week_actions: ['a'.repeat(400), 'b', 'c', 'd'], week_measures: ['m1', 'm2', 'm3', 'm4'], week_details: ['x', 'y', 'z', 'w'], plan_caveat: 'Needs a licence first.' }, { industry: 'software', revenueModel: 'subscription' }, d);
    expect(plan.weeks.map((w) => w.phase)).toEqual(['listen', 'select', 'test', 'learn']);
    expect(plan.weeks[0].action.length).toBeLessThanOrEqual(170);
    expect(plan.scene_family).toBe('software');
    expect(plan.caveat).toBe('Needs a licence first.');
    expect(d.truncated).toContain('week_actions[0]');
    const short = mapPlan({ week_actions: ['only one'], week_measures: [], week_details: [], plan_caveat: '' }, {}, d);
    expect(short.weeks).toHaveLength(4);
    expect(d.normalised).toContain('plan:padded');
    expect(short.weeks[3].action).toMatch(/Learn/);
  });

  it('a report without a plan still parses and the PDF renders without inventing one', async () => {
    const brief = buildBrief({ orderRef: 'OLD', market: 'UK', currency: 'GBP', ideaName: 'Old', answers: validAnswers(), answersVersion: 3 });
    const gen = new StubGenerator();
    const { report } = await gen.composeStandard(brief, [], '', { tighten: 0 });
    const { plan: _plan, ...legacy } = report;
    const parsed = StandardReportSchema.parse(legacy);
    expect(parsed.plan).toBeUndefined();
    const { pageCount: n } = await renderStandardPdf(parsed, meta('Old', 'United Kingdom'));
    expect(n).toBe(2);
  });

  it('the detailed stub reuses the standard plan with expansions rather than a different plan', async () => {
    const brief = buildBrief({ orderRef: 'D', market: 'UK', currency: 'GBP', ideaName: 'D', answers: validAnswers(), answersVersion: 3 });
    const gen = new StubGenerator();
    const std = (await gen.composeStandard(brief, [], '', { tighten: 0 })).report;
    const det = (await gen.composeDetailed(brief, [], '', std)).report;
    expect(det.plan?.weeks.map((w) => w.action)).toEqual(std.plan?.weeks.map((w) => w.action));
    expect(det.plan?.expansions).toHaveLength(4);
    const { pageCount: n } = await renderDetailedPdf(det, meta('D', 'United Kingdom'));
    expect(n).toBeGreaterThanOrEqual(2);
  });
});

describe('Representative fixtures: journey, confidence layout and the two-page budget', () => {
  const outDir = process.env.FIXTURE_PDF_DIR;
  if (outDir) mkdirSync(outDir, { recursive: true });

  for (const f of fixtures()) {
    it(`${f.name}: relevant artwork, specific actions, consistent counts, exactly two pages`, async () => {
      const report = StandardReportSchema.parse(f.report);
      if (f.name !== 'evidence-limited') {
        expect(report.plan?.scene_family).toBe(f.expectFamily);
        for (const w of report.plan!.weeks) {
          expect(w.action).not.toMatch(/^(do research|market the business)/i);
          expect(w.measure.length).toBeGreaterThan(5);
        }
      }
      if (f.name === 'regulated-childminding') expect(report.plan?.caveat).toMatch(/registration/i);
      const h = deriveHeadline(report);
      // Counts shown online and in the PDF come from the same helper.
      expect(h.coverage.evidence + h.coverage.assumption + h.coverage.insufficient).toBe(9);
      if (f.name === 'evidence-limited') {
        expect(h.sources.level).toBe('none');
        expect(h.overall.score).toBeNull();
        expect(h.coverage.insufficient).toBeGreaterThanOrEqual(5);
      }
      const { pdf, pageCount: n } = await renderStandardPdf(report, meta(report.title, f.marketLabel));
      expect(n).toBe(2);
      expect(pageCount(pdf)).toBe(2);
      if (outDir) writeFileSync(`${outDir}/standard-${f.name}.pdf`, pdf);
    });
  }
});
