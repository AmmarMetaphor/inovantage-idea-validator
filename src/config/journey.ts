/*
  The illustrated four-week journey: phases, scene families and original
  flat-style illustrations shared by the web report (inline SVG) and the PDF
  (vector paths).

  - Four fixed phases: Listen, Select, Test, Learn. The plan text (action,
    measure, detail) is generated per report and validated server-side; the
    artwork is chosen here from validated business metadata (industry and
    revenue model), never from model output.
  - Every scene is a list of path commands in a 120 × 90 box. Each path has
    an optional fill and an optional stroke drawn from a small vetted palette
    (navy outlines, teal highlights, amber accents, cream/mint surfaces,
    skin tone, a soft shadow). No raster images, no external assets, no
    model-generated markup.
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
export const PLAN_EYEBROW = 'Inovantage / Your next move';
export const PLAN_CAVEAT = 'Suggested plan. No outcome is guaranteed.';
export const PLAN_TIMING = 'A four-week period is a suggested starting point, not a launch schedule; adapt the timing to your circumstances.';

export const SCENE_FAMILIES = ['retail', 'software', 'services', 'hospitality', 'generic'] as const;
export type SceneFamily = (typeof SCENE_FAMILIES)[number];

/** Human labels for the scene families (used in alt text). */
export const SCENE_LABELS: Record<SceneFamily, Record<PhaseId, string>> = {
  retail: { listen: 'Two people talking about what is missing from local shops', select: 'A basket of chosen products beside a calculator', test: 'A small market stall with a customer', learn: 'A results chart on a screen with a person choosing the next step' },
  software: { listen: 'A user interview with a phone and a laptop', select: 'A sketched prototype screen with a pencil', test: 'A usability test on a laptop with a checklist', learn: 'A results chart on a screen with a person choosing the next step' },
  services: { listen: 'A discovery conversation across a table with a notepad', select: 'A one-page service sheet with a price tag', test: 'A pilot agreement sealed with a handshake and a calendar', learn: 'A results chart on a screen with a person choosing the next step' },
  hospitality: { listen: 'A host with a tray asking a guest about their preferences', select: 'A short menu card beside a cup', test: 'A small pop-up table with two guests', learn: 'A results chart on a screen with a person choosing the next step' },
  generic: { listen: 'A person listening with a magnifying glass over the problem', select: 'A clipboard with one option ticked', test: 'A small controlled test with a flask and a checklist', learn: 'A results chart on a screen with a person choosing the next step' },
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
   Palette and path model
--------------------------------------------------------------------------- */

export const SCENE_FILLS = ['navy', 'teal', 'amber', 'cream', 'mint', 'skin', 'white', 'shadow'] as const;
export const SCENE_STROKES = ['navy', 'teal', 'amber'] as const;
export type SceneFill = (typeof SCENE_FILLS)[number];
export type SceneStroke = (typeof SCENE_STROKES)[number];
export interface ScenePath { d: string; fill?: SceneFill; stroke?: SceneStroke; width?: number }
export interface Scene { viewBox: string; paths: ScenePath[] }

/** The illustration palette; the PDF uses these hex values and the web the matching tokens. */
export const SCENE_COLOURS: Record<SceneFill, string> = {
  navy: '#0f2440',
  teal: '#1f7f7a',
  amber: '#c8923a',
  cream: '#fbf1d8',
  mint: '#e3f1ee',
  skin: '#f2c9a4',
  white: '#ffffff',
  shadow: '#e4ebe9',
};
/** The dotted path between milestones. */
export const PATH_COLOUR = '#bfd9d5';

/* ---------------------------------------------------------------------------
   Geometry helpers (120 × 90 box)
--------------------------------------------------------------------------- */

const st = (d: string, stroke: SceneStroke = 'navy', width = 2): ScenePath => ({ d, stroke, width });
const fl = (d: string, fill: SceneFill): ScenePath => ({ d, fill });
const fs = (d: string, fill: SceneFill, width = 1.6, stroke: SceneStroke = 'navy'): ScenePath => ({ d, fill, stroke, width });

const circle = (cx: number, cy: number, r: number) => `M ${cx - r} ${cy} a ${r} ${r} 0 1 0 ${2 * r} 0 a ${r} ${r} 0 1 0 ${-2 * r} 0 Z`;
const ellipse = (cx: number, cy: number, rx: number, ry: number) => `M ${cx - rx} ${cy} a ${rx} ${ry} 0 1 0 ${2 * rx} 0 a ${rx} ${ry} 0 1 0 ${-2 * rx} 0 Z`;
const rect = (x: number, y: number, w: number, h: number, r = 3) => `M ${x + r} ${y} h ${w - 2 * r} a ${r} ${r} 0 0 1 ${r} ${r} v ${h - 2 * r} a ${r} ${r} 0 0 1 ${-r} ${r} h ${-(w - 2 * r)} a ${r} ${r} 0 0 1 ${-r} ${-r} v ${-(h - 2 * r)} a ${r} ${r} 0 0 1 ${r} ${-r} Z`;
const line = (x1: number, y1: number, x2: number, y2: number) => `M ${x1} ${y1} L ${x2} ${y2}`;
/** Soft ground shadow under a scene. */
const shadow = (cx = 60, cy = 83, rx = 46): ScenePath => fl(ellipse(cx, cy, rx, 5), 'shadow');
/** Speech bubble with its tail at the bottom-left or bottom-right. */
const bubble = (x: number, y: number, w: number, h: number, fill: SceneFill, tailLeft = true): ScenePath =>
  fs(`${rect(x, y, w, h, 4)} M ${tailLeft ? x + 9 : x + w - 9} ${y + h} l ${tailLeft ? -4 : 4} 5 l ${tailLeft ? 8 : -8} -5 Z`, fill, 1.5);
const bubbleLines = (x: number, y: number, w: number): ScenePath => st(`M ${x} ${y} h ${w} M ${x} ${y + 5} h ${w * 0.65}`, 'teal', 1.6);
const bubbleDots = (x: number, y: number): ScenePath => fl([circle(x, y, 1.7), circle(x + 7, y, 1.7), circle(x + 14, y, 1.7)].join(' '), 'amber');
/** Amber tick in a white circle. */
const tick = (cx: number, cy: number): ScenePath[] => [fs(circle(cx, cy, 8), 'white', 2, 'amber'), st(`M ${cx - 4} ${cy} l 3 3 l 6 -7`, 'amber', 2)];
const check = (x: number, y: number, stroke: SceneStroke = 'teal'): ScenePath => st(`M ${x} ${y} l 3 3 l 6 -7`, stroke, 1.6);

interface FigureOpts { s?: number; armL?: [number, number]; armR?: [number, number] }
/** A standing character: legs, shirt (teal or amber), arms, head with navy hair. ~46 units tall at scale 1. */
function figure(cx: number, base: number, shirt: 'teal' | 'amber', o: FigureOpts = {}): ScenePath[] {
  const s = o.s ?? 1;
  const hip = base - 16 * s;
  const sh = base - 32 * s;
  const r = 6.5 * s;
  const headY = sh - 9 * s;
  const armL = o.armL ?? [-5, 15];
  const armR = o.armR ?? [5, 15];
  return [
    st(`M ${cx - 4 * s} ${hip} L ${cx - 5 * s} ${base} M ${cx + 4 * s} ${hip} L ${cx + 5 * s} ${base}`, 'navy', 2.4 * s),
    fs(`M ${cx - 8 * s} ${sh + 3 * s} q 0 -3 3 -3 h ${10 * s} q 3 0 3 3 l ${1.5 * s} ${13.5 * s} h ${-19 * s} Z`, shirt, 1.6),
    st(`M ${cx - 7 * s} ${sh + 4 * s} l ${armL[0] * s} ${armL[1] * s} M ${cx + 7 * s} ${sh + 4 * s} l ${armR[0] * s} ${armR[1] * s}`, 'navy', 2.2 * s),
    st(`M ${cx} ${sh + 1} v -4`, 'navy', 2.2 * s),
    fs(circle(cx, headY, r), 'skin', 1.4),
    fl(`M ${cx - r * 0.97} ${headY - 1.2 * s} a ${r} ${r} 0 0 1 ${2 * r * 0.97} 0 Z`, 'navy'),
  ];
}

const V = '0 0 120 90';

/* ---------------------------------------------------------------------------
   Scenes
--------------------------------------------------------------------------- */

/** Week 4 is the same decision scene for every family: a results chart and a person choosing the next move. */
function learnScene(): Scene {
  return {
    viewBox: V,
    paths: [
      shadow(),
      fs(rect(8, 20, 60, 42, 3), 'white', 2),
      st('M 38 62 v 8 M 26 70 h 24', 'navy', 2),
      st(line(16, 54, 60, 54), 'navy', 1.5),
      fl(rect(20, 40, 8, 14, 1), 'teal'),
      fl(rect(32, 30, 8, 24, 1), 'amber'),
      fl(rect(44, 44, 8, 10, 1), 'teal'),
      fs(rect(78, 66, 32, 8, 2), 'mint', 1.5),
      st(line(84, 70, 104, 70), 'teal', 1.4),
      ...figure(94, 66, 'teal', { s: 0.92, armL: [-9, -6], armR: [9, -9] }),
      st('M 104 24 h 11 M 111 20 l 4 4 l -4 4 M 102 30 h 11 M 106 26 l -4 4 l 4 4', 'amber', 2),
    ],
  };
}

const SCENES: Record<SceneFamily, Record<PhaseId, Scene>> = {
  retail: {
    listen: { viewBox: V, paths: [
      shadow(),
      bubble(14, 8, 36, 18, 'mint', false), bubbleLines(21, 15, 22),
      bubble(68, 10, 34, 18, 'cream', true), bubbleDots(78, 19),
      ...figure(34, 78, 'teal', { armR: [12, -5] }),
      ...figure(88, 78, 'amber', { armL: [-12, -5] }),
      fs(rect(50, 40, 11, 13, 1.5), 'white', 1.4), st('M 53 45 h 5 M 53 49 h 4', 'teal', 1.3),
    ] },
    select: { viewBox: V, paths: [
      shadow(), st(line(12, 75, 108, 75), 'navy', 2),
      st('M 18 34 q 10 -16 26 -12', 'amber', 1.8),
      fs(rect(28, 30, 11, 16, 2), 'amber', 1.4), fs(rect(42, 24, 12, 22, 2), 'white', 1.4), st('M 45 30 h 6 M 45 35 h 5', 'teal', 1.3),
      fs('M 20 46 h 44 l -4 29 h -36 Z', 'mint', 2), st(line(18, 46, 66, 46), 'navy', 2),
      fs(rect(74, 34, 30, 41, 3), 'white', 2), fs(rect(79, 39, 20, 9, 1.5), 'mint', 1.2),
      fl([80, 87, 94].flatMap((x) => [54, 61, 68].map((y) => circle(x, y, 1.6))).join(' '), 'navy'),
      ...tick(104, 20),
    ] },
    test: { viewBox: V, paths: [
      shadow(),
      fs('M 8 30 h 74 l 4 12 h -82 Z', 'white', 2),
      fl('M 16 30 h 8 l 1 12 h -10 Z M 32 30 h 8 l 1 12 h -10 Z M 48 30 h 8 l 1 12 h -10 Z M 64 30 h 8 l 1 12 h -10 Z', 'teal'),
      st('M 4 42 a 4 4 0 0 0 8 0 a 4 4 0 0 0 8 0 a 4 4 0 0 0 8 0 a 4 4 0 0 0 8 0 a 4 4 0 0 0 8 0 a 4 4 0 0 0 8 0 a 4 4 0 0 0 8 0 a 4 4 0 0 0 8 0 a 4 4 0 0 0 8 0 a 4 4 0 0 0 8 0', 'navy', 1.3),
      st('M 12 42 v 16 M 78 42 v 16', 'navy', 2),
      fs(rect(16, 46, 12, 12, 1.5), 'amber', 1.4), fs(rect(34, 48, 10, 10, 1.5), 'white', 1.4), fs(rect(56, 44, 14, 14, 1.5), 'mint', 1.4), st('M 59 49 h 8 M 59 53 h 6', 'teal', 1.3),
      fs(rect(8, 58, 74, 20, 2), 'teal', 2), st(line(16, 68, 42, 68), 'navy', 1.2),
      ...figure(102, 78, 'amber', { s: 0.9, armL: [-11, -3] }),
      fs(rect(86, 54, 8, 10, 1), 'white', 1.3),
    ] },
    learn: learnScene(),
  },
  software: {
    listen: { viewBox: V, paths: [
      shadow(),
      bubble(14, 8, 30, 16, 'cream', false), bubbleDots(22, 16),
      bubble(52, 6, 38, 18, 'mint', true), bubbleLines(59, 13, 24),
      ...figure(38, 78, 'teal', { armR: [9, -12] }),
      fs(rect(45, 36, 9, 16, 2), 'white', 1.4), fl(rect(47, 39, 5, 9, 1), 'mint'),
      fs(rect(70, 50, 36, 24, 2), 'white', 2), st('M 64 74 h 48', 'navy', 2),
      fl(rect(76, 56, 14, 4, 1), 'teal'), st('M 76 65 h 24', 'teal', 1.5),
    ] },
    select: { viewBox: V, paths: [
      shadow(),
      fs(rect(14, 14, 76, 54, 3), 'white', 2), st('M 52 68 v 8 M 40 76 h 24', 'navy', 2),
      fl(rect(20, 20, 30, 8, 2), 'teal'),
      fs(rect(20, 34, 26, 26, 2), 'mint', 1.2), fs(rect(52, 34, 32, 6, 1.5), 'cream', 1.2), fs(rect(52, 44, 24, 6, 1.5), 'cream', 1.2), fl(rect(52, 54, 18, 7, 2), 'amber'),
      st('M 98 62 l 12 -32', 'amber', 3), fl('M 98 62 l -2 7 l 6 -4 Z', 'navy'),
      ...tick(104, 20),
    ] },
    test: { viewBox: V, paths: [
      shadow(),
      fs(rect(18, 24, 60, 40, 3), 'white', 2), fs('M 10 64 h 76 l -3 7 h -70 Z', 'mint', 1.8),
      fl(rect(24, 30, 48, 28, 2), 'mint'), fl(rect(30, 36, 22, 8, 2), 'teal'), fl(rect(30, 48, 16, 6, 1.5), 'cream'),
      fl('M 56 44 l 10 9 l -4 1 l 2 5 l -3 1 l -2 -5 l -3 3 Z', 'navy'),
      fs(rect(88, 14, 20, 26, 2), 'white', 1.5), check(92, 22), check(92, 31),
      ...figure(102, 78, 'amber', { s: 0.88, armL: [-10, -8] }),
    ] },
    learn: learnScene(),
  },
  services: {
    listen: { viewBox: V, paths: [
      shadow(),
      bubble(38, 6, 34, 16, 'mint', true), bubbleLines(45, 13, 20),
      bubble(78, 12, 24, 14, 'cream', true), bubbleDots(83, 19),
      fs(rect(30, 56, 60, 6, 2), 'mint', 1.6), st('M 36 62 v 14 M 84 62 v 14', 'navy', 2),
      fs(rect(50, 46, 20, 11, 1.5), 'white', 1.4), st('M 54 50 h 12 M 54 54 h 8', 'teal', 1.3),
      ...figure(20, 78, 'teal', { s: 0.9, armR: [10, -2] }),
      ...figure(100, 78, 'amber', { s: 0.9, armL: [-10, -2] }),
    ] },
    select: { viewBox: V, paths: [
      shadow(),
      fs(rect(28, 10, 52, 66, 4), 'white', 2), fl(rect(34, 18, 28, 7, 2), 'teal'),
      st('M 34 34 h 38 M 34 42 h 32 M 34 50 h 36', 'navy', 1.4), fs(rect(34, 58, 40, 8, 2), 'mint', 1.2, 'teal'),
      fs('M 84 40 h 22 l 6 7 l -6 7 h -22 Z', 'amber', 1.6), fl(circle(103, 47, 1.7), 'white'),
      ...tick(18, 24),
    ] },
    test: { viewBox: V, paths: [
      shadow(),
      fs(rect(44, 8, 32, 26, 3), 'white', 1.8), fl('M 47 8 h 26 a 3 3 0 0 1 3 3 v 4 h -32 v -4 a 3 3 0 0 1 3 -3 Z', 'teal'),
      fl([circle(51, 22, 1.3), circle(60, 22, 1.3), circle(69, 22, 1.3), circle(51, 29, 1.3), circle(60, 29, 1.3)].join(' '), 'navy'), fl(circle(69, 29, 3.4), 'amber'),
      ...figure(30, 78, 'teal', { armR: [18, -2] }),
      ...figure(90, 78, 'amber', { armL: [-18, -2] }),
      fs(circle(60, 49, 3.2), 'skin', 1.2),
    ] },
    learn: learnScene(),
  },
  hospitality: {
    listen: { viewBox: V, paths: [
      shadow(),
      bubble(12, 8, 34, 16, 'mint', false), bubbleLines(19, 15, 20),
      bubble(62, 10, 30, 16, 'cream', true), bubbleDots(70, 18),
      ...figure(32, 78, 'teal', { armR: [12, -8] }),
      st('M 42 46 h 22', 'navy', 2), fs(rect(48, 38, 10, 8, 1.5), 'white', 1.4), st('M 58 40 a 3 3 0 0 1 0 5', 'navy', 1.2),
      ...figure(92, 78, 'amber', { s: 0.9, armL: [-8, -6] }),
    ] },
    select: { viewBox: V, paths: [
      shadow(),
      fs(rect(16, 14, 40, 56, 3), 'cream', 2), fl(rect(22, 20, 20, 5, 1.5), 'teal'),
      st('M 22 32 h 26 M 22 40 h 22 M 22 48 h 26', 'navy', 1.3), fl(circle(46, 60, 5), 'amber'),
      fs('M 68 44 h 26 v 18 a 13 13 0 0 1 -26 0 Z', 'white', 2), st('M 94 48 a 7 7 0 0 1 0 12', 'navy', 2), st('M 62 76 h 38', 'navy', 2),
      st('M 74 36 q 3 -4 0 -8 M 82 36 q 3 -4 0 -8', 'teal', 1.5),
      ...tick(104, 20),
    ] },
    test: { viewBox: V, paths: [
      shadow(),
      fs('M 28 20 l 32 -12 l 32 12 Z', 'teal', 1.8), st('M 24 20 a 4 4 0 0 0 8 0 a 4 4 0 0 0 8 0 a 4 4 0 0 0 8 0 a 4 4 0 0 0 8 0 a 4 4 0 0 0 8 0 a 4 4 0 0 0 8 0 a 4 4 0 0 0 8 0 a 4 4 0 0 0 8 0 a 4 4 0 0 0 8 0', 'navy', 1.3),
      fs(rect(50, 26, 20, 10, 2), 'cream', 1.4), st('M 54 31 h 12', 'amber', 1.6),
      fs(ellipse(60, 58, 26, 6), 'white', 2), st('M 60 64 v 12 M 48 76 h 24', 'navy', 2),
      fs(rect(54, 46, 10, 8, 1.5), 'white', 1.4), st('M 64 48 a 3 3 0 0 1 0 5', 'navy', 1.2),
      ...figure(20, 78, 'teal', { s: 0.9, armR: [10, -4] }),
      ...figure(100, 78, 'amber', { s: 0.9, armL: [-10, -4] }),
    ] },
    learn: learnScene(),
  },
  generic: {
    listen: { viewBox: V, paths: [
      shadow(),
      bubble(8, 8, 34, 16, 'mint', false), bubbleLines(15, 15, 20),
      bubble(76, 8, 32, 16, 'cream', true), bubbleDots(84, 16),
      ...figure(40, 78, 'teal', { armR: [12, -10] }),
      fs(circle(72, 46, 12), 'mint', 2), st('M 81 55 l 13 13', 'navy', 3.2),
      st('M 66 44 h 12 M 68 49 h 8', 'teal', 1.5),
    ] },
    select: { viewBox: V, paths: [
      shadow(),
      fs(rect(32, 14, 56, 62, 4), 'white', 2), fs(rect(50, 8, 20, 10, 2), 'teal', 1.6),
      fs(rect(40, 28, 9, 9, 2), 'white', 1.4), fs(rect(40, 44, 9, 9, 2), 'white', 1.4), fs(rect(40, 60, 9, 9, 2), 'teal', 1.4), st('M 42 64 l 2 2 l 4 -5', 'navy', 1.4),
      st('M 54 33 h 24 M 54 49 h 20', 'navy', 1.4), st('M 54 65 h 26', 'teal', 2),
      ...tick(100, 24),
    ] },
    test: { viewBox: V, paths: [
      shadow(),
      fs('M 46 14 h 24 v 22 l 16 30 a 6 6 0 0 1 -5 9 h -46 a 6 6 0 0 1 -5 -9 l 16 -30 Z', 'white', 2),
      fl('M 38 58 h 40 l 7 13 a 2 2 0 0 1 -2 3 h -50 a 2 2 0 0 1 -2 -3 Z', 'teal'),
      fl([circle(54, 50, 2), circle(62, 44, 1.6)].join(' '), 'amber'),
      fs(rect(88, 22, 22, 40, 2), 'white', 1.6), check(92, 32), check(92, 44), st('M 92 54 h 14', 'navy', 1.3),
    ] },
    learn: learnScene(),
  },
};

export function sceneFor(family: SceneFamily, phase: PhaseId): Scene {
  return SCENES[family]?.[phase] ?? SCENES.generic[phase];
}
