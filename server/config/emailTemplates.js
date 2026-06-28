const base = (content) => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>AL-Rahma Academy</title>
</head>
<body style="margin:0;padding:0;background:#f4f7f4;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f7f4;padding:32px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.08);">
        <!-- Header -->
        <tr>
          <td style="background:#0b6e4f;padding:24px 32px;">
            <h1 style="margin:0;color:#fff;font-size:22px;letter-spacing:.5px;">🕌 AL-Rahma Academy</h1>
            <p style="margin:4px 0 0;color:#9fc0b3;font-size:13px;">Learn the Holy Quran Online</p>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:32px;">
            ${content}
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="background:#f4f7f4;padding:16px 32px;text-align:center;">
            <p style="margin:0;color:#888;font-size:12px;">© ${new Date().getFullYear()} AL-Rahma Academy · All rights reserved</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

const row = (label, value) =>
  `<tr>
    <td style="padding:6px 0;color:#555;font-size:14px;width:140px;vertical-align:top;"><strong>${label}</strong></td>
    <td style="padding:6px 0;color:#222;font-size:14px;">${value || '—'}</td>
  </tr>`;

// ── Admin: new trial request ──────────────────────────────────────────────
export function trialRequestAdminEmail({ name, email, phone, course, message }) {
  return base(`
    <h2 style="margin:0 0 8px;color:#0b6e4f;">New Trial Request 📋</h2>
    <p style="margin:0 0 20px;color:#555;font-size:14px;">A student has requested a free trial session.</p>
    <table cellpadding="0" cellspacing="0" width="100%">
      ${row('Name', name)}
      ${row('Email', `<a href="mailto:${email}" style="color:#0b6e4f;">${email}</a>`)}
      ${row('Phone', phone)}
      ${row('Course', course)}
      ${row('Message', message)}
    </table>
    <div style="margin-top:24px;">
      <a href="mailto:${email}" style="background:#0b6e4f;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-size:14px;display:inline-block;">Reply to Student</a>
    </div>
  `);
}

// ── Student: trial request confirmed ─────────────────────────────────────
export function trialRequestStudentEmail({ name }) {
  return base(`
    <h2 style="margin:0 0 8px;color:#0b6e4f;">Jazak Allah Khair, ${name}! 🌟</h2>
    <p style="color:#555;font-size:15px;line-height:1.7;">
      We have received your free trial request. One of our teachers will contact you within <strong>24 hours</strong> to schedule your session.
    </p>
    <p style="color:#555;font-size:15px;line-height:1.7;">
      In the meantime, feel free to explore the Quran reader on our website.
    </p>
    <div style="margin-top:24px;">
      <a href="${process.env.CLIENT_URL || 'http://localhost:5173'}/quran" style="background:#0b6e4f;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-size:14px;display:inline-block;">Read the Quran</a>
    </div>
    <p style="color:#888;font-size:13px;margin-top:24px;">If you have any questions, reply to this email or contact us on WhatsApp.</p>
  `);
}

// ── Admin: new manual payment ─────────────────────────────────────────────
export function manualPaymentAdminEmail({ name, email, plan, method, amount, currency, reference }) {
  return base(`
    <h2 style="margin:0 0 8px;color:#0b6e4f;">New Manual Payment Request 💰</h2>
    <p style="margin:0 0 20px;color:#555;font-size:14px;">A student has submitted a manual payment that needs your review.</p>
    <table cellpadding="0" cellspacing="0" width="100%">
      ${row('Name', name)}
      ${row('Email', `<a href="mailto:${email}" style="color:#0b6e4f;">${email}</a>`)}
      ${row('Plan', plan)}
      ${row('Amount', `${currency} ${amount}`)}
      ${row('Method', method)}
      ${row('Reference', reference || 'Not provided')}
    </table>
    <div style="margin-top:24px;">
      <a href="${process.env.CLIENT_URL || 'http://localhost:5173'}/admin" style="background:#0b6e4f;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-size:14px;display:inline-block;">Review in Dashboard</a>
    </div>
  `);
}

// ── Student: manual payment approved ─────────────────────────────────────
export function manualPaymentApprovedEmail({ name, plan }) {
  return base(`
    <h2 style="margin:0 0 8px;color:#0b6e4f;">Payment Approved! 🎉</h2>
    <p style="color:#555;font-size:15px;line-height:1.7;">
      Congratulations <strong>${name}</strong>! Your payment for the <strong>${plan}</strong> plan has been verified and your account is now active.
    </p>
    <p style="color:#555;font-size:15px;line-height:1.7;">
      You can view your invoice in your billing section. A teacher will reach out to schedule your first session.
    </p>
    <div style="margin-top:24px;">
      <a href="${process.env.CLIENT_URL || 'http://localhost:5173'}/billing" style="background:#0b6e4f;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-size:14px;display:inline-block;">View Billing</a>
    </div>
  `);
}

// ── Student: manual payment rejected ─────────────────────────────────────
export function manualPaymentRejectedEmail({ name, adminNote }) {
  return base(`
    <h2 style="margin:0 0 8px;color:#c0392b;">Payment Could Not Be Verified</h2>
    <p style="color:#555;font-size:15px;line-height:1.7;">
      Dear <strong>${name}</strong>, unfortunately we were unable to verify your recent payment.
    </p>
    ${adminNote ? `<p style="background:#fef9e7;padding:12px 16px;border-left:4px solid #f39c12;color:#555;font-size:14px;border-radius:4px;">Note from our team: ${adminNote}</p>` : ''}
    <p style="color:#555;font-size:15px;line-height:1.7;">
      Please contact us so we can resolve this as quickly as possible.
    </p>
    <div style="margin-top:24px;">
      <a href="mailto:${process.env.SMTP_USER || ''}" style="background:#0b6e4f;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-size:14px;display:inline-block;">Contact Us</a>
    </div>
  `);
}
