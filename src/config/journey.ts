/*
  The illustrated four-week journey: phases, scene families and original
  line-art scenes shared by the web report (SVG) and the PDF (vector paths).

  - Four fixed phases: Listen, Select, Test, Learn. The plan text (action,
    measure, detail) is generated per report and validated server-side; the
    artwork is chosen here from validated business metadata (industry and
    revenue model), never from model output.
  - Every scene is a list of path commands in a 120 × 90 box with a role:
    outline (navy), highlight (teal) or accent (amber). No raster images,
    no external assets, no model-generated markup.
  - Four weeks are a suggested initial validation period, not a launch
    schedule; the caveat text travels with the plan.

  Server-safe: relative imports only, no DOM.
*/

export const JOURNEY_PHASES = [
  { week: 1, id: 'listen', title: 'Listen', purpose: 'Hear the problem from the people who have it.' },
  { week: 2, id: 'select', title: 'Select', purpose: 'Choose the one offer to put in front of them.' },
  { week: 3, id: 'test', title: 'Test', purpose: 'Run the smallest real test that produces a number.' },
  { week: 4, id: 'learn', title: 'Learn', purpose: 'Compare the number with the threshold and decide.' },
] as const;
export type PhaseId = (typeof JOURNEY_PHASES)[number]['id'];

export const PLAN_LABEL = 'Your first four weeks in action';
export const PLAN_CAVEAT = 'Suggested plan. Adapt the timing to your circumstances.';

export const SCENE_FAMILIES = ['retail', 'software', 'services', 'hospitality', 'generic'] as const;
export type SceneFamily = (typeof SCENE_FAMILIES)[number];

/** Human labels for the scene families (used in alt text). */
export const SCENE_LABELS: Record<SceneFamily, Record<PhaseId, string>> = {
  retail: { listen: 'Customer interview at a counter', select: 'Choosing one product from a shelf', test: 'A trial sale with a receipt', learn: 'Reviewing results in a notebook' },
  software: { listen: 'User interview with a phone', select: 'Sketching a prototype screen', test: 'Usability test on a screen', learn: 'Reviewing results in a notebook' },
  services: { listen: 'Discovery conversation across a table', select: 'Defining one service package', test: 'A pilot engagement agreed by handshake', learn: 'Reviewing results in a notebook' },
  hospitality: { listen: 'Asking guests about their preferences', select: 'Composing a sample offer', test: 'A limited trial for a few tables', learn: 'Reviewing results in a notebook' },
  generic: { listen: 'Discovery conversation', select: 'Choosing one option from a clipboard', test: 'A small controlled test', learn: 'Reviewing results in a notebook' },
};

/** Pick the artwork family from validated questionnaire metadata, never from model text. */
export function sceneFamilyFor(industry: string | undefined, revenueModel: string | undefined): SceneFamily {
  const i = (industry ?? '').toLowerCase();
  const r = (revenueModel ?? '').toLowerCase();
  if (i === 'software' || /\b(app|software|saas|platform|digital)\b/.test(i)) return 'software';
  if (i === 'retail-ecommerce' || /\b(retail|shop|store|e-?commerce|market)\b/.test(i)) return 'retail';
  if (i === 'hospitality-tourism' || i === 'food-drink' || /\b(caf|restaurant|hotel|hospitality|bar|catering|tourism)/.test(i)) return 'hospitality';
  if (['professional-services', 'finance', 'education', 'creative-media', 'trades-construction', 'personal-services', 'health-wellness'].includes(i) || /\b(consult|service|agency|coach|training|clinic|legal|account)/.test(i)) return 'services';
  if (r === 'time' || r === 'project' || r === 'commission') return 'services';
  if (r === 'subscription' && !i) return 'software';
  return 'generic';
}

/* ---------------------------------------------------------------------------
   Scene geometry. Each helper returns path data in a 120 × 90 box.
--------------------------------------------------------------------------- */

export type Role = 'outline' | 'highlight' | 'accent' | 'highlightFill' | 'accentFill';
export interface ScenePath { d: string; role: Role; width?: number }
export interface Scene { viewBox: string; paths: ScenePath[] }

const o = (d: string, width = 2): ScenePath => ({ d, role: 'outline', width });
const t = (d: string, width = 2): ScenePath => ({ d, role: 'highlight', width });
const a = (d: string): ScenePath => ({ d, role: 'accentFill' });
const tf = (d: string): ScenePath => ({ d, role: 'highlightFill' });

