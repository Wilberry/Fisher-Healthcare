import { useId, type InputHTMLAttributes } from 'react';
export type TextFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> & {
  label: string;
  id?: string;
  helperText?: string;
  error?: string;
};
export function TextField({ label, id, helperText, error, className = '', ...input }: TextFieldProps) {
  const generated = useId();
  const fieldId = id ?? generated;
  const descriptionId = helperText || error ? `${fieldId}-description` : undefined;
  return <div className={`fisher-field ${className}`.trim()}>
    <label htmlFor={fieldId}>{label}{input.required ? <span aria-hidden="true"> *</span> : null}</label>
    <input {...input} id={fieldId} aria-invalid={error ? true : undefined}
      aria-describedby={descriptionId} />
    {error ? <p id={descriptionId} className="fisher-field-error">{error}</p> :
      helperText ? <p id={descriptionId} className="fisher-field-helper">{helperText}</p> : null}
  </div>;
}
