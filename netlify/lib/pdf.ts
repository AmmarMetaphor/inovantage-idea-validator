/*
  PDF rendering with pdfkit (standard fonts only).

  renderStandardPdf: exactly two A4 pages. Page 1: header, score panel
  (readiness score, band, confidence, strongest opportunity, next action),
  assessment, the two factor cards with bars, supported strengths, what to
  strengthen, a static radar and a labelled chart. Page 2: scenarios, risks,
  recommendations, the first test, limitations, sources and the consultation
  line. Every block has an explicit position and a height budget; text that
  would exceed its budget is cut with an ellipsis as a last-resort guard, but
  the editorial limits in report-schema.ts and the "tighten" re-compose loop
  in jobs.ts are what keep content inside the budget in practice. Charts are
  drawn with primitives and share their data with the web report. Links are
  clickable (full URL in the annotation even if the display is shortened).

  renderDetailedPdf: flowing multi-page document for the upgrade.
*/
import PDFDocument from 'pdfkit';
import { chartProvenance, deriveHeadline, itemsForGroup, toStrengthen, type Headline } from '../../src/config/headline';
import { COMBINED_TOTAL, COMPANY, CONSULTATION, PRODUCTS, UPGRADE_INCLUDES } from '../../src/config/product';
import { CRITERIA, GROUPS, SCORE_DISCLAIMER, SCORE_LABEL, SCORE_RUBRIC, criterion, scoreTone, type Tone } from '../../src/config/scoring';
import { computeFinancials, formatMoney, type FinancialResult } from './finance';
import { DISCLAIMER, type DetailedReport, type StandardReport } from './report-schema';

export interface PdfMeta {
  orderRef: string;
  marketLabel: string;
  generatedAt: Date;
  generatorName: string;
  /** Private report page URL for the "open online" link. */
  reportUrl?: string;
}

const NAVY = '#0f2440';
const INK = '#0b1a2e';
const MUTED = '#4a6a95';
const GOLD = '#b8995a';
const SAND = '#e8dcc2';
const LINE = '#d5deea';
const TONE: Record<'go' | 'caution' | 'stop' | 'na', { fill: string; text: string }> = {
  go: { fill: '#e3f3ea', text: '#1f6f4a' },
  caution: { fill: '#fff3d6', text: '#8a5a00' },
  stop: { fill: '#fbe7e5', text: '#b3261e' },
  na: { fill: '#eaf0f7', text: '#4a6a95' },
};
void TONE;

const A4 = { w: 595.28, h: 841.89 };
const M = 36;
const CW = A4.w - 2 * M;

type Doc = PDFKit.PDFDocument;

function newDoc(title: string): { doc: Doc; done: Promise<Buffer> } {
  const doc = new PDFDocument({ size: 'A4', margins: { top: M, bottom: M, left: M, right: M }, bufferPages: true, info: { Title: title, Author: `${COMPANY.name} ${COMPANY.productName}` } });
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
  return { doc, done };
}

/** Draw text inside a fixed box; returns the height actually used (≤ h). */
function box(doc: Doc, text: string, x: number, y: number, w: number, h: number, o: { font?: string; size?: number; color?: string; align?: 'left' | 'center' | 'right'; lineGap?: number; link?: string } = {}): number {
  doc.font(o.font ?? 'Helvetica').fontSize(o.size ?? 9).fillColor(o.color ?? INK);
  const opts = { width: w, height: h, ellipsis: true, align: o.align ?? 'left', lineGap: o.lineGap ?? 1.5, link: o.link } as PDFKit.Mixins.TextOptions;
  const used = Math.min(h, doc.heightOfString(text, opts));
  doc.text(text, x, y, opts);
  return used;
}

function label(doc: Doc, text: string, x: number, y: number, color = MUTED): number {
  doc.font('Helvetica-Bold').fontSize(7.5).fillColor(color).text(text.toUpperCase(), x, y, { characterSpacing: 1.2, lineBreak: false });
  return 12;
}

function heading(doc: Doc, text: string, x: number, y: number, w: number): number {
  doc.font('Times-Roman').fontSize(12.5).fillColor(NAVY).text(text, x, y, { width: w, lineBreak: false });
  doc.moveTo(x, y + 16).lineTo(x + w, y + 16).lineWidth(0.6).strokeColor(GOLD).stroke();
  return 22;
}

function chip(doc: Doc, text: string, x: number, y: number, tone: keyof typeof TONE): number {
  doc.font('Helvetica-Bold').fontSize(8.5);
  const w = doc.widthOfString(text) + 14;
  doc.roundedRect(x, y, w, 16, 8).fill(TONE[tone].fill);
  doc.fillColor(TONE[tone].text).text(text, x + 7, y + 4, { lineBreak: false });
  return w;
}

