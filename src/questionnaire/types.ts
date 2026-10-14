import type { ReactNode } from 'react';

/** An estimate the customer may not know yet. */
export interface Estimate {
  value: string;
  unknown: boolean;
}

export type AnswerValue = string | string[] | boolean | Estimate;

export type Answers = Record<string, AnswerValue | undefined>;

export interface Option {
  value: string;
  label: string;
  hint?: string;
}

interface FieldBase {
  id: string;
  label: string;
  /** Short helper text under the label. */
  help?: ReactNode;
  required?: boolean;
  /** Only render (and validate) when this returns true. */
  showIf?: (answers: Answers) => boolean;
  /** Optional sub-section heading rendered before this field. */
  sectionHeading?: string;
  sectionIntro?: string;
}

export interface TextField extends FieldBase {
  type: 'text';
  placeholder?: string;
  maxLength?: number;
  autoComplete?: string;
}

export interface EmailField extends FieldBase {
  type: 'email';
  placeholder?: string;
}

export interface TextareaField extends FieldBase {
  type: 'textarea';
  placeholder?: string;
  maxLength?: number;
  rows?: number;
}

export interface SelectField extends FieldBase {
  type: 'select';
  options: Option[];
  placeholder?: string;
}

export interface RadioField extends FieldBase {
  type: 'radio';
  options: Option[];
}

export interface CheckboxGroupField extends FieldBase {
  type: 'checkbox-group';
  options: Option[];
  /** Minimum selections when required (default 1). */
  min?: number;
}

export interface CheckboxField extends FieldBase {
  type: 'checkbox';
  /** Text shown next to the box (label is used as the accessible name). */
  statement: ReactNode;
}

export interface EstimateField extends FieldBase {
  type: 'estimate';
  /** 'currency' uses the chosen currency symbol; 'count' is a plain number. */
  unit: 'currency' | 'count' | 'hours';
  /** Suffix such as "per month". */
  suffix?: string;
  placeholder?: string;
  /** Allow "I don't know yet". Defaults to true. */
  allowUnknown?: boolean;
  min?: number;
  max?: number;
}

export type Field =
  | TextField
  | EmailField
  | TextareaField
  | SelectField
  | RadioField
  | CheckboxGroupField
  | CheckboxField
  | EstimateField;

export interface Step {
  id: string;
  /** Short label for the stepper. */
  shortTitle: string;
  title: string;
  intro: string;
  fields: Field[];
}

export type StepErrors = Record<string, string>;
