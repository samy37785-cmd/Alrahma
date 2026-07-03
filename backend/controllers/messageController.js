import Message from '../models/Message.js';
import User from '../models/User.js';
import { asyncHandler } from '../utils/asyncHandler.js';

// Returns true if `me` is allowed to message `otherId`. The only permitted
// channel is between a student and their assigned teacher (either direction).
async function canMessage(me, otherId) {
  if (String(me._id) === String(otherId)) return false;
  if (me.role === 'student') {
    return me.teacher && String(me.teacher) === String(otherId);
  }
  if (me.role === 'teacher') {
    const student = await User.findOne({ _id: otherId, teacher: me._id }).select('_id');
    return !!student;
  }
  return false; // parents/admins use their own portals, not this 1:1 channel
}

// @desc  People the caller can message, with unread counts + last message.
//        student -> their teacher; teacher -> their assigned students.
// @route GET /api/messages/contacts
// @access Private
export const getContacts = asyncHandler(async (req, res) => {
  const me = req.user;
  let contacts = [];

  if (me.role === 'student' && me.teacher) {
    const teacher = await User.findById(me.teacher).select('name email role');
    if (teacher) contacts = [teacher];
  } else if (me.role === 'teacher') {
    contacts = await User.find({ teacher: me._id }).select('name email role').sort('name');
  }

  // Attach unread count (messages they sent me, still unread) per contact.
  const withMeta = await Promise.all(
    contacts.map(async (c) => {
      const [unread, last] = await Promise.all([
        Message.countDocuments({ from: c._id, to: me._id, readAt: null }),
        Message.findOne({
          $or: [{ from: me._id, to: c._id }, { from: c._id, to: me._id }],
        }).sort('-createdAt').select('body createdAt from'),
      ]);
      return {
        _id: c._id, name: c.name, email: c.email, role: c.role,
        unread,
        lastMessage: last ? { body: last.body, createdAt: last.createdAt, mine: String(last.from) === String(me._id) } : null,
      };
    })
  );

  res.json(withMeta);
});

// @desc  Full conversation with one user; marks their messages to me as read.
// @route GET /api/messages/:userId
// @access Private
export const getConversation = asyncHandler(async (req, res) => {
  const me = req.user;
  const otherId = req.params.userId;
  if (!(await canMessage(me, otherId))) {
    res.status(403);
    throw new Error('You cannot message this user');
  }

  const messages = await Message.find({
    $or: [{ from: me._id, to: otherId }, { from: otherId, to: me._id }],
  }).sort('createdAt');

  // Mark the incoming ones as read.
  await Message.updateMany(
    { from: otherId, to: me._id, readAt: null },
    { readAt: new Date() }
  );

  res.json(messages);
});

// @desc  Send a message.
// @route POST /api/messages   { to, body }
// @access Private
export const sendMessage = asyncHandler(async (req, res) => {
  const me = req.user;
  const { to, body } = req.body;
  if (!to || !body?.trim()) {
    res.status(400);
    throw new Error('A recipient and a message are required');
  }
  if (!(await canMessage(me, to))) {
    res.status(403);
    throw new Error('You cannot message this user');
  }

  const message = await Message.create({ from: me._id, to, body: body.trim() });
  res.status(201).json(message);
});

// @desc  Total unread messages for the caller (for a nav badge).
// @route GET /api/messages/unread/count
// @access Private
export const getUnreadCount = asyncHandler(async (req, res) => {
  const unread = await Message.countDocuments({ to: req.user._id, readAt: null });
  res.json({ unread });
});
