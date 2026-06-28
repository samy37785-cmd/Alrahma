import Subscriber from '../models/Subscriber.js';

// @route  POST /api/newsletter
// @access Public
export async function subscribe(req, res, next) {
  try {
    const { email } = req.body;
    if (!email) {
      res.status(400);
      throw new Error('Email is required');
    }

    const existing = await Subscriber.findOne({ email });
    if (existing) {
      return res.status(200).json({ message: 'Already subscribed' });
    }

    await Subscriber.create({ email });
    res.status(201).json({ message: 'Subscribed successfully' });
  } catch (err) {
    next(err);
  }
}

// @route  GET /api/newsletter
// @access Private/Admin
export async function listSubscribers(req, res, next) {
  try {
    const subscribers = await Subscriber.find().sort('-createdAt');
    res.json(subscribers);
  } catch (err) {
    next(err);
  }
}
