// Absolute URL to the brand mark (book + mosque dome + minaret on a green
// tile) — the same logo used everywhere in the app. Email clients don't
// execute JS or inline SVG reliably, so unlike the frontend's <BrandIcon/>
// this references the hosted PNG, with the "AL-Rahma Academy" text as a
// fallback if the recipient's client blocks images.
const LOGO_URL = `${process.env.CLIENT_URL || 'https://al-rahmaacademy.com'}/logo.png`;

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
            <table cellpadding="0" cellspacing="0" role="presentation">
              <tr>
                <td style="vertical-align:middle;padding-right:12px;">
                  <img src="${LOGO_URL}" width="40" height="40" alt="Al-Rahma Academy" style="display:block;border-radius:9px;" />
                </td>
                <td style="vertical-align:middle;">
                  <h1 style="margin:0;color:#fff;font-size:22px;letter-spacing:.5px;">AL-Rahma Academy</h1>
                  <p style="margin:4px 0 0;color:#9fc0b3;font-size:13px;">Learn the Holy Quran Online</p>
                </td>
              </tr>
            </table>
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

// ── Student: certificate issued ───────────────────────────────────────────
export function certificateIssuedEmail({ name, title, number }) {
  return base(`
    <h2 style="margin:0 0 8px;color:#0b6e4f;">Mabrouk, ${name}! 🎓</h2>
    <p style="color:#555;font-size:15px;line-height:1.7;">
      You have been awarded a certificate from AL-Rahma Academy:
    </p>
    <div style="background:#f0f8f4;border:1px solid #bfe0cf;border-radius:8px;padding:18px 20px;margin:8px 0 4px;">
      <p style="margin:0;color:#0b6e4f;font-size:17px;font-weight:bold;">${title}</p>
      <p style="margin:6px 0 0;color:#888;font-size:13px;">Certificate No. ${number}</p>
    </div>
    <p style="color:#555;font-size:15px;line-height:1.7;margin-top:16px;">
      You can view and print your certificate from your account.
    </p>
    <div style="margin-top:24px;">
      <a href="${process.env.CLIENT_URL || 'http://localhost:5173'}/profile" style="background:#0b6e4f;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-size:14px;display:inline-block;">View Certificate</a>
    </div>
  `);
}

// ── Student: a live class was scheduled ──────────────────────────────────
export function liveClassScheduledEmail({ studentName, teacherName, title, startsAt, meetingUrl }) {
  // Shown in UTC; the website displays it in the viewer's local timezone.
  const when = new Date(startsAt).toLocaleString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZone: 'UTC', timeZoneName: 'short',
  });
  return base(`
    <h2 style="margin:0 0 8px;color:#0b6e4f;">Your live class is scheduled 📅</h2>
    <p style="color:#555;font-size:15px;line-height:1.7;">
      As-salamu alaykum <strong>${studentName}</strong>, ${teacherName ? `<strong>${teacherName}</strong> has` : 'we have'} scheduled a live class for you:
    </p>
    <div style="background:#f0f8f4;border:1px solid #bfe0cf;border-radius:8px;padding:16px 20px;margin:8px 0;">
      <p style="margin:0;color:#0b6e4f;font-size:16px;font-weight:bold;">${title}</p>
      <p style="margin:6px 0 0;color:#555;font-size:14px;">🕒 ${when}</p>
    </div>
    <p style="color:#888;font-size:13px;">The time above is shown in UTC — check the exact time in your local timezone on your dashboard.</p>
    ${meetingUrl ? `<div style="margin-top:20px;"><a href="${meetingUrl}" style="background:#0b6e4f;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-size:14px;display:inline-block;">Join the Class</a></div>` : ''}
  `);
}

