import { useModalA11y } from '../../hooks/useModalA11y';

/**
 * THE shared modal (roadmap Phase 6). Composes the design-system kit
 * (.ds-modal* in styles/design-system.css) with useModalA11y (Escape to
 * close, initial focus on the close button, background scroll lock, focus
 * restore). New dialogs must use this instead of hand-rolling an overlay —
 * the ~12 bespoke implementations predating it are being migrated one by
 * one.
 *
 * @param {boolean}  open        mount/unmount the dialog
 * @param {function} onClose     called on overlay click, ✕, and Escape
 * @param {string}   [title]     rendered as the ds-modal header title
 * @param {string}   [subtitle]  rendered under the title
 * @param {string}   [size]      'sm' | 'md' | 'lg' | 'xl' (ds-modal--*)
 * @param {string}   [ariaLabel] accessible name; defaults to title
 * @param {string}   [closeLabel] localized aria-label for the ✕ button
 * @param {node}     [footer]    rendered in a ds-modal__footer
 * @param {string}   [className] extra classes on the ds-modal card
 */
export default function Modal({
  open,
  onClose,
  title,
  subtitle,
  size,
  ariaLabel,
  closeLabel = 'Close',
  footer,
  className = '',
  children,
}) {
  const firstFocusRef = useModalA11y(open, onClose);
  if (!open) return null;

  return (
    <div className="ds-modal-overlay" onClick={onClose}>
      <div
        className={`ds-modal${size ? ` ds-modal--${size}` : ''}${className ? ` ${className}` : ''}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel || title}
      >
        <div className="ds-modal__header">
          <div>
            {title && <h3 className="ds-modal__title">{title}</h3>}
            {subtitle && <p className="ds-modal__subtitle">{subtitle}</p>}
          </div>
          <button
            ref={firstFocusRef}
            type="button"
            className="ds-modal__close"
            onClick={onClose}
            aria-label={closeLabel}
          >
            ×
          </button>
        </div>
        <div className="ds-modal__body">{children}</div>
        {footer && <div className="ds-modal__footer">{footer}</div>}
      </div>
    </div>
  );
}
