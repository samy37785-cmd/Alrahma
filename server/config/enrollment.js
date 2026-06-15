import User from '../models/User.js';

// Activates a 30-day subscription for the user after a confirmed payment.
export async function enrollUser(userId, planName) {
  if (!userId) return;
  const activeSince = new Date();
  const validUntil  = new Date(activeSince);
  validUntil.setDate(validUntil.getDate() + 30);

  await User.findByIdAndUpdate(userId, {
    subscription: {
      plan:        planName,
      status:      'active',
      activeSince,
      validUntil,
    },
  });
}
