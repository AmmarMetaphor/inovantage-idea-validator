import { useId, type ReactNode } from 'react';
import { currencySymbol } from '@/config/product';
import { asArray, asBool, asEstimate, asString } from '@/questionnaire/helpers';
import type { Answers, AnswerValue, Field } from '@/questionnaire/types';

/* ---------------------------------------------------------------------------
   Field wrapper: label, help, error, with ARIA wiring
--------------------------------------------------------------------------- */

interface FieldShellProps {
  id: string;
  label: string;
  help?: ReactNode;
  error?: string;
  required?: boolean;
  /** Use fieldset/legend for grouped controls. */
  group?: boolean;
  children: ReactNode;
  counter?: ReactNode;
}

export function FieldShell({ id, label, help, error, required, group, children, counter }: FieldShellProps) {
  const helpId = `${id}-help`;
  const errorId = `${id}-error`;
  const labelContent = (
    <>
      {label}
      {!required && <span className="field__optional"> (optional)</span>}
    </>
  );

  const inner = (
    <>
      {help && (
        <p id={helpId} className="field__help">
          {help}
        </p>
      )}
      {children}
      <div className="field__foot">
        {error ? (
          <p id={errorId} className="field__error" role="alert">
            {error}
          </p>
        ) : (
          <span />
        )}
        {counter}
      </div>
    </>
  );

  if (group) {
    return (
      <fieldset
        className={`field ${error ? 'field--invalid' : ''}`}
        aria-describedby={[help ? helpId : '', error ? errorId : ''].filter(Boolean).join(' ') || undefined}
      >
        <legend className="field__label">{labelContent}</legend>
        {inner}
      </fieldset>
    );
  }

  return (
    <div className={`field ${error ? 'field--invalid' : ''}`}>
      <label htmlFor={id} className="field__label">
        {labelContent}
      </label>
      {inner}
    </div>
  );
}

export function describedBy(id: string, help?: ReactNode, error?: string) {
  const ids = [help ? `${id}-help` : '', error ? `${id}-error` : ''].filter(Boolean);
  return ids.length ? ids.join(' ') : undefined;
}

/* ---------------------------------------------------------------------------
   Schema-driven renderer
--------------------------------------------------------------------------- */

interface FieldRendererProps {
  field: Field;
  answers: Answers;
  error?: string;
  onChange: (id: string, value: AnswerValue | undefined) => void;
}