const circle = (cx: number, cy: number, r: number) => `M ${cx - r} ${cy} a ${r} ${r} 0 1 0 ${2 * r} 0 a ${r} ${r} 0 1 0 ${-2 * r} 0 Z`;
const rect = (x: number, y: number, w: number, h: number, r = 3) => `M ${x + r} ${y} h ${w - 2 * r} a ${r} ${r} 0 0 1 ${r} ${r} v ${h - 2 * r} a ${r} ${r} 0 0 1 ${-r} ${r} h ${-(w - 2 * r)} a ${r} ${r} 0 0 1 ${-r} ${-r} v ${-(h - 2 * r)} a ${r} ${r} 0 0 1 ${r} ${-r} Z`;
const line = (x1: number, y1: number, x2: number, y2: number) => `M ${x1} ${y1} L ${x2} ${y2}`;
/** Head and shoulders; facing is cosmetic (shoulder arc only). */
const person = (cx: number, baseY: number, scale = 1): string[] => [circle(cx, baseY - 26 * scale, 7 * scale), `M ${cx - 13 * scale} ${baseY} a ${13 * scale} ${13 * scale} 0 0 1 ${26 * scale} 0`];
const bubble = (x: number, y: number, w: number, h: number, tailLeft = true) => `${rect(x, y, w, h, 4)} M ${tailLeft ? x + 10 : x + w - 10} ${y + h} l ${tailLeft ? -5 : 5} 6 l ${tailLeft ? 9 : -9} -6`;
const check = (x: number, y: number) => `M ${x} ${y} l 4 4 l 8 -9`;
const dots = (x: number, y: number) => [circle(x, y, 1.3), circle(x + 6, y, 1.3), circle(x + 12, y, 1.3)].join(' ');
const bars = (x: number, base: number, heights: number[], w = 7, gap = 5) => heights.map((h, i) => rect(x + i * (w + gap), base - h, w, h, 1)).join(' ');
const screen = (x: number, y: number, w: number, h: number) => `${rect(x, y, w, h, 3)} M ${x + w / 2 - 10} ${y + h + 7} h 20 M ${x + w / 2} ${y + h} v 7`;
const notebook = (x: number, y: number, w: number, h: number) => `${rect(x, y, w, h, 3)} M ${x + 12} ${y} v ${h} M ${x + 4} ${y + 10} h 5 M ${x + 4} ${y + 22} h 5 M ${x + 4} ${y + 34} h 5`;

function learnScene(): Scene {
  return {
    viewBox: '0 0 120 90',
    paths: [
      o(notebook(22, 18, 76, 58)),
      t(line(44, 64, 90, 64), 1.5),
      t(bars(48, 64, [14, 22, 10, 26])),
      a(circle(96, 24, 6)),
      o(check(91, 23), 2),
      o(line(44, 28, 60, 28), 1.5),
      o(line(44, 34, 56, 34), 1.5),
    ],
  };
}

