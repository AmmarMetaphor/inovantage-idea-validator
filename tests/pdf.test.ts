import { describe, expect, it } from 'vitest';
import { renderReportPdf } from '../netlify/lib/pdf';
import { ReportContentSchema } from '../netlify/lib/report-schema';
import { buildBrief, StubGenerator } from '../netlify/lib/research';
import { validAnswers } from './helpers';

describe('PDF rendering', () => {
  it('renders a structured report to a valid PDF with real pdfkit', async () => {
    const gen = new StubGenerator();
    const brief = buildBrief({ orderRef: 'ABCD1234', market: 'UK', currency: 'GBP', ideaName: 'Test idea', answers: validAnswers() });
    expect(brief.lines.some((l) => l.includes('founder@example.com'))).toBe(false); // email never enters the brief
    expect(brief.lines.some((l) => l.includes('UNKNOWN'))).toBe(true); // unknown estimates are flagged
    const { report } = await gen.compose(brief, [], '');
    const content = ReportContentSchema.parse({
      ...report,
      sections: [...report.sections, { id: 'numbers2', heading: 'Table test', paragraphs: ['p'], bullets: ['b1', 'b2'], table: { columns: ['A', 'B'], rows: [['1', '2'], ['3', '4']] } }],
    });
    const pdf = await renderReportPdf(content, { orderRef: 'ABCD1234', marketLabel: 'United Kingdom', generatedAt: new Date('2026-10-14T00:00:00Z'), generatorName: 'stub' });
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(2000);
    expect(pdf.toString('latin1')).toContain('%%EOF');
  });
});
