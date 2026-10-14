import { useEffect, useState } from 'react';
import { readResetToken } from '../utils/resetToken';

// The token from an emailed link (#token=…). Opening a second link while the
// page is already open changes only the fragment: the browser fires
// `hashchange` without reloading, so the page would keep the first token.
// Listening for it makes the newest link the one that counts.
export function useLinkToken() {
  const [token, setToken] = useState(() => readResetToken());
  useEffect(() => {
    const onHashChange = () => {
      const next = readResetToken();
      if (next) setToken(next);
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);
  return token;
}