function footer(doc: Doc, meta: PdfMeta, page: number, total: number) {
  // The footer sits inside the bottom margin. pdfkit starts a new page for any
  // text placed past the margin, so lift the margin while drawing it.
  const savedBottom = doc.page.margins.bottom;
  doc.page.margins.bottom = 0;
  const y = A4.h - M + 8;
  doc.moveTo(M, y - 6).lineTo(A4.w - M, y - 6).lineWidth(0.5).strokeColor(LINE).stroke();
  doc.font('Helvetica').fontSize(7).fillColor(MUTED).text(`${COMPANY.name} ${COMPANY.productName} · ${meta.orderRef} · Generated ${meta.generatedAt.toISOString().slice(0, 10)}`, M, y, { lineBreak: false });
  doc.text(`Page ${page} of ${total}`, M, y, { width: CW, align: 'right', lineBreak: false });
  if (meta.generatorName !== 'anthropic') {
    doc.font('Helvetica-Bold').fillColor('#b3261e').text(`GENERATED BY "${meta.generatorName.toUpperCase()}" — NOT RESEARCH`, M, y, { width: CW, align: 'center', lineBreak: false });
  }
  doc.page.margins.bottom = savedBottom;
}

/* ---------------------------------------------------------------------------
   Chart primitives
--------------------------------------------------------------------------- */

const TONE_COLOR: Record<Tone, { fill: string; text: string }> = {
  strong: { fill: '#e3f3ea', text: '#1f6f4a' },
  moderate: { fill: '#fff3d6', text: '#8a5a00' },
  weak: { fill: '#fbe7e5', text: '#b3261e' },
  na: { fill: '#eaf0f7', text: '#4a6a95' },
};
const TEAL = '#2a7f8f';
const GRID = '#e4e9f1';

function niceMax(max: number): number {
  if (max <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(max)));
  const m = max / p;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p;
}

/** Bar chart with a zero baseline, y-axis ticks and units, wrapped category labels, legend and provenance. */
function barChart(doc: Doc, chart: StandardReport['chart'], sources: StandardReport['sources'], marketLabel: string, x: number, y: number, w: number, h: number) {
  doc.roundedRect(x, y, w, h, 6).lineWidth(0.6).strokeColor(LINE).stroke();
  const pad = 9;
  let cy = y + pad;
  cy += label(doc, chart.kind === 'evidence' ? 'Market evidence' : chart.kind === 'scenario' ? 'Illustrative scenario' : 'Data gap', x + pad, cy, chart.kind === 'evidence' ? MUTED : GOLD);
  cy += box(doc, chart.title || 'Market indicator', x + pad, cy, w - 2 * pad, 22, { font: 'Helvetica-Bold', size: 8.5 }) + 2;
  const prov = chartProvenance(chart, sources, marketLabel);
  if (chart.kind === 'none' || chart.series.length === 0) {
    box(doc, chart.note || 'No suitable local market data was found, so no chart is drawn rather than an invented one.', x + pad, cy + 4, w - 2 * pad, y + h - cy - pad, { size: 7.5, color: MUTED });
    return;
  }
  cy += box(doc, `${prov.geography}${prov.period ? ' · ' + prov.period : ''}`, x + pad, cy, w - 2 * pad, 10, { size: 6.5, color: MUTED }) + 2;
  const legendH = 20;
  const axisL = 26;
  const labelH = 20;
  const plotTop = cy + 8;
  const plotBottom = y + h - pad - legendH - labelH;
  const plotH = Math.max(30, plotBottom - plotTop);
  const plotX = x + pad + axisL;
  const plotW = w - 2 * pad - axisL;
  const top = niceMax(Math.max(...chart.series.map((s) => Math.abs(s.value)), 0));
  // y-axis ticks and grid
  [0, 0.5, 1].forEach((f) => {
    const yy = plotBottom - plotH * f;
    doc.moveTo(plotX, yy).lineTo(plotX + plotW, yy).lineWidth(0.4).strokeColor(f === 0 ? MUTED : GRID).stroke();
    doc.font('Helvetica').fontSize(5.8).fillColor(MUTED).text(formatCompact(top * f), x + pad - 2, yy - 3, { width: axisL, align: 'right', lineBreak: false });
  });
  doc.font('Helvetica').fontSize(5.6).fillColor(MUTED).text((chart.unit || 'value').toUpperCase(), x + pad, plotTop - 8, { lineBreak: false, characterSpacing: 0.4 });
  const n = chart.series.length;
  const gap = Math.min(10, plotW / n / 4);
  const bw = (plotW - gap * (n - 1)) / n;
  chart.series.forEach((s, i) => {
    const bx = plotX + i * (bw + gap);
    const bh = Math.max(1, (plotH * Math.abs(s.value)) / top);
    doc.rect(bx, plotBottom - bh, bw, bh).fill(chart.kind === 'evidence' ? NAVY : GOLD);
    doc.font('Helvetica-Bold').fontSize(6.2).fillColor(INK).text(formatCompact(s.value), bx - 4, plotBottom - bh - 8, { width: bw + 8, align: 'center', lineBreak: false });
    doc.font('Helvetica').fontSize(5.8).fillColor(MUTED).text(s.label, bx - 3, plotBottom + 3, { width: bw + 6, align: 'center', height: labelH - 2, ellipsis: true, lineGap: 0 });
  });
  const ly = y + h - pad - legendH + 4;
  doc.rect(x + pad, ly + 1, 6, 6).fill(chart.kind === 'evidence' ? NAVY : GOLD);
  box(doc, `${prov.nature}${prov.sourceIndexes.length ? ` · sources ${prov.sourceIndexes.map((i) => `[${i}]`).join(' ')}` : ''}`, x + pad + 9, ly, w - 2 * pad - 9, 16, { size: 6, color: MUTED });
}

