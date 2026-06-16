import Enrollment from '../models/Enrollment.js';
import { sendMail, ADMIN_EMAIL } from '../config/mailer.js';

const LANG_LABELS = { en: 'English', ar: 'Arabic', it: 'Italian', fr: 'French', de: 'German', es: 'Spanish' };

function adminHtml(d) {
  const subjects = d.subjects?.join(', ') || '—';
  const times    = d.times?.join(', ') || '—';
  const lang     = LANG_LABELS[d.lang] || d.lang || '—';
  return `
  <h2 style="color:#0b6e4f;margin-top:0;">📋 New Enrollment Request</h2>
  <table style="width:100%;border-collapse:collapse;font-size:14px;">
    <tr style="background:#f0f8f4;"><td style="padding:10px 14px;font-weight:700;width:40%;">Name</td><td style="padding:10px 14px;">${d.name}</td></tr>
    <tr><td style="padding:10px 14px;font-weight:700;">Email</td><td style="padding:10px 14px;"><a href="mailto:${d.email}">${d.email}</a></td></tr>
    <tr style="background:#f0f8f4;"><td style="padding:10px 14px;font-weight:700;">WhatsApp</td><td style="padding:10px 14px;">${d.whatsapp || '—'}</td></tr>
    <tr><td style="padding:10px 14px;font-weight:700;">Country / City</td><td style="padding:10px 14px;">${d.country || '—'} / ${d.city || '—'}</td></tr>
    <tr style="background:#f0f8f4;"><td style="padding:10px 14px;font-weight:700;">Time Zone</td><td style="padding:10px 14px;">${d.timezone || '—'}</td></tr>
    <tr><td style="padding:10px 14px;font-weight:700;">Available Times</td><td style="padding:10px 14px;">${times}</td></tr>
    <tr style="background:#f0f8f4;"><td style="padding:10px 14px;font-weight:700;">Subjects</td><td style="padding:10px 14px;">${subjects}</td></tr>
    <tr><td style="padding:10px 14px;font-weight:700;">Instruction Language</td><td style="padding:10px 14px;">${lang}</td></tr>
    <tr style="background:#f0f8f4;"><td style="padding:10px 14px;font-weight:700;">Level</td><td style="padding:10px 14px;">${d.level || '—'}</td></tr>
    <tr><td style="padding:10px 14px;font-weight:700;">Age Group</td><td style="padding:10px 14px;">${d.ageGroup || '—'}</td></tr>
    <tr style="background:#f0f8f4;"><td style="padding:10px 14px;font-weight:700;">Teacher Preference</td><td style="padding:10px 14px;">${d.genderPref === 'f' ? 'Female only' : d.genderPref === 'm' ? 'Male only' : 'No preference'}</td></tr>
    <tr><td style="padding:10px 14px;font-weight:700;">Chosen Teacher</td><td style="padding:10px 14px;">${d.teacherName || '—'}</td></tr>
    <tr style="background:#f0f8f4;"><td style="padding:10px 14px;font-weight:700;">Chosen Plan</td><td style="padding:10px 14px;">${d.plan || '—'}</td></tr>
  </table>
  <p style="margin-top:20px;font-size:13px;color:#888;">Submitted via the Enrollment Wizard — AL-Rahma Academy</p>`;
}

function studentHtml(name, teacherName, plan) {
  return `
  <h2 style="color:#0b6e4f;margin-top:0;">Thank you, ${name}! 🎉</h2>
  <p style="font-size:15px;line-height:1.7;color:#444;">
    We have received your enrollment request and one of our team members will be in touch within <strong>24 hours</strong> to confirm your schedule.
  </p>
  ${teacherName ? `<p style="font-size:14px;color:#444;">Your chosen teacher: <strong>${teacherName}</strong></p>` : ''}
  ${plan ? `<p style="font-size:14px;color:#444;">Chosen plan: <strong>${plan}</strong></p>` : ''}
  <p style="font-size:15px;color:#444;">Meanwhile, feel free to reply to this email with any questions.</p>
  <p style="margin-top:24px;font-size:14px;color:#666;">
    Barakallahu feekum,<br/>
    <strong>AL-Rahma Academy Team</strong>
  </p>`;
}

// @route  POST /api/enrollments
// @access Public
export async function createEnrollment(req, res, next) {
  try {
    const data = req.body;
    if (!data.name || !data.email) {
      res.status(400);
      throw new Error('Name and email are required');
    }

    const enrollment = await Enrollment.create(data);

    const adminEmail = ADMIN_EMAIL();
    if (adminEmail) {
      sendMail({
        to: adminEmail,
        subject: `📋 New Enrollment — ${data.name} (${data.teacherName || 'no teacher yet'})`,
        html: adminHtml(data),
      });
    }
    sendMail({
      to: data.email,
      subject: 'Your enrollment request — AL-Rahma Academy',
      html: studentHtml(data.name, data.teacherName, data.plan),
    });

    res.status(201).json({ message: 'Enrollment received', id: enrollment._id });
  } catch (err) {
    next(err);
  }
}

// @route  GET /api/enrollments
// @access Admin
export async function getEnrollments(req, res, next) {
  try {
    const enrollments = await Enrollment.find().sort('-createdAt');
    res.json(enrollments);
  } catch (err) {
    next(err);
  }
}

// @route  PATCH /api/enrollments/:id
// @access Admin
export async function updateEnrollment(req, res, next) {
  try {
    const enrollment = await Enrollment.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!enrollment) { res.status(404); throw new Error('Not found'); }
    res.json(enrollment);
  } catch (err) {
    next(err);
  }
}
