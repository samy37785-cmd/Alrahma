import { useState } from 'react';
import { resendVerification } from '../../api/authApi';
import { useLang } from '../../context/LangContext';

// Audit AR-02: shown while the account has not confirmed its email. Bookings
// and invoices matched only by email stay hidden until it does. An account
// from before email confirmation has emailVerified: true from /api/auth/me,
// and an absent field (another backend) never shows the banner.
export default function EmailVerifyBanner({ me }) {
  const { t } = useLang();
  const ve = t.authPg.verifyEmail;
  const [status, setStatus] = useState('idle'); // idle | sending | sent | failed

  if (me?.emailVerified !== false) return null;

  const resend = async () => {
    setStatus('sending');
    try {
      await resendVerification();
      setStatus('sent');
    } catch {
      setStatus('failed');
    }
  };

  return (
    <div role="status" className="email-verify-banner" style={{ background: 'var(--color-warning-surface)', border: '1px solid var(--color-warning-border)', color: 'var(--color-warning-text)', borderRadius: 10, padding: '12px 16px', margin: '0 0 16px', display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', justifyContent: 'space-between' }}>
      <span style={{ flex: '1 1 260px', minWidth: 0 }}>{ve.banner.replace('{email}', me.email || '')}</span>
      {status === 'sent' ? (
        <span>{ve.resent}</span>
      ) : (
        <button type="button" className="btn btn--green btn--sm" onClick={resend} disabled={status === 'sending'} aria-busy={status === 'sending'}>
          {ve.resend}
        </button>
      )}
      {status === 'failed' && <span role="alert">{ve.resendFailed}</span>}
    </div>
  );
}
