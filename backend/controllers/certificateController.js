import Certificate from '../models/Certificate.js';
import User from '../models/User.js';
import { sendMail } from '../config/mailer.js';
import { certificateIssuedEmail } from '../config/emailTemplates.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { auditFromReq } from '../services/auditService.js';

// @desc  Admin/teacher: issue a certificate to a student.
// @route POST /api/certificates
// @body  { userId, type, title, course?, grade?, notes? }
// @access Admin
export const issueCertificate = asyncHandler(async (req, res) => {
  const { userId, type = 'completion', title, course, grade, notes } = req.body;
  if (!userId || !title) {
    res.status(400);
    throw new Error('Student and certificate title are required');
  }

  const student = await User.findById(userId).lean();
  if (!student) { res.status(404); throw new Error('Student not found'); }

  const cert = await Certificate.create({
    user:        student._id,
    studentName: student.name,
    type,
    title,
    course:      course || undefined,
    grade,
    notes,
    // req.adminUser (not req.user) — this route is only reachable via the
    // hardened /api/v1/admin/* stack (verifyAccessToken), which never sets
    // req.user.
    issuedBy:    req.adminUser?.name || 'AL-Rahma Academy',
  });

  await auditFromReq(req, 'certificate.issue', 'Certificate', cert._id, null, cert, 'info');

  // Notify the student (non-blocking).
  if (student.email) {
    sendMail({
      to: student.email,
      subject: `🎓 You've received a certificate — AL-Rahma Academy`,
      html: certificateIssuedEmail({
        name:  student.name,
        title: cert.title,
        number: cert.certificateNumber,
      }),
    });
  }

  res.status(201).json(cert);
});

// @desc  Student: list my certificates.
// @route GET /api/certificates/mine
// @access Private
export const getMyCertificates = asyncHandler(async (req, res) => {
  const certs = await Certificate.find({ user: req.user._id, revoked: false })
    .populate('course', 'title')
    .sort({ issuedAt: -1 })
    .lean();
  res.json(certs);
});

// @desc  Admin: list all certificates (optionally for one student).
// @route GET /api/certificates?userId=...
// @access Admin
export const listCertificates = asyncHandler(async (req, res) => {
  const filter = req.query.userId ? { user: req.query.userId } : {};
  const certs = await Certificate.find(filter)
    .populate('course', 'title')
    .sort({ issuedAt: -1 })
    .lean();
  res.json(certs);
});

// @desc  Admin: revoke a certificate.
// @route DELETE /api/certificates/:id
// @access Admin
export const revokeCertificate = asyncHandler(async (req, res) => {
  const cert = await Certificate.findByIdAndUpdate(
    req.params.id,
    { revoked: true },
    { new: true }
  );
  if (!cert) { res.status(404); throw new Error('Certificate not found'); }
  await auditFromReq(req, 'certificate.revoke', 'Certificate', cert._id, null, cert, 'warning');
  res.json({ message: 'Certificate revoked', id: cert._id });
});
