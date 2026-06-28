import Enrollment from '../models/Enrollment.js';
import { sendMail, ADMIN_EMAIL } from '../config/mailer.js';
import { asyncHandler } from '../middleware/asyncHandler.js';

const LANG_LABELS = { en: 'English', ar: 'Arabic', it: 'Italian', fr: 'French', de: 'German', es: 'Spanish' };

// Escapes HTML special characters in user-supplied strings to prevent HTML
// injection in email templates. Returns '—' for null/undefined/empty values.
const esc = (s) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;') || '—';

function adminHtml(d) {
  const subjects = (d.subjects || []).map(esc).join(', ') || '—';
  const times    = (d.times || []).map(esc).join(', ') || '—';
  const lang     = LANG_LABELS[d.lang] || esc(d.lang);
  return `
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
  <p style="margin-top:20px;font-size:13px;color:#888;">Submitted via the Enrollment Wizard — AL-Rahma Academy</p>`;
}

function studentHtml(name, teacherName, plan) {
  return `
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
  </p>`;
}

// @route  POST /api/enrollments
// @access Public
export const createEnrollment = asyncHandler(async (req, res) => {
  const data = req.body;
  if (!data.name || !data.email) {
    res.status(400);
    throw new Error('Name and email are required');
  }

  const enrollment = await Enrollment.create(data);

  // Admin notification — fire-and-forget (non-critical)
  const adminEmail = ADMIN_EMAIL();
  if (adminEmail) {
    sendMail({
      to: adminEmail,
      subject: `📋 New Enrollment — ${data.name} (${data.teacherName || 'no teacher yet'})`,
      html: adminHtml(data),
    });
  }

  // Student confirmation — await so we know it delivered; failure is logged but
  // does not roll back the enrollment (it's already saved to the DB).
  try {
    await sendMail({
      to: data.email,
      subject: 'Your enrollment request — AL-Rahma Academy',
      html: studentHtml(data.name, data.teacherName, data.plan),
    });
  } catch (err) {
    console.error('[enrollment] Failed to send student confirmation email:', err.message);
  }

  res.status(201).json({ message: 'Enrollment received', id: enrollment._id });
});

// @route  GET /api/enrollments/mine
// @access Student (own enrollment, matched by email)
export const getMyEnrollment = asyncHandler(async (req, res) => {
  const enrollment = await Enrollment.findOne({ email: req.user.email }).sort('-createdAt');
  res.json(enrollment || null);
});

// @route  GET /api/enrollments?page=1&limit=50
// @access Admin
export const getEnrollments = asyncHandler(async (req, res) => {
  const page  = Math.max(1, parseInt(req.query.page)  || 1);
  const limit = Math.min(500, parseInt(req.query.limit) || 500);
  const skip  = (page - 1) * limit;

  const [data, total] = await Promise.all([
    Enrollment.find().sort('-createdAt').skip(skip).limit(limit),
    Enrollment.countDocuments(),
  ]);
  res.json({ data, total, page, pages: Math.ceil(total / limit) });
});

// @route  PATCH /api/enrollments/:id
// @access Admin
export const updateEnrollment = asyncHandler(async (req, res) => {
  const enrollment = await Enrollment.findByIdAndUpdate(req.params.id, req.body, { new: true });
  if (!enrollment) { res.status(404); throw new Error('Not found'); }
  res.json(enrollment);
});
