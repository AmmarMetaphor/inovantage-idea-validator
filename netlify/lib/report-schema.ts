/*
  Structured report format. The generator must produce exactly this shape;
  the PDF renderer and the claims ledger read from it.
*/
import { z } from 'zod';

export const VERDICTS = [
  'Feasible',
  'Feasible with conditions',
  'Uncertain, more evidence needed',
  'Unlikely as described',
  'Not feasible as described',
] as const;

export const ClaimSchema = z.object({
  section_id: z.string().min(1).max(40),
  text: z.string().min(1).max(600),
  kind: z.enum(['evidence', 'assumption', 'customer_input', 'calculation']),
  confidence: z.enum(['high', 'medium', 'low']),
  source_urls: z.array(z.string().max(500)).max(6),
});

export const SectionSchema = z.object({
  id: z.string().min(1).max(40),
  heading: z.string().min(1).max(120),
  paragraphs: z.array(z.string().max(2000)).max(12),
  bullets: z.array(z.string().max(500)).max(15),
  table: z
    .object({
      columns: z.array(z.string().max(60)).min(2).max(6),
      rows: z.array(z.array(z.string().max(200)).max(6)).max(20),
    })
    .nullable(),
});

export const ReportContentSchema = z.object({
  title: z.string().min(1).max(160),
  verdict: z.object({
    label: z.enum(VERDICTS),
    rationale: z.string().min(1).max(1500),
  }),
  summary_bullets: z.array(z.string().max(400)).min(3).max(8),
  sections: z.array(SectionSchema).min(5).max(12),
  claims: z.array(ClaimSchema).max(80),
  next_steps: z.array(z.string().max(400)).min(3).max(10),
  assumptions: z.array(z.string().max(400)).max(20),
  limitations: z.string().max(1500),
});

export type ReportContent = z.infer<typeof ReportContentSchema>;
export type ReportClaimOut = z.infer<typeof ClaimSchema>;

export const DISCLAIMER =
  'This report is desk research and general guidance for one idea in one primary market. It is not financial, legal, tax or investment advice, and it does not guarantee any outcome. Figures marked as assumptions were not verified.';