function formatCompact(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1e9) return `${(n / 1e9).toFixed(1)}bn`;
  if (abs >= 1e6) return `${(n / 1e6).toFixed(1)}m`;
  if (abs >= 1e4) return `${Math.round(n / 1e3)}k`;
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

/** Static radar: nine axes, rings at 25/50/75/100, polygon through scored criteria; unscored axes are dashed and labelled n/a. */
function radar(doc: Doc, report: StandardReport, x: number, y: number, w: number, h: number) {
  doc.roundedRect(x, y, w, h, 6).lineWidth(0.6).strokeColor(LINE).stroke();
  label(doc, 'Criteria radar', x + 9, y + 9);
  const cx = x + w / 2;
  const cy = y + 18 + (h - 18) / 2;
  const R = Math.min(w, h - 18) / 2 - 26;
  const n = CRITERIA.length;
  const pt = (i: number, v: number) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    return { x: cx + Math.cos(a) * R * (v / 100), y: cy + Math.sin(a) * R * (v / 100), a };
  };
  for (const v of [25, 50, 75, 100]) {
    const p0 = pt(0, v);
    doc.moveTo(p0.x, p0.y);
    for (let i = 1; i < n; i += 1) {
      const p = pt(i, v);
      doc.lineTo(p.x, p.y);
    }
    doc.closePath().lineWidth(0.4).strokeColor(GRID).stroke();
    doc.font('Helvetica').fontSize(5).fillColor(MUTED).text(String(v), cx + 2, cy - R * (v / 100) - 5, { lineBreak: false });
  }
  const items = CRITERIA.map((c, i) => ({ c, i, item: report.scorecard.find((s) => s.id === c.id) }));
  for (const { c, i, item } of items) {
    const e = pt(i, 100);
    const na = !item || item.score === null;
    if (na) doc.dash(2, { space: 2 });
    doc.moveTo(cx, cy).lineTo(e.x, e.y).lineWidth(0.4).strokeColor(na ? '#a9b8cf' : GRID).stroke();
    doc.undash();
    const l = pt(i, 100);
    const lx = cx + Math.cos(l.a) * (R + 14);
    const ly = cy + Math.sin(l.a) * (R + 14);
    const align = Math.abs(Math.cos(l.a)) < 0.2 ? 'center' : Math.cos(l.a) > 0 ? 'left' : 'right';
    const tw = 44;
    doc.font(na ? 'Helvetica' : 'Helvetica-Bold').fontSize(5.6).fillColor(na ? '#7389ab' : NAVY).text(`${c.short}${na ? ' (n/a)' : ''}`, align === 'left' ? lx : align === 'right' ? lx - tw : lx - tw / 2, ly - 3, { width: tw, align, lineBreak: false });
  }
  const scored = items.filter(({ item }) => item && item.score !== null);
  if (scored.length >= 3) {
    scored.forEach(({ i, item }, k) => {
      const p = pt(i, item!.score!);
      if (k === 0) doc.moveTo(p.x, p.y);
      else doc.lineTo(p.x, p.y);
    });
    doc.closePath().lineWidth(1.2).fillOpacity(0.16).fillAndStroke(NAVY, NAVY);
    doc.fillOpacity(1);
    for (const { i, item } of scored) {
      const p = pt(i, item!.score!);
      doc.circle(p.x, p.y, 2).fill(TEAL);
    }
  }
}

/** Score ring with the number inside, drawn as an SVG arc path. */
function scoreRing(doc: Doc, score: number | null, cx: number, cy: number, r: number, onDark: boolean) {
  const tone = scoreTone(score);
  doc.circle(cx, cy, r).lineWidth(6).strokeColor(onDark ? '#2b4466' : '#eaf0f7').stroke();
  if (score !== null && score > 0) {
    const frac = Math.min(100, score) / 100;
    const end = -Math.PI / 2 + 2 * Math.PI * frac;
    const sx = cx;
    const sy = cy - r;
    const ex = cx + Math.cos(end) * r;
    const ey = cy + Math.sin(end) * r;
    const large = frac > 0.5 ? 1 : 0;
    const col = tone === 'strong' ? '#5fcf92' : tone === 'moderate' ? '#e8c060' : '#f08a7e';
    if (frac >= 0.999) doc.circle(cx, cy, r).lineWidth(6).strokeColor(col).stroke();
    else doc.path(`M ${sx} ${sy} A ${r} ${r} 0 ${large} 1 ${ex} ${ey}`).lineWidth(6).lineCap('round').strokeColor(col).stroke();
  }
  if (score === null) {
    doc.font('Helvetica-Bold').fontSize(7).fillColor(onDark ? '#ffffff' : NAVY).text('Incomplete', cx - r, cy - 4, { width: 2 * r, align: 'center', lineBreak: false });
  } else {
    doc.font('Times-Bold').fontSize(22).fillColor(onDark ? '#ffffff' : NAVY).text(String(score), cx - r, cy - 13, { width: 2 * r, align: 'center', lineBreak: false });
    doc.font('Helvetica').fontSize(6.5).fillColor(onDark ? '#c8d1de' : MUTED).text('/100', cx - r, cy + 10, { width: 2 * r, align: 'center', lineBreak: false });
  }
}

