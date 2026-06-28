import Invoice from '../models/Invoice.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { parsePagination, sendPaginated } from '../utils/pagination.js';

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
export const getMyInvoices = asyncHandler(async (req, res) => {
  const invoices = await Invoice.find({
    $or: [
      { user: req.user._id },
      { customerEmail: req.user.email },
    ],
  })
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
    $or: [{ user: req.user._id }, { customerEmail: req.user.email }],
  }).lean();

  if (!invoice) {
    res.status(404);
    throw new Error('Invoice not found');
  }

  res.json(invoice);
});
