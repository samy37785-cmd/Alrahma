import Invoice from '../models/Invoice.js';

// @desc  Admin: get ALL invoices across all users
// @route GET /api/invoices/admin
// @access Admin
export async function getAdminInvoices(req, res, next) {
  try {
    const invoices = await Invoice.find()
      .populate('user', 'name email')
      .sort({ createdAt: -1 });
    res.json(invoices);
  } catch (err) {
    next(err);
  }
}

// @desc  Get all invoices for the logged-in user
// @route GET /api/invoices
// @access Protected
export async function getMyInvoices(req, res, next) {
  try {
    const invoices = await Invoice.find({
      $or: [
        { user: req.user._id },
        { customerEmail: req.user.email },
      ],
    }).sort({ createdAt: -1 });

    res.json(invoices);
  } catch (err) {
    next(err);
  }
}

// @desc  Get a single invoice (must belong to the logged-in user)
// @route GET /api/invoices/:id
// @access Protected
export async function getInvoice(req, res, next) {
  try {
    const invoice = await Invoice.findOne({
      _id: req.params.id,
      $or: [{ user: req.user._id }, { customerEmail: req.user.email }],
    });

    if (!invoice) {
      res.status(404);
      throw new Error('Invoice not found');
    }

    res.json(invoice);
  } catch (err) {
    next(err);
  }
}
