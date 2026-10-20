/*
  ILLUSTRATIVE HOMEPAGE EXAMPLES. Three invented businesses, one per
  selectable type, used only to show what a report looks like. Nothing here
  is research: no statistics, no sources, no promised scores. The sample
  score shown beside them is fixed and labelled illustrative. Selecting an
  example changes only local state; it never calls an API.
*/
import type { SceneFamily } from '@/config/journey';

export type HeroExampleId = 'product' | 'service' | 'software';

export interface HeroCustomer { who: string; label: string; need: string; tone: 'teal' | 'amber' | 'navy' }
export interface HeroExample {
  id: HeroExampleId;
  label: string;
  name: string;
  summary: string;
  family: SceneFamily;
  /** One sentence naming the opportunity a report would investigate. */
  opportunity: string;
  /** Decorative bar heights (0–100) for the illustrative chart; not data. */
  bars: number[];
  customers: [HeroCustomer, HeroCustomer, HeroCustomer];
  nextSteps: [string, string, string];
  /** One or two words per step for the compact homepage panel. */
  stepsShort: [string, string, string];
  /** One short action per week: Listen, Select, Test, Learn. */
  weeks: [string, string, string, string];
}

export const HERO_EXAMPLES: Record<HeroExampleId, HeroExample> = {
  product: {
    id: 'product',
    label: 'Product',
    name: 'Desi Pantry, Bradford',
    summary: 'A small shop and online store for Pakistani groceries and homeware (fictional).',
    family: 'retail',
    opportunity: 'Brands that Bradford families currently drive to Manchester for, and what they would pay to buy them locally.',
    bars: [38, 52, 46, 68, 74],
    customers: [
      { who: 'Families', label: 'Families', need: 'Travel for specific brands they cannot find nearby.', tone: 'teal' },
      { who: 'Students', label: 'Students', need: 'Want familiar staples within walking distance.', tone: 'amber' },
      { who: 'Caterers', label: 'Caterers', need: 'Need spices and rice in bulk at a reliable price.', tone: 'navy' },
    ],
    nextSteps: ['Validate demand with twelve household conversations', 'Refine the offer to fifteen products at one price', 'Plan a Saturday stall with a pre-order list'],
    stepsShort: ['Listen', 'Test', 'Refine'],
    weeks: ['Ask twelve households which brands they cannot buy locally.', 'Choose fifteen products and set one shelf price.', 'Run a Saturday stall with a pre-order list.', 'Compare pre-orders with the threshold and decide.'],
  },
  service: {
    id: 'service',
    label: 'Service',
    name: 'Northside Mobile Dog Grooming',
    summary: 'Van-based grooming at the owner’s home in north Leeds (fictional).',
    family: 'services',
    opportunity: 'Owners of anxious or large dogs who avoid salons, and whether convenience earns a price premium.',
    bars: [44, 40, 62, 58, 70],
    customers: [
      { who: 'Anxious-dog owners', label: 'Anxious dogs', need: 'Dread the salon trip and the wait.', tone: 'teal' },
      { who: 'Large-breed owners', label: 'Large breeds', need: 'Struggle to lift and transport the dog.', tone: 'amber' },
      { who: 'Busy households', label: 'Busy homes', need: 'Would pay for grooming that comes to them.', tone: 'navy' },
    ],
    nextSteps: ['Validate demand with ten owner conversations', 'Refine one package at one price', 'Plan twenty deposit-backed trial grooms'],
    stepsShort: ['Listen', 'Pilot', 'Refine'],
    weeks: ['Talk to ten owners of anxious or large dogs about their last groom.', 'Choose one package and one price to test.', 'Offer twenty discounted grooms from a hired van, with deposits.', 'Compare deposits with the threshold and decide.'],
  },
  software: {
    id: 'software',
    label: 'Software',
    name: 'ChairTime',
    summary: 'A scheduling app that fills last-minute cancellations for small dental practices (fictional).',
    family: 'software',
    opportunity: 'How practice managers fill cancelled slots today, and whether a waitlist tool is worth a monthly fee.',
    bars: [30, 48, 56, 66, 72],
    customers: [
      { who: 'Practice managers', label: 'Managers', need: 'Lose chair time every week to late cancellations.', tone: 'teal' },
      { who: 'Dentists', label: 'Dentists', need: 'Want the diary full without extra admin.', tone: 'amber' },
      { who: 'Patients', label: 'Patients', need: 'Would take an earlier slot if offered quickly.', tone: 'navy' },
    ],
    nextSteps: ['Validate the pain with eight manager interviews', 'Refine a three-screen prototype', 'Plan five usability sessions with a paid pilot ask'],
    stepsShort: ['Listen', 'Prototype', 'Refine'],
    weeks: ['Interview eight practice managers about cancellations.', 'Sketch a three-screen prototype and one price.', 'Run five usability sessions and ask for a paid pilot.', 'Compare pilot commitments with the threshold and decide.'],
  },
};

export const HERO_EXAMPLE_ORDER: HeroExampleId[] = ['product', 'service', 'software'];