// ── Student: subscription renewal coming up ──────────────────────────────
export function subscriptionRenewalReminderEmail({ name, plan, validUntil, daysLeft, autoRenew }) {
  const when = new Date(validUntil).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  const lead = daysLeft <= 0
    ? 'expires <strong>today</strong>'
    : `expires in <strong>${daysLeft} day${daysLeft === 1 ? '' : 's'}</strong> (on ${when})`;
  return base(`
    <h2 style="margin:0 0 8px;color:#0b6e4f;">Your subscription is renewing soon 🔔</h2>
    <p style="color:#555;font-size:15px;line-height:1.7;">
      As-salamu alaykum <strong>${name}</strong>, your <strong>${plan || 'subscription'}</strong> plan ${lead}.
    </p>
    <p style="color:#555;font-size:15px;line-height:1.7;">
      ${autoRenew
        ? 'Your card on file will be charged automatically to keep your access uninterrupted — no action needed. To change or cancel, visit your billing page.'
        : 'To keep your lessons going without interruption, please renew before that date from your billing page.'}
    </p>
    <div style="margin-top:24px;">
      <a href="${process.env.CLIENT_URL || 'http://localhost:5173'}/billing" style="background:#0b6e4f;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-size:14px;display:inline-block;">${autoRenew ? 'Manage Billing' : 'Renew Now'}</a>
    </div>
    <p style="color:#888;font-size:13px;margin-top:24px;">If you have any questions, just reply to this email.</p>
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

// ── Enrollment: admin notification ───────────────────────────────────────
const LANG_LABELS = { en: 'English', ar: 'Arabic', it: 'Italian', fr: 'French', de: 'German', es: 'Spanish' };

const esc = (s) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;') || '—';

export function enrollmentAdminEmail(d) {
  const subjects = (d.subjects || []).map(esc).join(', ') || '—';
  const times    = (d.times    || []).map(esc).join(', ') || '—';
  const lang     = LANG_LABELS[d.lang] || esc(d.lang);
  return base(`
    <h2 style="color:#0b6e4f;margin-top:0;">📋 New Enrollment Request</h2>
    <table style="width:100%;border-collapse:collapse;font-size:14px;">
      <tr style="background:#f0f8f4;"><td style="padding:10px 14px;font-weight:700;width:40%;">Name</td><td style="padding:10px 14px;">${esc(d.name)}</td></tr>
      <tr><td style="padding:10px 14px;font-weight:700;">Email</td><td style="padding:10px 14px;"><a href="mailto:${esc(d.email)}">${esc(d.email)}</a></td></tr>
      <tr style="background:#f0f8f4;"><td style="padding:10px 14px;font-weight:700;">WhatsApp</td><td style="padding:10px 14px;">${esc(d.whatsapp)}</td></tr>
      <tr><td style="padding:10px 14px;font-weight:700;">Country / City</td><td style="padding:10px 14px;">${esc(d.country)} / ${esc(d.city)}</td></tr>
      <tr style="background:#f0f8f4;"><td style="padding:10px 14px;font-weight:700;">Time Zone</td><td style="padding:10px 14px;">${esc(d.timezone)}</td></tr>
      <tr><td style="padding:10px 14px;font-weight:700;">Available Times</td><td style="padding:10px 14px;">${times}</td></tr>
      <tr style="background:#f0f8f4;"><td style="padding:10px 14px;font-weight:700;">Subjects</td><td style="padding:10px 14px;">${subjects}</td></tr>
      <tr><td style="padding:10px 14px;font-weight:700;">Instruction Language</td><td style="padding:10px 14px;">${lang}</td></tr>
      <tr style="background:#f0f8f4;"><td style="padding:10px 14px;font-weight:700;">Level</td><td style="padding:10px 14px;">${esc(d.level)}</td></tr>
      <tr><td style="padding:10px 14px;font-weight:700;">Age Group</td><td style="padding:10px 14px;">${esc(d.ageGroup)}</td></tr>
      <tr style="background:#f0f8f4;"><td style="padding:10px 14px;font-weight:700;">Teacher Preference</td><td style="padding:10px 14px;">${d.genderPref === 'f' ? 'Female only' : d.genderPref === 'm' ? 'Male only' : 'No preference'}</td></tr>
      <tr><td style="padding:10px 14px;font-weight:700;">Chosen Teacher</td><td style="padding:10px 14px;">${esc(d.teacherName)}</td></tr>
      <tr style="background:#f0f8f4;"><td style="padding:10px 14px;font-weight:700;">Chosen Plan</td><td style="padding:10px 14px;">${esc(d.plan)}</td></tr>
    </table>
    <p style="margin-top:20px;font-size:13px;color:#888;">Submitted via the Enrollment Wizard — AL-Rahma Academy</p>
  `);
}

// ── Enrollment: student confirmation ─────────────────────────────────────
export function enrollmentStudentEmail({ name, teacherName, plan }) {
  return base(`
    <h2 style="color:#0b6e4f;margin-top:0;">Thank you, ${esc(name)}! 🎉</h2>
    <p style="font-size:15px;line-height:1.7;color:#444;">
      We have received your enrollment request and one of our team members will be in touch within <strong>24 hours</strong> to confirm your schedule.
    </p>
    ${teacherName ? `<p style="font-size:14px;color:#444;">Your chosen teacher: <strong>${esc(teacherName)}</strong></p>` : ''}
    ${plan ? `<p style="font-size:14px;color:#444;">Chosen plan: <strong>${esc(plan)}</strong></p>` : ''}
    <p style="font-size:15px;color:#444;">Meanwhile, feel free to reply to this email with any questions.</p>
    <p style="margin-top:24px;font-size:14px;color:#666;">
      Barakallahu feekum,<br/>
      <strong>AL-Rahma Academy Team</strong>
    </p>
  `);
}

// ── Admin: contact form notification ─────────────────────────────────────
export function contactAdminEmail({ name, email, phone, subject, message }) {
  return base(`
    <h2 style="margin:0 0 8px;color:#0b6e4f;">New Contact Message 📬</h2>
    <table cellpadding="0" cellspacing="0" width="100%">
      ${row('From', `${esc(name)} &lt;<a href="mailto:${esc(email)}" style="color:#0b6e4f;">${esc(email)}</a>&gt;`)}
      ${phone ? row('Phone', esc(phone)) : ''}
      ${row('Subject', esc(subject))}
    </table>
    <div style="margin-top:16px;padding:12px 16px;background:#f4f7f4;border-radius:6px;font-size:14px;color:#333;white-space:pre-wrap;">${esc(message)}</div>
  `);
}

// ── User: forgot password reset link ─────────────────────────────────────
export function weeklyParentReportEmail({ parentName, children }) {
  const childRows = children.map(({ childName, streak, lessonsThisWeek, xp, level, nextClass }) => `
    <div style="background:#f9fafb;border:1px solid #e0e0e0;border-radius:10px;padding:16px 20px;margin-bottom:14px;">
      <p style="margin:0 0 10px;font-size:16px;font-weight:700;color:#0b6e4f;">${esc(childName)}</p>
      <table width="100%" cellpadding="0" cellspacing="0">
        ${row('Lessons this week', lessonsThisWeek)}
        ${row('Day streak', streak)}
        ${row('XP earned', xp + ' XP · Level ' + level)}
        ${nextClass ? row('Next class', new Date(nextClass).toLocaleString('en-GB', { weekday: 'long', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })) : ''}
      </table>
    </div>
  `).join('');

  return base(`
    <p>As-salamu alaykum ${esc(parentName)},</p>
    <p style="color:#555;font-size:15px;line-height:1.7;">
      Here is your weekly learning report from <strong>Al-Rahma Academy</strong>.
    </p>
    ${childRows}
    <p style="color:#888;font-size:13px;margin-top:20px;">
      Keep up the great work! Regular study is the key to Quran mastery. 🌙
    </p>
    <div style="margin:24px 0;">
      <a href="${process.env.CLIENT_URL || 'https://alrahmaacademy.com'}/parent" style="background:#0b6e4f;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;">View Full Progress</a>
    </div>
  `);
}

export function forgotPasswordEmail({ name, link }) {
  return base(`
    <p>Hi ${esc(name)},</p>
    <p style="color:#555;font-size:15px;line-height:1.7;">
      Click the button below to reset your password. The link expires in <strong>1 hour</strong>.
    </p>
    <div style="margin:24px 0;">
      <a href="${link}" style="background:#0b6e4f;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;">Reset Password</a>
    </div>
    <p style="color:#888;font-size:12px;">If you didn't request this, ignore this email.</p>
  `);
}