const SCENES: Record<SceneFamily, Record<PhaseId, Scene>> = {
  retail: {
    listen: { viewBox: '0 0 120 90', paths: [o(line(10, 70, 110, 70)), o(rect(14, 52, 48, 18, 2)), ...person(36, 52).map((d) => o(d)), ...person(88, 70, 0.95).map((d) => o(d)), t(bubble(52, 10, 40, 22)), tf(dots(63, 21)), a(circle(30, 60, 2.5)), a(circle(40, 60, 2.5))] },
    select: { viewBox: '0 0 120 90', paths: [o(line(14, 40, 106, 40)), o(line(14, 66, 106, 66)), o(rect(20, 22, 18, 18, 2)), t(rect(48, 18, 22, 22, 2), 2.5), o(rect(80, 24, 16, 16, 2)), o(rect(22, 48, 16, 18, 2)), o(rect(50, 50, 18, 16, 2)), o(rect(82, 46, 14, 20, 2)), a(circle(66, 14, 6)), o(check(61, 13), 2)] },
    test: { viewBox: '0 0 120 90', paths: [o(line(8, 72, 112, 72)), o(rect(14, 44, 60, 28, 3)), t(rect(22, 24, 28, 20, 2)), t(line(28, 32, 44, 32), 1.5), t(line(28, 38, 40, 38), 1.5), o(`M 84 42 h 22 l -3 30 h -16 Z`), o(line(89, 42, 92, 34)), o(line(101, 42, 98, 34)), a(circle(64, 56, 5)), o(`M 56 52 l 6 -8`, 1.5)] },
    learn: learnScene(),
  },
  software: {
    listen: { viewBox: '0 0 120 90', paths: [...person(34, 74).map((d) => o(d)), o(rect(70, 26, 26, 46, 4)), o(line(78, 66, 88, 66), 1.5), t(rect(74, 32, 18, 26, 2), 1.5), t(bubble(40, 10, 34, 20, false)), tf(dots(49, 20)), a(circle(96, 24, 5))] },
    select: { viewBox: '0 0 120 90', paths: [o(screen(18, 14, 84, 54)), t(rect(26, 22, 30, 12, 2), 1.5), t(rect(26, 40, 68, 8, 2), 1.5), t(rect(26, 52, 40, 8, 2), 1.5), o(rect(64, 22, 30, 12, 2), 1.5), a(circle(96, 20, 6)), o(`M 92 20 l 3 3 l 5 -6`, 1.5)] },
    test: { viewBox: '0 0 120 90', paths: [o(screen(14, 14, 70, 50)), t(rect(22, 22, 54, 10, 2), 1.5), t(rect(22, 38, 24, 18, 2), 1.5), o(rect(52, 38, 24, 18, 2), 1.5), o(`M 60 46 l 10 10 l -3 1 l 2 5 l -3 1 l -2 -5 l -3 3 Z`, 1.5), o(rect(92, 30, 18, 36, 2)), o(check(96, 38), 1.5), o(check(96, 48), 1.5), a(circle(101, 60, 2.5))] },
    learn: learnScene(),
  },
  services: {
    listen: { viewBox: '0 0 120 90', paths: [o(line(10, 60, 110, 60)), o(line(30, 60, 30, 76)), o(line(90, 60, 90, 76)), ...person(34, 60, 0.9).map((d) => o(d)), ...person(86, 60, 0.9).map((d) => o(d)), t(bubble(46, 8, 32, 18, true)), tf(dots(54, 17)), a(rect(52, 52, 16, 6, 1))] },
    select: { viewBox: '0 0 120 90', paths: [o(rect(28, 12, 56, 66, 4)), t(line(38, 26, 74, 26), 2.5), o(line(38, 38, 70, 38), 1.5), o(line(38, 48, 66, 48), 1.5), o(line(38, 58, 72, 58), 1.5), a(`M 84 36 h 22 l 4 6 l -4 6 h -22 Z`), o(check(90, 41), 1.5)] },
    test: { viewBox: '0 0 120 90', paths: [o(`M 20 50 l 18 -14 h 14 l 10 10 l 10 -10 h 14 l 16 14`, 2.5), o(`M 52 46 l 8 8 l 8 -8`, 2), t(rect(36, 60, 48, 20, 3)), t(line(44, 70, 76, 70), 1.5), a(circle(96, 20, 6)), o(check(91, 19), 2), t(line(20, 26, 36, 26), 1.5), t(line(20, 30, 32, 30), 1.5)] },
    learn: learnScene(),
  },
  hospitality: {
    listen: { viewBox: '0 0 120 90', paths: [o(line(12, 70, 108, 70)), ...person(36, 70).map((d) => o(d)), o(rect(60, 40, 22, 30, 3)), o(line(66, 50, 76, 50), 1.5), o(line(66, 56, 74, 56), 1.5), t(bubble(48, 8, 36, 20, true)), tf(dots(58, 18)), a(circle(96, 56, 7)), o(`M 90 56 h 12`, 1.5)] },
    select: { viewBox: '0 0 120 90', paths: [o(line(10, 72, 110, 72)), o(circle(44, 56, 16)), t(circle(44, 56, 9)), o(`M 76 44 h 20 v 18 a 10 10 0 0 1 -20 0 Z`), o(`M 96 48 a 6 6 0 0 1 0 12`, 1.5), a(circle(44, 56, 3)), t(line(20, 30, 60, 30), 1.5), o(line(20, 24, 50, 24), 1.5)] },
    test: { viewBox: '0 0 120 90', paths: [o(line(12, 56, 108, 56)), o(line(60, 56, 60, 76)), ...person(34, 56, 0.85).map((d) => o(d)), ...person(86, 56, 0.85).map((d) => o(d)), t(circle(60, 48, 7)), a(rect(52, 10, 16, 20, 2)), o(line(56, 16, 64, 16), 1.5), o(line(56, 22, 62, 22), 1.5)] },
    learn: learnScene(),
  },
  generic: {
    listen: { viewBox: '0 0 120 90', paths: [...person(38, 74).map((d) => o(d)), o(circle(78, 44, 14)), o(line(88, 54, 100, 66), 2.5), t(circle(78, 44, 7)), t(bubble(44, 8, 30, 18, false)), tf(dots(52, 17)), a(circle(104, 70, 4))] },
    select: { viewBox: '0 0 120 90', paths: [o(rect(30, 16, 56, 62, 4)), o(rect(50, 10, 16, 10, 2)), o(rect(38, 30, 10, 10, 2), 1.5), o(rect(38, 46, 10, 10, 2), 1.5), t(rect(38, 62, 10, 10, 2), 2.5), o(line(54, 35, 76, 35), 1.5), o(line(54, 51, 72, 51), 1.5), t(line(54, 67, 78, 67), 2), a(circle(86, 66, 6)), o(check(81, 65), 2)] },
    test: { viewBox: '0 0 120 90', paths: [o(`M 44 14 h 20 v 24 l 16 30 a 6 6 0 0 1 -5 9 h -42 a 6 6 0 0 1 -5 -9 l 16 -30 Z`), t(`M 36 60 h 36 l 6 11 h -48 Z`), a(circle(60, 30, 3)), o(rect(84, 20, 22, 44, 3)), t(line(90, 40, 100, 40), 1.5), o(line(90, 32, 100, 32), 1.5), o(check(90, 50), 1.5)] },
    learn: learnScene(),
  },
};

export function sceneFor(family: SceneFamily, phase: PhaseId): Scene {
  return SCENES[family]?.[phase] ?? SCENES.generic[phase];
}

/** Colours for the three roles; the PDF and the web share these. */
export const SCENE_COLOURS = { outline: '#0f2440', highlight: '#2a7f8f', accent: '#d9a441' } as const;
