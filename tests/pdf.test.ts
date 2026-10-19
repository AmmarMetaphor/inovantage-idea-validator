import { describe, expect, it } from 'vitest';
import { renderDetailedPdf, renderStandardPdf } from '../netlify/lib/pdf';
import { StandardReportSchema } from '../netlify/lib/report-schema';
import { buildBrief, StubGenerator, stubStandardReport } from '../netlify/lib/research';
import { legacyAnswersV1, validAnswers } from './helpers';

const meta = { orderRef: 'ABCD1234', marketLabel: 'United Kingdom', generatedAt: new Date('2026-10-16T00:00:00Z'), generatorName: 'stub', reportUrl: 'https://app.test/report/x' };

function pageCount(pdf: Buffer): number {
  return (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length;
}

describe('Standard PDF: exactly two pages', () => {
  it('renders a normal report to two pages with a valid PDF', async () => {
    const brief = buildBrief({ orderRef: 'ABCD1234', market: 'UK', currency: 'GBP', ideaName: 'Test idea', answers: validAnswers(), answersVersion: 3 });
    expect(brief.lines.some((l) => l.includes('founder@example.com'))).toBe(false);
    const report = StandardReportSchema.parse(stubStandardReport(brief));
    const { pdf, pageCount: n } = await renderStandardPdf(report, meta);
    expect(n).toBe(2);
    expect(pageCount(pdf)).toBe(2);
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.toString('latin1')).toContain('/URI');
  });

  it('stays at two pages with long names, long URLs, maximum sources and claims', async () => {
    const brief = buildBrief({ orderRef: 'ABCD1234', market: 'US', currency: 'USD', ideaName: 'The Extraordinarily Long Business Name Company For Mobile Pet Grooming Limited', answers: validAnswers(), answersVersion: 3 });
    const report = stubStandardReport(brief, true);
    report.sources = Array.from({ length: 8 }, (_, i) => ({ ...report.sources[0], index: i + 1, title: ('Long source title ').repeat(6).slice(0, 110), url: `https://example.invalid/${'very-long-path-segment-'.repeat(10)}${i}` }));
    report.claims = Array.from({ length: 30 }, () => ({ ...report.claims[0] }));
    const parsed = StandardReportSchema.parse(report);
    const { pageCount: n } = await renderStandardPdf(parsed, meta);
    expect(n).toBe(2);
  });

  it('stays at two pages with sparse inputs and no sources', async () => {
    const brief = buildBrief({ orderRef: 'ABCD1234', market: 'AU', currency: 'AUD', ideaName: 'Sparse', answers: { ...validAnswers(), priceEstimate: { value: '', unknown: true }, budget: { value: '', unknown: true } }, answersVersion: 3 });
    expect(brief.unknowns.length).toBe(2);
    const report = stubStandardReport(brief);
    report.sources = [];
    report.chart = { kind: 'none', title: '', unit: '', series: [], note: 'No local data found.' };
    const { pageCount: n } = await renderStandardPdf(StandardReportSchema.parse(report), meta);
    expect(n).toBe(2);
  });

  it('builds a brief for a legacy version-1 submission', () => {
    const brief = buildBrief({ orderRef: 'LEGACY01', market: 'US', currency: 'USD', ideaName: 'Legacy Idea', answers: legacyAnswersV1(), answersVersion: 1 });
    expect(brief.answersVersion).toBe(1);
    expect(brief.lines.some((l) => l.startsWith('What problem does it solve'))).toBe(true);
    expect(brief.unknowns).toContain('Capital you could invest');
  });
});

describe('Detailed PDF', () => {
  it('renders the nine sections, computed scenarios and sources', async () => {
    const gen = new StubGenerator();
    const brief = buildBrief({ orderRef: 'ABCD1234', market: 'UK', currency: 'GBP', ideaName: 'Test idea', answers: validAnswers(), answersVersion: 3 });
    const { report } = await gen.composeDetailed(brief, []);
    const { pdf, pageCount: n } = await renderDetailedPdf(report, meta);
    expect(n).toBeGreaterThanOrEqual(2);
    expect(pageCount(pdf)).toBe(n);
  });
});