export function FieldRenderer({ field, answers, error, onChange }: FieldRendererProps) {
  const value = answers[field.id];
  const aria = describedBy(field.id, field.help, error);
  const invalid = error ? true : undefined;

  switch (field.type) {
    case 'text': {
      const s = asString(value);
      return (
        <FieldShell
          id={field.id}
          label={field.label}
          help={field.help}
          error={error}
          required={field.required}
          counter={field.maxLength ? <Counter length={s.length} max={field.maxLength} /> : undefined}
        >
          <input
            id={field.id}
            name={field.id}
            type="text"
            className="input"
            value={s}
            maxLength={field.maxLength}
            placeholder={field.placeholder}
            autoComplete={field.autoComplete ?? 'off'}
            aria-describedby={aria}
            aria-invalid={invalid}
            aria-required={field.required || undefined}
            onChange={(e) => onChange(field.id, e.target.value)}
          />
        </FieldShell>
      );
    }
    case 'email': {
      const s = asString(value);
      return (
        <FieldShell id={field.id} label={field.label} help={field.help} error={error} required={field.required}>
          <input
            id={field.id}
            name={field.id}
            type="email"
            inputMode="email"
            className="input"
            value={s}
            placeholder={field.placeholder}
            autoComplete="email"
            spellCheck={false}
            aria-describedby={aria}
            aria-invalid={invalid}
            aria-required={field.required || undefined}
            onChange={(e) => onChange(field.id, e.target.value)}
          />
        </FieldShell>
      );
    }
    case 'textarea': {
      const s = asString(value);
      return (
        <FieldShell
          id={field.id}
          label={field.label}
          help={field.help}
          error={error}
          required={field.required}
          counter={field.maxLength ? <Counter length={s.length} max={field.maxLength} /> : undefined}
        >
          <textarea
            id={field.id}
            name={field.id}
            className="input input--textarea"
            value={s}
            rows={field.rows ?? 4}
            maxLength={field.maxLength}
            placeholder={field.placeholder}
            aria-describedby={aria}
            aria-invalid={invalid}
            aria-required={field.required || undefined}
            onChange={(e) => onChange(field.id, e.target.value)}
          />
        </FieldShell>
      );
    }
    case 'select': {
      const s = asString(value);
      return (
        <FieldShell id={field.id} label={field.label} help={field.help} error={error} required={field.required}>
          <div className="select-wrap">
            <select
              id={field.id}
              name={field.id}
              className="input input--select"
              value={s}
              aria-describedby={aria}
              aria-invalid={invalid}
              aria-required={field.required || undefined}
              onChange={(e) => onChange(field.id, e.target.value)}
            >
              <option value="">{field.placeholder ?? 'Choose one'}</option>
              {field.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </FieldShell>
      );
    }
    case 'combobox': {
      const s = asString(value);
      const listId = `${field.id}-options`;
      const matched = field.options.find((o) => o.value === s || o.label === s);
      return (
        <FieldShell id={field.id} label={field.label} help={field.help} error={error} required={field.required}>
          <input
            id={field.id}
            name={field.id}
            type="text"
            className="input"
            list={listId}
            value={matched ? matched.label : s}
            maxLength={field.maxLength ?? 80}
            placeholder={field.placeholder}
            autoComplete="off"
            aria-describedby={aria}
            aria-invalid={invalid}
            aria-required={field.required || undefined}
            onChange={(e) => {
              const typed = e.target.value;
              const opt = field.options.find((o) => o.label === typed);
              onChange(field.id, opt && opt.value !== 'other' ? opt.value : typed);
            }}
          />
          <datalist id={listId}>
            {field.options.filter((o) => o.value !== 'other').map((o) => (
              <option key={o.value} value={o.label} />
            ))}
          </datalist>
          {s && !matched && <p className="field__hint">Using your own industry: “{s}”.</p>}
        </FieldShell>
      );
    }
    case 'radio': {
      const s = asString(value);
      return (
        <FieldShell id={field.id} label={field.label} help={field.help} error={error} required={field.required} group>
          <div className="choice-list">
            {field.options.map((o) => {
              const optionId = `${field.id}-${o.value}`;
              return (
                <label key={o.value} htmlFor={optionId} className={`choice ${s === o.value ? 'choice--checked' : ''}`}>
                  <input
                    id={optionId}
                    type="radio"
                    name={field.id}
                    value={o.value}
                    checked={s === o.value}
                    aria-invalid={invalid}
                    onChange={() => onChange(field.id, o.value)}
                  />
                  <span className="choice__text">
                    <span className="choice__label">{o.label}</span>
                    {o.hint && <span className="choice__hint">{o.hint}</span>}
                  </span>
                </label>
              );
            })}
          </div>
        </FieldShell>
      );
    }
    case 'checkbox-group': {
      const arr = asArray(value);
      const toggle = (v: string) => {
        const next = arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];
        onChange(field.id, next);
      };
      return (
        <FieldShell id={field.id} label={field.label} help={field.help} error={error} required={field.required} group>
          <div className="choice-list choice-list--compact">
            {field.options.map((o) => {
              const optionId = `${field.id}-${o.value}`;
              const checked = arr.includes(o.value);
              return (
                <label key={o.value} htmlFor={optionId} className={`choice ${checked ? 'choice--checked' : ''}`}>
                  <input
                    id={optionId}
                    type="checkbox"
                    name={field.id}
                    value={o.value}
                    checked={checked}
                    aria-invalid={invalid}
                    onChange={() => toggle(o.value)}
                  />
                  <span className="choice__text">
                    <span className="choice__label">{o.label}</span>
                    {o.hint && <span className="choice__hint">{o.hint}</span>}
                  </span>
                </label>
              );
            })}
          </div>
        </FieldShell>
      );
    }
    case 'checkbox': {
      const checked = asBool(value);
      return (
        <div className={`field field--checkbox ${error ? 'field--invalid' : ''}`}>
          <label htmlFor={field.id} className={`choice choice--statement ${checked ? 'choice--checked' : ''}`}>
            <input
              id={field.id}
              type="checkbox"
              name={field.id}
              checked={checked}
              aria-describedby={error ? `${field.id}-error` : undefined}
              aria-invalid={invalid}
              aria-required={field.required || undefined}
              onChange={(e) => onChange(field.id, e.target.checked)}
            />
            <span className="choice__text">
              <span className="visually-hidden">{field.label}. </span>
              <span className="choice__label choice__label--normal">{field.statement}</span>
            </span>
          </label>
          {error && (
            <p id={`${field.id}-error`} className="field__error" role="alert">
              {error}
            </p>
          )}
        </div>
      );
    }
    case 'estimate': {
      const est = asEstimate(value);
      const allowUnknown = field.allowUnknown !== false;
      const symbol = field.unit === 'currency' ? currencySymbol(asString(answers.currency)) || '£' : '';
      return (
        <EstimateInput
          id={field.id}
          label={field.label}
          help={field.help}
          error={error}
          required={field.required}
          symbol={symbol}
          unit={field.unit}
          suffix={field.suffix}
          placeholder={field.placeholder}
          allowUnknown={allowUnknown}
          unknownLabel={field.unknownLabel ?? 'I don’t know yet'}
          value={est.value}
          unknown={est.unknown}
          onChange={(next) => onChange(field.id, next)}
        />
      );
    }
  }
}

