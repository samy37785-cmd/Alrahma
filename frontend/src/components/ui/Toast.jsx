/**
 * Toast notification system.
 *
 * Usage:
 *   const { toast } = useToast();
 *   toast.success('Saved!');
 *   toast.error('Something went wrong');
 *   toast.info('3 new messages');
 *   toast.warning('Session expiring soon');
 *   toast({ title: 'Done', description: 'Details…', variant: 'success', duration: 4000 });
 *
 * Wire <ToastProvider> + <ToastViewport> in App.jsx once.
 */

import { createContext, useContext, useCallback, useReducer, useRef } from 'react';

/* ── State ── */
const ToastContext = createContext(null);
let _nextId = 1;

function reducer(state, action) {
  switch (action.type) {
    case 'ADD':
      return [action.toast, ...state].slice(0, 6); // max 6 toasts
    case 'REMOVE':
      return state.filter(t => t.id !== action.id);
    case 'UPDATE':
      return state.map(t => t.id === action.id ? { ...t, ...action.updates } : t);
    default:
      return state;
  }
}

/* ── Provider ── */
export function ToastProvider({ children }) {
  const [toasts, dispatch] = useReducer(reducer, []);
  const timers = useRef({});

  const dismiss = useCallback((id) => {
    clearTimeout(timers.current[id]);
    dispatch({ type: 'REMOVE', id });
  }, []);

  const addToast = useCallback(({ title, description, variant = 'default', duration = 4000, action } = {}) => {
    const id = _nextId++;
    dispatch({ type: 'ADD', toast: { id, title, description, variant, action, visible: true } });

    if (duration > 0) {
      timers.current[id] = setTimeout(() => dismiss(id), duration);
    }
    return id;
  }, [dismiss]);

  /* Convenience shorthands */
  addToast.success = (title, opts)     => addToast({ title, variant: 'success', ...opts });
  addToast.error   = (title, opts)     => addToast({ title, variant: 'error',   duration: 6000, ...opts });
  addToast.warning = (title, opts)     => addToast({ title, variant: 'warning', ...opts });
  addToast.info    = (title, opts)     => addToast({ title, variant: 'info',    ...opts });

  return (
    <ToastContext.Provider value={{ toast: addToast, dismiss }}>
      {children}
      <ToastViewport toasts={toasts} dismiss={dismiss} />
    </ToastContext.Provider>
  );
}

/* ── Hook ── */
// eslint-disable-next-line react-refresh/only-export-components
export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}

/* ── Viewport (render target) ── */
function ToastViewport({ toasts, dismiss }) {
  if (!toasts.length) return null;
  return (
    <div className="toast-viewport" role="region" aria-label="Notifications" aria-live="polite">
      {[...toasts].reverse().map(t => (
        <ToastItem key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
      ))}
    </div>
  );
}

/* ── Single toast item ── */
const ICONS = {
  success: (
    <svg viewBox="0 0 20 20" fill="currentColor" className="toast__icon">
      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"/>
    </svg>
  ),
  error: (
    <svg viewBox="0 0 20 20" fill="currentColor" className="toast__icon">
      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd"/>
    </svg>
  ),
  warning: (
    <svg viewBox="0 0 20 20" fill="currentColor" className="toast__icon">
      <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd"/>
    </svg>
  ),
  info: (
    <svg viewBox="0 0 20 20" fill="currentColor" className="toast__icon">
      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2h-.5V9a1 1 0 00-1-1H9z" clipRule="evenodd"/>
    </svg>
  ),
};

function ToastItem({ toast, onDismiss }) {
  const { title, description, variant = 'default', action } = toast;
  // 'alert' (assertive) for error/warning; 'status' (polite) for everything else
  const role = (variant === 'error' || variant === 'warning') ? 'alert' : 'status';
  return (
    <div
      className={`toast toast--${variant}`}
      role={role}
      aria-atomic="true"
    >
      <div className="toast__body">
        {ICONS[variant] && (
          <span className="toast__icon-wrap" aria-hidden="true">
            {ICONS[variant]}
          </span>
        )}
        <div className="toast__content">
          {title && <p className="toast__title">{title}</p>}
          {description && <p className="toast__desc">{description}</p>}
          {action && (
            <button type="button" className="toast__action" onClick={action.onClick}>
              {action.label}
            </button>
          )}
        </div>
      </div>
      <button
        type="button"
        className="toast__close"
        onClick={onDismiss}
        aria-label="Dismiss notification"
      >
        <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd"/>
        </svg>
      </button>
    </div>
  );
}