/** Factor card: heading, group average, one row per criterion with a bar, score and basis. */
function factorCard(doc: Doc, report: StandardReport, group: 'market' | 'execution', headline: Headline, x: number, y: number, w: number): number {
  const g = GROUPS.find((gg) => gg.id === group)!;
  const items = itemsForGroup(report, group);
  const rowH = 21;
  const h = 24 + items.length * rowH + 4;
  doc.roundedRect(x, y, w, h, 6).fill('#f6f4ef');
  doc.font('Helvetica-Bold').fontSize(8.5).fillColor(NAVY).text(g.label, x + 9, y + 7, { lineBreak: false });
  const gs = headline.groups[group];
  doc.font('Helvetica').fontSize(7).fillColor(MUTED).text(gs.score === null ? 'not scored' : `average ${gs.score}`, x + w - 90, y + 8, { width: 82, align: 'right', lineBreak: false });
  let ry = y + 24;
  const labelW = 98;
  const barX = x + 9 + labelW;
  const barW = w - labelW - 9 - 9 - 62;
  for (const item of items) {
    const c = criterion(item.id);
    const tone = scoreTone(item.score);
    doc.font('Helvetica').fontSize(7).fillColor(INK).text(c?.label ?? item.id, x + 9, ry + 2, { width: labelW - 4, lineBreak: false, ellipsis: true });
    doc.roundedRect(barX, ry + 3, barW, 6, 3).fill('#e4e9f1');
    if (item.score !== null) doc.roundedRect(barX, ry + 3, Math.max(3, (barW * item.score) / 100), 6, 3).fill(TONE_COLOR[tone].text);
    const txt = item.score === null ? 'Not enough evidence' : `${item.score}/100 · ${item.basis === 'evidence' ? 'evidence' : 'assumption'}`;
    doc.font(item.score === null ? 'Helvetica-Oblique' : 'Helvetica-Bold').fontSize(6.3).fillColor(item.score === null ? MUTED : INK).text(txt, barX + barW + 4, ry + 2, { width: 60, lineBreak: false });
    box(doc, item.note, x + 9, ry + 11, w - 18, 9, { size: 5.8, color: MUTED });
    ry += rowH;
  }
  return h;
}

/* ---------------------------------------------------------------------------
   Standard report: two pages
--------------------------------------------------------------------------- */

