import { asyncHandler } from '../utils/asyncHandler.js';
import { parsePagination } from '../utils/pagination.js';
import Notification from '../models/Notification.js';

export const getMyNotifications = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 20, maxLimit: 50 });

  const filter = { recipient: req.user._id };
  if (req.query.unread === 'true') filter.read = false;

  const [notifications, total, unreadCount] = await Promise.all([
    Notification.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Notification.countDocuments(filter),
    Notification.countDocuments({ recipient: req.user._id, read: false }),
  ]);

  res.json({ notifications, total, unreadCount, page, pages: Math.ceil(total / limit) });
});

export const markRead = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const notification = await Notification.findOneAndUpdate(
    { _id: id, recipient: req.user._id },
    { read: true },
    { new: true },
  );
  if (!notification) return res.status(404).json({ message: 'Notification not found' });
  res.json({ notification });
});

export const markAllRead = asyncHandler(async (req, res) => {
  await Notification.updateMany({ recipient: req.user._id, read: false }, { read: true });
  res.json({ message: 'All notifications marked as read' });
});

export const deleteNotification = asyncHandler(async (req, res) => {
  const notification = await Notification.findOneAndDelete({
    _id: req.params.id,
    recipient: req.user._id,
  });
  if (!notification) return res.status(404).json({ message: 'Notification not found' });
  res.json({ message: 'Notification deleted' });
});

export const getUnreadCount = asyncHandler(async (req, res) => {
  const count = await Notification.countDocuments({ recipient: req.user._id, read: false });
  res.json({ count });
});

export async function createNotification({ recipient, type, title, body, link, data }) {
  return Notification.create({ recipient, type, title, body, link, data });
}