/* ---------------------------------------------------------------------------
   Pieces
--------------------------------------------------------------------------- */

function Counter({ length, max }: { length: number; max: number }) {
  const near = length > max * 0.9;
  return (
    <span className={`field__counter ${near ? 'field__counter--near' : ''}`} aria-live="polite">
      {length}/{max}
    </span>
  );
}

interface EstimateInputProps {
  id: string;
  label: string;
  help?: ReactNode;
  error?: string;
  required?: boolean;
  symbol: string;
  unit: 'currency' | 'count' | 'hours';
  suffix?: string;
  placeholder?: string;
  allowUnknown: boolean;
  unknownLabel: string;
  value: string;
  unknown: boolean;
  onChange: (next: { value: string; unknown: boolean }) => void;
}

function EstimateInput(props: EstimateInputProps) {
  const { id, label, help, error, required, symbol, unit, suffix, placeholder, allowUnknown, unknownLabel, value, unknown, onChange } =
    props;
  const unknownId = `${id}-unknown`;
  const aria = describedBy(id, help, error);
  return (
    <FieldShell id={id} label={label} help={help} error={error} required={required}>
      <div className="estimate">
        <div className={`estimate__input ${unknown ? 'estimate__input--disabled' : ''}`}>
          {symbol && (
            <span className="estimate__affix" aria-hidden="true">
              {symbol}
            </span>
          )}
          <input
            id={id}
            name={id}
            type="text"
            inputMode="decimal"
            className="input input--bare"
            value={unknown ? '' : value}
            placeholder={unknown ? unknownLabel : (placeholder ?? (unit === 'count' ? '0' : '0'))}
            disabled={unknown}
            aria-describedby={aria}
            aria-invalid={error ? true : undefined}
            aria-required={required && !unknown ? true : undefined}
            onChange={(e) => onChange({ value: e.target.value, unknown: false })}
          />
          {suffix && (
            <span className="estimate__affix estimate__affix--suffix" aria-hidden="true">
              {suffix}
            </span>
          )}
        </div>
        {allowUnknown && (
          <label htmlFor={unknownId} className="estimate__unknown">
            <input
              id={unknownId}
              type="checkbox"
              checked={unknown}
              onChange={(e) => onChange({ value: e.target.checked ? '' : value, unknown: e.target.checked })}
            />
            <span>{unknownLabel}</span>
          </label>
        )}
      </div>
      <span className="visually-hidden">
        {suffix ? `Amount in ${symbol || unit} ${suffix}.` : `Amount in ${symbol || unit}.`}
      </span>
    </FieldShell>
  );
}

/** Standalone email confirmation input used on the review page. */
export function ConfirmEmailInput({
  value,
  error,
  onChange,
}: {
  value: string;
  error?: string;
  onChange: (v: string) => void;
}) {
  const id = useId();
  return (
    <FieldShell id={id} label="Confirm your email address" error={error} required>
      <input
        id={id}
        type="email"
        inputMode="email"
        className="input"
        value={value}
        autoComplete="email"
        spellCheck={false}
        aria-describedby={describedBy(id, undefined, error)}
        aria-invalid={error ? true : undefined}
        onChange={(e) => onChange(e.target.value)}
      />
    </FieldShell>
  );
}
