import Subscriber from '../models/Subscriber.js';
import { asyncHandler } from '../utils/asyncHandler.js';

// @route  POST /api/newsletter
// @access Public
export const subscribe = asyncHandler(async (req, res) => {
  const email = String(req.body.email ?? '').toLowerCase().trim();
  if (!email) {
    res.status(400);
    throw new Error('Email is required');
  }

  const existing = await Subscriber.findOne({ email }).lean();
  if (existing) {
    return res.status(200).json({ message: 'Already subscribed' });
  }

  await Subscriber.create({ email });
  res.status(201).json({ message: 'Subscribed successfully' });
});

// @route  GET /api/newsletter
// @access Private/Admin
export const listSubscribers = asyncHandler(async (req, res) => {
  const subscribers = await Subscriber.find().sort('-createdAt').lean();
  res.json(subscribers);
});
