import crypto from 'crypto';

export const hashToken = (raw) =>
  crypto.createHash('sha256').update(String(raw)).digest('hex');