export async function renderStandardPdf(report: StandardReport, meta: PdfMeta): Promise<{ pdf: Buffer; pageCount: number }> {
  const { doc, done } = newDoc(report.title);
  const fin = computeFinancials({
    currency: report.financial_inputs.price.unit ? guessCurrency(report) : 'GBP',
    price: { value: report.financial_inputs.price.value, unit: report.financial_inputs.price.unit || 'sale', basis: report.financial_inputs.price.basis, note: report.financial_inputs.price.note },
    variableCost: { value: report.financial_inputs.variable_cost.value, unit: report.financial_inputs.variable_cost.unit || 'sale', basis: report.financial_inputs.variable_cost.basis, note: report.financial_inputs.variable_cost.note },
    fixedMonthly: { value: report.financial_inputs.fixed_monthly.value, unit: 'per month', basis: report.financial_inputs.fixed_monthly.basis, note: report.financial_inputs.fixed_monthly.note },
    volumes: { ...report.financial_inputs.volumes },
  });
  const headline = deriveHeadline(report);

  /* ---------------- Page 1 ---------------- */
  doc.rect(0, 0, A4.w, 92).fill(NAVY);
  doc.font('Helvetica').fontSize(7.5).fillColor(SAND).text(`${COMPANY.name.toUpperCase()}  ·  ${COMPANY.productName.toUpperCase()}  ·  ${PRODUCTS.standard.name.toUpperCase()}`, M, 16, { characterSpacing: 1.5, lineBreak: false });
  box(doc, report.title, M, 30, CW - 130, 36, { font: 'Times-Roman', size: 17, color: '#ffffff', lineGap: 0 });
  box(doc, `Launch market: ${meta.marketLabel}  ·  ${meta.generatedAt.toISOString().slice(0, 10)}  ·  Ref ${meta.orderRef}`, M, 68, CW, 12, { size: 7.5, color: '#c8d1de' });
  if (meta.reportUrl) box(doc, 'Open web report', A4.w - M - 120, 34, 120, 12, { size: 8, color: SAND, align: 'right', link: meta.reportUrl });

  // Score panel
  let y = 102;
  const panelH = 124;
  doc.roundedRect(M, y, CW, panelH, 8).fill('#0b1a2e');
  scoreRing(doc, headline.overall.score, M + 44, y + panelH / 2, 30, true);
  const sx = M + 92;
  const scoreW = 180;
  label(doc, SCORE_LABEL, sx, y + 12, SAND);
  box(doc, headline.band.title, sx, y + 24, scoreW, 30, { font: 'Times-Roman', size: 12, color: '#ffffff', lineGap: 0 });
  box(doc, headline.overall.score === null ? `Only ${headline.overall.scored} of ${headline.overall.total} criteria could be scored; an overall score needs at least six.` : `${headline.overall.scored} of ${headline.overall.total} criteria scored${headline.overall.missing.length ? `; ${headline.overall.missing.length} not enough evidence` : ''}.`, sx, y + 56, scoreW, 22, { size: 6.6, color: '#c8d1de' });
  doc.font('Helvetica-Bold').fontSize(6.4).fillColor(SAND).text('EVIDENCE CONFIDENCE', sx, y + 82, { characterSpacing: 0.8, lineBreak: false });
  chip(doc, headline.confidence.label, sx + 88, y + 79, headline.confidence.level === 'high' ? 'go' : headline.confidence.level === 'medium' ? 'caution' : 'stop');
  box(doc, headline.confidence.detail, sx, y + 97, scoreW, 20, { size: 5.8, color: '#c8d1de' });
  const mx = sx + scoreW + 14;
  const mw = M + CW - mx - 10;
  doc.roundedRect(mx, y + 10, mw, 50, 4).fill('#15294a');
  label(doc, 'Strongest supported opportunity', mx + 8, y + 15, SAND);
  box(doc, headline.strongest.text, mx + 8, y + 27, mw - 16, 30, { size: 6.8, color: '#ffffff' });
  doc.roundedRect(mx, y + 66, mw, 50, 4).fill('#15294a');
  label(doc, 'Most useful next action', mx + 8, y + 71, SAND);
  box(doc, headline.nextAction, mx + 8, y + 83, mw - 16, 30, { size: 6.8, color: '#ffffff' });
  y += panelH + 6;

  // Assessment
  y += box(doc, report.idea_summary, M, y, CW, 11, { size: 7.5, color: MUTED }) + 2;
  y += box(doc, report.verdict.explanation, M, y, CW, 44, { size: 8, lineGap: 1.4 }) + 2;
  y += box(doc, SCORE_DISCLAIMER, M, y, CW, 10, { size: 6, color: MUTED }) + 6;

  // Left column: factor cards + insights; right column: radar + chart + rubric
  const leftW = 306;
  const rightX = M + leftW + 12;
  const rightW = CW - leftW - 12;
  const colTop = y;
  let ly = colTop;
  ly += factorCard(doc, report, 'market', headline, M, ly, leftW) + 6;
  ly += factorCard(doc, report, 'execution', headline, M, ly, leftW) + 6;
  const bottom = A4.h - M - 14;
  const strengthen = toStrengthen(report, 3);
  const positives = [...report.swot.strengths, ...report.swot.opportunities.map((o) => `Opportunity: ${o}`)];
  const posText = positives.length ? positives.map((s) => `• ${s}`).join('\n') : '• None could be supported from the available evidence.';
  const work = strengthen.length
    ? strengthen.map((s) => `• ${criterion(s.id)?.label ?? s.id} (${s.score}/100): ${s.improvement}`)
    : [...report.swot.weaknesses.map((w) => `• ${w}`), ...report.swot.threats.map((t) => `• Threat: ${t}`)];
  const workText = work.join('\n') || '• Nothing specific was identified.';
  // Size the two insight boxes to their content (never giant empty cards), within the remaining column.
  const avail = bottom - ly - 6;
  doc.font('Helvetica').fontSize(6.9);
  const need = (t: string) => Math.ceil(doc.heightOfString(t, { width: leftW - 16, lineGap: 1.1 })) + 24;
  let posH = Math.min(Math.max(44, need(posText)), avail * 0.55);
  let workH = Math.min(Math.max(44, need(workText)), avail - posH - 6);
  if (posH + workH + 6 > avail) posH = avail - workH - 6;
  doc.roundedRect(M, ly, leftW, posH, 6).fill(TONE_COLOR.strong.fill);
  doc.font('Helvetica-Bold').fontSize(7.5).fillColor(TONE_COLOR.strong.text).text('Supported strengths and opportunities', M + 8, ly + 6, { lineBreak: false });
  box(doc, posText, M + 8, ly + 18, leftW - 16, posH - 22, { size: 6.9, lineGap: 1.1 });
  const wy = ly + posH + 6;
  doc.roundedRect(M, wy, leftW, workH, 6).fill('#f1e9d8');
  doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#8a5a00').text('What needs strengthening', M + 8, wy + 6, { lineBreak: false });
  box(doc, workText, M + 8, wy + 18, leftW - 16, workH - 22, { size: 6.9, lineGap: 1.1 });

  const radarH = 196;
  radar(doc, report, rightX, colTop, rightW, radarH);
  const chartTop = colTop + radarH + 6;
  const chartH = 176;
  barChart(doc, report.chart, report.sources, meta.marketLabel, rightX, chartTop, rightW, chartH);
  box(doc, SCORE_RUBRIC, rightX, chartTop + chartH + 6, rightW, bottom - (chartTop + chartH + 6), { size: 5.9, color: MUTED, lineGap: 0.8 });
  footer(doc, meta, 1, 2);

  /* ---------------- Page 2 ---------------- */
  doc.addPage();
  y = M;
  y += heading(doc, 'Financial scenarios (computed from stated inputs; illustrative, not a forecast)', M, y, CW);
  y = financialTable(doc, fin, M, y, CW);

  y += heading(doc, 'Key risks and how to test them', M, y, CW);
  const riskW = (CW - 16) / 3;
  const riskH = 58;
  report.risks.forEach((r, i) => {
    const rx = M + i * (riskW + 8);
    doc.roundedRect(rx, y, riskW, riskH, 5).lineWidth(0.5).strokeColor(LINE).stroke();
    doc.rect(rx, y, riskW, 2.5).fill('#8a5a00');
    const h1 = box(doc, r.risk, rx + 6, y + 7, riskW - 12, 24, { size: 7.3, font: 'Helvetica-Bold' });
    box(doc, `Test it: ${r.validation_method}`, rx + 6, y + 9 + h1, riskW - 12, riskH - 12 - h1, { size: 6.8, color: MUTED });
  });
  y += riskH + 10;

  const halfW = (CW - 16) / 2;
  const colTop2 = y;
  let lyy = colTop2 + heading(doc, 'Prioritised recommendations', M, colTop2, halfW);
  report.improvements.forEach((r, i) => {
    const h1 = box(doc, `${i + 1}. ${r.action}`, M, lyy, halfW, 20, { size: 7.4, font: 'Helvetica-Bold' });
    const meta2 = [r.purpose ? `Why: ${r.purpose}` : '', r.measure ? `Measure: ${r.measure}` : ''].filter(Boolean).join('  ·  ');
    const h2 = meta2 ? box(doc, meta2, M + 10, lyy + h1 + 1, halfW - 10, 18, { size: 6.4, color: MUTED }) : 0;
    lyy += h1 + h2 + 5;
  });
  const rx2 = M + halfW + 16;
  let ry = colTop2 + heading(doc, 'What to test first', rx2, colTop2, halfW);
  const ex = report.experiment;
  doc.roundedRect(rx2, ry, halfW, 84, 5).fill('#eaf0f7');
  doc.rect(rx2, ry, 3, 84).fill(TEAL);
  const eh = box(doc, ex.description, rx2 + 10, ry + 7, halfW - 18, 34, { size: 7.6 });
  box(doc, `Budget: ${formatMoney(ex.budget_amount, fin.currency)}   ·   Duration: ${ex.duration}`, rx2 + 10, ry + 9 + eh, halfW - 18, 11, { size: 7, font: 'Helvetica-Bold' });
  box(doc, `Suggested success threshold: ${ex.success_criterion}`, rx2 + 10, ry + 21 + eh, halfW - 18, 84 - 24 - eh, { size: 6.8 });
  ry += 90;
  ry += label(doc, 'Limitations', rx2, ry);
  ry += box(doc, report.limitations.map((l) => `• ${l}`).join('\n'), rx2, ry, halfW, 56, { size: 6.6, color: INK, lineGap: 1 });
  y = Math.max(lyy, ry) + 6;

  // Sources
  const ctaH = 66;
  const srcBottom = A4.h - M - 12 - ctaH;
  y += heading(doc, 'Sources and evidence basis', M, y, CW);
  const srcW = CW * 0.62;
  const noteX = M + srcW + 12;
  const noteW = CW - srcW - 12;
  let sy = y;
  const perSource = Math.max(18, Math.floor((srcBottom - y) / Math.max(report.sources.length, 1)));
  if (!report.sources.length) sy += box(doc, 'No retrievable sources were found for this idea and market; every statement above is an assumption or a customer input.', M, sy, srcW, 30, { size: 7, color: MUTED });
  for (const s of report.sources) {
    if (sy + 18 > srcBottom) break; // never run into the CTAs
    const metaLine = [s.publisher, s.published_date ?? 'date unknown', s.geography, s.period, s.claim_type === 'forecast' ? 'forecast' : s.claim_type === 'historical' ? 'historical' : null].filter(Boolean).join(' · ');
    const h1 = box(doc, `[${s.index}] ${s.title}${metaLine ? ` — ${metaLine}` : ''}`, M, sy, srcW, Math.min(20, perSource - 8, srcBottom - sy - 9), { size: 6.8 });
    const h2 = box(doc, s.url, M, sy + h1 + 1, srcW, Math.max(7, Math.min(perSource - h1 - 4, srcBottom - sy - h1 - 2)), { size: 6, color: MUTED, link: s.url });
    sy += h1 + h2 + 3;
  }
  const evidence = report.claims.filter((c) => c.kind === 'evidence').length;
  const assumptions = report.claims.filter((c) => c.kind === 'assumption').length;
  const noteH = box(doc, `Evidence basis: ${evidence} evidence claim${evidence === 1 ? '' : 's'} citing the numbered sources, ${assumptions} labelled assumption${assumptions === 1 ? '' : 's'}, ${report.claims.length - evidence - assumptions} customer inputs or calculations. Full claim list on the web report. Retrieval date ${meta.generatedAt.toISOString().slice(0, 10)}. ${DISCLAIMER}`, noteX, y, noteW, srcBottom - y, { size: 6.2, color: MUTED, lineGap: 0.9 });

  // CTAs follow the content rather than sitting at the foot of a half-empty page.
  const cy = Math.min(A4.h - M - 8 - ctaH, Math.max(sy, y + noteH) + 12);
  doc.roundedRect(M, cy, halfW, ctaH, 6).fill('#f6f4ef');
  doc.font('Helvetica-Bold').fontSize(8.5).fillColor(NAVY).text('Need more than a report?', M + 10, cy + 8, { lineBreak: false });
  box(doc, CONSULTATION.text, M + 10, cy + 20, halfW - 20, 42, { size: 7.2, link: CONSULTATION.mailto(meta.orderRef) });
  doc.roundedRect(M + halfW + 16, cy, halfW, ctaH, 6).fill(NAVY);
  doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#ffffff').text(`Detailed report — one-time upgrade, ${PRODUCTS.upgrade.display} additional`, M + halfW + 26, cy + 8, { lineBreak: false });
  box(doc, `${UPGRADE_INCLUDES.map((u) => u.title).join(' · ')}. ${PRODUCTS.upgrade.display} is additional to the ${PRODUCTS.standard.display} standard report (${PRODUCTS.standard.display} + ${PRODUCTS.upgrade.display} = ${COMBINED_TOTAL.display} in total).${meta.reportUrl ? ' Open your report page to upgrade.' : ''}`, M + halfW + 26, cy + 20, halfW - 20, 42, { size: 7, color: '#e3e9f2', link: meta.reportUrl });
  footer(doc, meta, 2, 2);

  const pageCount = doc.bufferedPageRange().count;
  doc.end();
  return { pdf: await done, pageCount };
}

