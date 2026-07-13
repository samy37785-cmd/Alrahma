import { asyncHandler } from '../utils/asyncHandler.js';
import { handleValidationErrors } from '../utils/validationHelper.js';
import { parsePagination } from '../utils/pagination.js';
import { contactAdminEmail } from '../config/emailTemplates.js';
import ContactMessage from '../models/ContactMessage.js';
import { sendMail } from '../config/mailer.js';
import { auditFromReq } from '../services/auditService.js';
import logger from '../config/logger.js';


export const submitContact = asyncHandler(async (req, res) => {
  if (handleValidationErrors(req, res)) return;

  const { name, email, phone, subject, message } = req.body;

  const ip = req.ip?.replace(/^::ffff:/, '') ?? null;
  const contact = await ContactMessage.create({
    name, email, phone, subject, message,
    ipAddress: ip,
  });

  const adminEmail = process.env.ADMIN_EMAIL || process.env.EMAIL_FROM;
  if (adminEmail) {
    try {
      await sendMail({
        to: adminEmail,
        subject: `[Contact] ${subject}`,
        html: contactAdminEmail({ name, email, phone, subject, message }),
      });
    } catch (err) {
      logger.warn('Contact notification email failed', { error: err.message });
    }
  }

  res.status(201).json({ message: 'Message received. We will get back to you soon.', id: contact._id });
});

export const getContacts = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 20, maxLimit: 50 });
  const status = req.query.status;

  const filter = status ? { status } : {};
  const [contacts, total] = await Promise.all([
    ContactMessage.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    ContactMessage.countDocuments(filter),
  ]);

  res.json({ contacts, total, page, pages: Math.ceil(total / limit) });
});

export const updateContactStatus = asyncHandler(async (req, res) => {
  if (handleValidationErrors(req, res)) return;

  const { status, adminNote } = req.body;
  const contact = await ContactMessage.findByIdAndUpdate(
    req.params.id,
    {
      ...(status && { status }),
      ...(adminNote !== undefined && { adminNote }),
      ...(status === 'resolved' && { repliedAt: new Date() }),
    },
    { new: true, runValidators: true },
  );
  if (!contact) return res.status(404).json({ message: 'Contact message not found' });
  await auditFromReq(req, 'contact.status.update', 'ContactMessage', contact._id, null, contact, 'info');
  res.json({ contact });
});
