/*
  Render representative standard PDFs with the stub generator and report
  page counts, so layout can be inspected without API spend.

  Usage: node scripts/render-samples.mjs [outDir]
  Requires: npx tsx (installed as a dev dependency) — run via `npm run pdf:samples`.
*/
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderStandardPdf, renderDetailedPdf } from '../netlify/lib/pdf.ts';
import { buildBrief, StubGenerator, stubStandardReport } from '../netlify/lib/research.ts';

const out = process.argv[2] ?? 'samples-out';
mkdirSync(out, { recursive: true });

const cases = [
  { name: 'short', ideaName: 'Pilot Dog Grooming', market: 'UK', long: false, sparse: false },
  { name: 'long-names-urls', ideaName: 'The Extraordinarily Long Business Name Company For Mobile Pet Grooming And Related Services Limited', market: 'US', long: true, sparse: false },
  { name: 'sparse', ideaName: 'Sparse Inputs Café', market: 'AU', long: false, sparse: true },
];

for (const c of cases) {
  const answers = c.sparse
    ? { ideaDescription: 'A café.', industry: 'food-drink', country: c.market, targetCustomer: 'People', revenueModel: 'unsure', priceEstimate: { value: '', unknown: true }, budget: { value: '', unknown: true }, hoursPerWeek: 'lt5', experience: 'none', stage: 'idea', email: 'x@y.z', ackScope: true, ackTerms: true }
    : { ideaDescription: 'Van-based grooming at home.', industry: 'personal-services', country: c.market, regionCity: 'Leeds', targetCustomer: 'Dog owners', differentiation: 'At-home, calm handling', revenueModel: 'one-off', priceEstimate: { value: '45', unknown: false }, budget: { value: '8000', unknown: false }, hoursPerWeek: '20-35', experience: 'some', stage: 'idea', progressNote: 'Spoke to 12 owners', email: 'x@y.z', ackScope: true, ackTerms: true };
  const brief = buildBrief({ orderRef: 'SAMPLE01', market: c.market, currency: c.market === 'US' ? 'USD' : c.market === 'AU' ? 'AUD' : 'GBP', ideaName: c.ideaName, answers, answersVersion: 3 });
  const report = stubStandardReport(brief, c.long);
  if (c.long) {
    report.sources = Array.from({ length: 8 }, (_, i) => ({ ...report.sources[0], index: i + 1, title: `Source ${i + 1}: ` + 'A deliberately long source title that keeps going '.repeat(2), url: `https://example.invalid/${'very-long-path-segment-'.repeat(8)}${i}` }));
    report.claims = Array.from({ length: 30 }, (_, i) => ({ ...report.claims[0], text: `Claim ${i} `.repeat(20).slice(0, 320) }));
  }
  const meta = { orderRef: 'SAMPLE01', marketLabel: c.market, generatedAt: new Date('2026-10-16T00:00:00Z'), generatorName: 'stub', reportUrl: 'https://app.test/report/x' };
  const { pdf, pageCount } = await renderStandardPdf(report, meta);
  writeFileSync(join(out, `standard-${c.name}.pdf`), pdf);
  console.log(`standard-${c.name}.pdf: ${pageCount} page(s), ${pdf.length} bytes`);
  const gen = new StubGenerator();
  const det = await gen.composeDetailed(brief, [], '');
  const d = await renderDetailedPdf(det.report, meta);
  writeFileSync(join(out, `detailed-${c.name}.pdf`), d.pdf);
  console.log(`detailed-${c.name}.pdf: ${d.pageCount} page(s)`);
}
