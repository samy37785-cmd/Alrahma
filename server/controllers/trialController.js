import TrialRequest from '../models/TrialRequest.js';

// @desc   Submit a free-trial request (from the React form)
// @route  POST /api/trials
// @access Public
export async function createTrial(req, res, next) {
  try {
    const { name, email, phone, course, message } = req.body;
    if (!name || !email) {
      res.status(400);
      throw new Error('Name and email are required');
    }
    const trial = await TrialRequest.create({ name, email, phone, course, message });
    res.status(201).json({ message: 'Trial request received', trial });
  } catch (err) {
    next(err);
  }
}

// @desc   List all trial requests (for the admin dashboard)
// @route  GET /api/trials
// @access Private/Admin
export async function getTrials(req, res, next) {
  try {
    const trials = await TrialRequest.find().sort('-createdAt');
    res.json(trials);
  } catch (err) {
    next(err);
  }
}
