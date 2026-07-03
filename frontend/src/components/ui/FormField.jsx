import { forwardRef, useId, cloneElement, isValidElement } from 'react';

/**
 * FormField — wraps Label + Input/Textarea/Select + helper/error text.
 * Provides consistent spacing, focus styles, real-time validation UX,
 * and screen-reader associations via aria-describedby.
 *
 * Usage:
 *   <FormField label="Email" error={errors.email?.message} required>
 *     <Input type="email" {...register('email')} />
 *   </FormField>
 *
 * Or use the bundled Input variant:
 *   <FormField label="Name" required>
 *     <FormInput type="text" placeholder="Your name" />
 *   </FormField>
 */

/* ── FormField wrapper ── */
export function FormField({ label, hint, error, success, required, className = '', children, id: idProp }) {
  const uid = useId();
  const id  = idProp || uid;
  const hintId  = hint  ? `${id}-hint`  : undefined;
  const errorId = error ? `${id}-error` : undefined;

  return (
    <div className={`ff ${error ? 'ff--error' : ''} ${success ? 'ff--success' : ''} ${className}`}>
      {label && (
        <label className="ff__label" htmlFor={id}>
          {label}
          {required && <span className="ff__required" aria-hidden="true">*</span>}
        </label>
      )}
      <div className="ff__control">
        {/* Clone children and inject id + aria-describedby */}
        {children && typeof children === 'object'
          ? cloneWithProps(children, { id, 'aria-describedby': [hintId, errorId].filter(Boolean).join(' ') || undefined, 'aria-invalid': error ? 'true' : undefined })
          : children}
      </div>
      {hint && !error && (
        <span id={hintId} className="ff__hint">{hint}</span>
      )}
      {error && (
        <span id={errorId} className="ff__error" role="alert" aria-live="polite">
          <svg className="ff__error-icon" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <path d="M8 1a7 7 0 100 14A7 7 0 008 1zm.75 4a.75.75 0 00-1.5 0v3.5a.75.75 0 001.5 0V5zm-.75 6a1 1 0 110-2 1 1 0 010 2z"/>
          </svg>
          {error}
        </span>
      )}
      {success && !error && (
        <span className="ff__success">
          <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z"/>
          </svg>
          {success}
        </span>
      )}
    </div>
  );
}

function cloneWithProps(child, extraProps) {
  if (!child || typeof child !== 'object') return child;
  if (isValidElement(child)) return cloneElement(child, extraProps);
  return child;
}

/* ── Input ── */
export const FormInput = forwardRef(function FormInput(
  { className = '', size = 'md', ...props },
  ref
) {
  return (
    <input
      ref={ref}
      className={`ff__input ff__input--${size} ${className}`}
      {...props}
    />
  );
});

/* ── Textarea ── */
export const FormTextarea = forwardRef(function FormTextarea(
  { className = '', rows = 4, ...props },
  ref
) {
  return (
    <textarea
      ref={ref}
      rows={rows}
      className={`ff__input ff__textarea ${className}`}
      {...props}
    />
  );
});

/* ── Select ── */
export const FormSelect = forwardRef(function FormSelect(
  { className = '', children, ...props },
  ref
) {
  return (
    <div className="ff__select-wrap">
      <select ref={ref} className={`ff__input ff__select ${className}`} {...props}>
        {children}
      </select>
      <svg className="ff__select-chevron" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
        <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd"/>
      </svg>
    </div>
  );
});

/* ── Checkbox ── */
export const FormCheckbox = forwardRef(function FormCheckbox(
  { label, className = '', ...props },
  ref
) {
  const id = useId();
  return (
    <label className={`ff__checkbox-label ${className}`} htmlFor={id}>
      <input ref={ref} id={id} type="checkbox" className="ff__checkbox" {...props} />
      <span className="ff__checkbox-indicator" aria-hidden="true" />
      {label && <span className="ff__checkbox-text">{label}</span>}
    </label>
  );
});

/* ── Switch / Toggle ── */
export const FormSwitch = forwardRef(function FormSwitch(
  { label, description, className = '', ...props },
  ref
) {
  const id = useId();
  return (
    <div className={`ff__switch-wrap ${className}`}>
      <label className="ff__switch-label" htmlFor={id}>
        <div className="ff__switch-text">
          {label && <span className="ff__switch-name">{label}</span>}
          {description && <span className="ff__switch-desc">{description}</span>}
        </div>
        <div className="ff__switch-track">
          <input ref={ref} id={id} type="checkbox" role="switch" className="ff__switch-input" {...props} />
          <span className="ff__switch-thumb" aria-hidden="true" />
        </div>
      </label>
    </div>
  );
});

export default FormField;
