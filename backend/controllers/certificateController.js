import Certificate from '../models/Certificate.js';
import User from '../models/User.js';
import { sendMail } from '../config/mailer.js';
import { certificateIssuedEmail } from '../config/emailTemplates.js';

// @desc  Admin/teacher: issue a certificate to a student.
// @route POST /api/certificates
// @body  { userId, type, title, course?, grade?, notes? }
// @access Admin
export async function issueCertificate(req, res, next) {
  try {
    const { userId, type = 'completion', title, course, grade, notes } = req.body;
    if (!userId || !title) {
      res.status(400);
      throw new Error('Student and certificate title are required');
    }

    const student = await User.findById(userId);
    if (!student) { res.status(404); throw new Error('Student not found'); }

    const cert = await Certificate.create({
      user:        student._id,
      studentName: student.name,
      type,
      title,
      course:      course || undefined,
      grade,
      notes,
      issuedBy:    req.user?.name || 'AL-Rahma Academy',
    });

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
  } catch (err) {
    next(err);
  }
}

// @desc  Student: list my certificates.
// @route GET /api/certificates/mine
// @access Private
export async function getMyCertificates(req, res, next) {
  try {
    const certs = await Certificate.find({ user: req.user._id, revoked: false })
      .populate('course', 'title')
      .sort({ issuedAt: -1 });
    res.json(certs);
  } catch (err) {
    next(err);
  }
}

// @desc  Admin: list all certificates (optionally for one student).
// @route GET /api/certificates?userId=...
// @access Admin
export async function listCertificates(req, res, next) {
  try {
    const filter = req.query.userId ? { user: req.query.userId } : {};
    const certs = await Certificate.find(filter)
      .populate('course', 'title')
      .sort({ issuedAt: -1 });
    res.json(certs);
  } catch (err) {
    next(err);
  }
}

// @desc  Admin: revoke a certificate.
// @route DELETE /api/certificates/:id
// @access Admin
export async function revokeCertificate(req, res, next) {
  try {
    const cert = await Certificate.findByIdAndUpdate(
      req.params.id,
      { revoked: true },
      { new: true }
    );
    if (!cert) { res.status(404); throw new Error('Certificate not found'); }
    res.json({ message: 'Certificate revoked', id: cert._id });
  } catch (err) {
    next(err);
  }
}