function guessCurrency(report: StandardReport): string {
  const n = report.financial_inputs.price.note + report.financial_inputs.fixed_monthly.note;
  if (/\bAUD|A\$/.test(n)) return 'AUD';
  if (/\bUSD|\$/.test(n)) return 'USD';
  return 'GBP';
}

function financialTable(doc: Doc, fin: FinancialResult, x: number, y: number, w: number): number {
  const cols = ['Scenario', 'Units / month', 'Revenue', 'Contribution', 'Fixed costs', 'Profit / month'];
  const cw = [70, 80, 90, 95, 90, w - 425];
  const row = (cells: string[], bold: boolean, yy: number, shade?: string) => {
    if (shade) doc.rect(x, yy - 2, w, 13).fill(shade);
    let cx = x;
    cells.forEach((c, i) => {
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(7.8).fillColor(bold ? MUTED : INK).text(c, cx + 3, yy, { width: cw[i] - 6, align: i === 0 ? 'left' : 'right', lineBreak: false });
      cx += cw[i];
    });
    return 13;
  };
  y += row(cols, true, y, '#f1e9d8');
  for (const r of fin.rows) {
    y += row([r.label, r.units.toLocaleString('en-GB'), formatMoney(r.revenue, fin.currency), formatMoney(r.contribution, fin.currency), formatMoney(r.fixedCosts, fin.currency), (r.profit < 0 ? '−' : '') + formatMoney(Math.abs(r.profit), fin.currency)], false, y, r.label === 'Base' ? '#fbfaf6' : undefined);
  }
  y += 2;
  y += box(doc, `Break-even: ${fin.breakEvenNote}${fin.contributionMarginPct !== null ? ` Contribution margin ${fin.contributionMarginPct.toFixed(0)}%.` : ''}`, x, y, w, 24, { size: 7.6, font: 'Helvetica-Bold', color: fin.breakEvenUnits === null ? '#8a5a00' : INK }) + 3;
  const assum = fin.assumptions.map((a) => `${a.label}: ${a.value} (${a.basis.replace('_', ' ')}${a.note ? `; ${a.note}` : ''})`).join('   ·   ');
  y += box(doc, `Assumptions: ${assum}`, x, y, w, 34, { size: 6.9, color: MUTED }) + 8;
  return y;
}

