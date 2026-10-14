import Invoice from '../models/Invoice.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { parsePagination, sendPaginated } from '../utils/pagination.js';
import { isEmailVerified } from '../utils/emailVerification.js';

// @desc  Admin: get invoices across all users (paginated)
// @route GET /api/invoices/admin?page=1&limit=50
// @access Admin
export const getAdminInvoices = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 50, maxLimit: 200 });
  const [data, total] = await Promise.all([
    Invoice.find()
      .populate('user', 'name email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Invoice.countDocuments(),
  ]);
  return sendPaginated(res, { data, total, page, limit });
});

// @desc  Get all invoices for the logged-in user
// @route GET /api/invoices
// @access Protected
// AR-02: invoices linked to the account always show; ones matched only by the
// customer email wait until the account has confirmed that address.
const ownInvoices = (user) => (isEmailVerified(user)
  ? { $or: [{ user: user._id }, { customerEmail: user.email }] }
  : { user: user._id });

export const getMyInvoices = asyncHandler(async (req, res) => {
  const invoices = await Invoice.find(ownInvoices(req.user))
    .sort({ createdAt: -1 })
    .lean();

  res.json(invoices);
});

// @desc  Get a single invoice (must belong to the logged-in user)
// @route GET /api/invoices/:id
// @access Protected
export const getInvoice = asyncHandler(async (req, res) => {
  const invoice = await Invoice.findOne({
    _id: req.params.id,
    ...ownInvoices(req.user),
  }).lean();

  if (!invoice) {
    res.status(404);
    throw new Error('Invoice not found');
  }

  res.json(invoice);
});
