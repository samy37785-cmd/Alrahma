import nodemailer from 'nodemailer';

// Lazy-initialise the transporter once (reused across calls).
let _transporter = null;

function getTransporter() {
  if (_transporter) return _transporter;
  _transporter = nodemailer.createTransport({
    host:   process.env.SMTP_HOST || 'smtp.gmail.com',
    port:   Number(process.env.SMTP_PORT) || 587,
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
  return _transporter;
}

// Generic send helper — silently skips if SMTP is not configured.
export async function sendMail({ to, subject, html }) {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) return;
  try {
    await getTransporter().sendMail({
      from: `"AL-Rahma Academy" <${process.env.SMTP_USER}>`,
      to,
      subject,
      html,
    });
  } catch (err) {
    console.error('[mailer] Failed to send email:', err.message);
  }
}

export const ADMIN_EMAIL = () => process.env.ADMIN_EMAIL || process.env.SMTP_USER || '';