/* ---------------------------------------------------------------------------
   Detailed report: flowing pages
--------------------------------------------------------------------------- */

export async function renderDetailedPdf(report: DetailedReport, meta: PdfMeta): Promise<{ pdf: Buffer; pageCount: number }> {
  const { doc, done } = newDoc(report.title);
  const width = CW;
  const fin = computeFinancials({
    currency: 'GBP',
    price: { value: report.financial_inputs.price.value, unit: report.financial_inputs.price.unit || 'sale', basis: report.financial_inputs.price.basis, note: report.financial_inputs.price.note },
    variableCost: { value: report.financial_inputs.variable_cost.value, unit: report.financial_inputs.variable_cost.unit || 'sale', basis: report.financial_inputs.variable_cost.basis, note: report.financial_inputs.variable_cost.note },
    fixedMonthly: { value: report.financial_inputs.fixed_monthly.value, unit: 'per month', basis: report.financial_inputs.fixed_monthly.basis, note: report.financial_inputs.fixed_monthly.note },
    volumes: { ...report.financial_inputs.volumes },
  });

  doc.rect(0, 0, A4.w, 150).fill(NAVY);
  doc.font('Helvetica').fontSize(8).fillColor(SAND).text(`${COMPANY.name.toUpperCase()}  ·  ${PRODUCTS.upgrade.name.toUpperCase()}`, M, 40, { characterSpacing: 1.5 });
  doc.font('Times-Roman').fontSize(22).fillColor('#ffffff').text(report.title, M, 62, { width });
  doc.font('Helvetica').fontSize(8.5).fillColor('#c8d1de').text(`${meta.marketLabel}  ·  ${meta.generatedAt.toISOString().slice(0, 10)}  ·  Ref ${meta.orderRef}`, M, 122);
  doc.y = 175;
  doc.x = M;
  const h2 = (t: string) => {
    if (doc.y > A4.h - 120) doc.addPage();
    doc.moveDown(0.6);
    doc.font('Times-Roman').fontSize(14).fillColor(NAVY).text(t, { width });
    doc.moveTo(M, doc.y + 2).lineTo(M + width, doc.y + 2).lineWidth(0.6).strokeColor(GOLD).stroke();
    doc.moveDown(0.5);
  };
  const para = (t: string) => doc.font('Helvetica').fontSize(9.5).fillColor(INK).text(t, { width, lineGap: 2, paragraphGap: 5 });
  const bullets = (items: string[]) => items.forEach((b) => doc.font('Helvetica').fontSize(9.5).fillColor(INK).text(`•  ${b}`, { width, lineGap: 1.5, paragraphGap: 2 }));

  h2('Executive summary');
  bullets(report.executive_summary);

  for (const s of report.sections) {
    h2(s.heading);
    for (const p of s.paragraphs) para(p);
    if (s.bullets.length) bullets(s.bullets);
    if (s.table) table(doc, s.table.columns, s.table.rows, width);
    if (s.id === 'financial_scenarios') {
      doc.moveDown(0.4);
      doc.font('Helvetica-Bold').fontSize(9).fillColor(MUTED).text('Scenario table computed from the stated inputs', { width });
      doc.moveDown(0.3);
      if (doc.y > A4.h - 160) doc.addPage();
      doc.y = financialTable(doc, fin, M, doc.y, width);
      doc.x = M;
    }
    if (s.id === 'sensitivity_risks' && report.sensitivity.length) {
      table(doc, ['Change', 'Effect'], report.sensitivity.map((r) => [r.change, r.effect]), width);
    }
    if (s.id === 'sources_limitations') {
      for (const src of report.sources) {
        const metaLine = [src.publisher, src.published_date ?? 'date unknown', src.geography, src.period, src.claim_type].filter(Boolean).join(' · ');
        doc.font('Helvetica').fontSize(8).fillColor(INK).text(`[${src.index}] ${src.title} — ${metaLine}`, { width });
        doc.font('Helvetica').fontSize(7.5).fillColor(MUTED).text(src.url, { width, link: src.url, paragraphGap: 3 });
      }
      doc.moveDown(0.3);
      doc.font('Helvetica-Bold').fontSize(9).fillColor(MUTED).text('Limitations', { width });
      bullets(report.limitations);
    }
  }

  if (report.claims.length) {
    h2('Evidence and basis of claims');
    doc.font('Helvetica').fontSize(8).fillColor(MUTED).text('Each claim is tagged with its basis. Evidence claims cite the numbered sources; assumptions were not verified.', { width });
    doc.moveDown(0.3);
    for (const c of report.claims) {
      const tag = `[${c.kind}, ${c.confidence}${c.evidence_date ? `, ${c.evidence_date}` : ''}${c.source_indexes.length ? `, sources ${c.source_indexes.join(',')}` : ''}] `;
      doc.font('Helvetica-Bold').fontSize(7.8).fillColor(NAVY).text(tag, { continued: true, width });
      doc.font('Helvetica').fillColor(INK).text(c.text, { width, paragraphGap: 2 });
    }
  }

  h2('Talk to an expert');
  doc.font('Helvetica').fontSize(9.5).fillColor(INK).text(CONSULTATION.text, { width, link: CONSULTATION.mailto(meta.orderRef) });
  doc.moveDown(0.6);
  doc.font('Helvetica-Oblique').fontSize(7.8).fillColor(MUTED).text(DISCLAIMER, { width });

  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i += 1) {
    doc.switchToPage(i);
    footer(doc, meta, i + 1, range.count);
  }
  doc.end();
  return { pdf: await done, pageCount: range.count };
}

function table(doc: Doc, columns: string[], rows: string[][], width: number) {
  const colW = width / columns.length;
  const drawRow = (cells: string[], bold: boolean) => {
    if (doc.y > A4.h - 90) doc.addPage();
    const y = doc.y;
    let h = 0;
    cells.forEach((cell, i) => {
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(8.5).fillColor(bold ? MUTED : INK);
      h = Math.max(h, doc.heightOfString(cell ?? '', { width: colW - 8 }));
      doc.text(cell ?? '', M + i * colW + 4, y + 4, { width: colW - 8 });
    });
    doc.y = y + h + 9;
    doc.moveTo(M, doc.y - 2).lineTo(M + width, doc.y - 2).lineWidth(0.5).strokeColor(LINE).stroke();
    doc.x = M;
  };
  doc.moveDown(0.3);
  drawRow(columns, true);
  for (const r of rows) drawRow(r, false);
  doc.moveDown(0.5);
}
