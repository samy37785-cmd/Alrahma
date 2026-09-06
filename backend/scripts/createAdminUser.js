// One-time operational script to provision an AdminUser account (the
// hardened, TOTP-MFA-protected account type required by /api/v1/admin/*).
// There is deliberately no HTTP self-registration endpoint for this model —
// exposing one would let anyone mint a super-admin account — so the first
// account (and any subsequent ones) must be created with direct DB access
// instead:
//
//   node scripts/createAdminUser.js --name "Jane Doe" --email jane@example.com --password 'Sup3r-Str0ng-Pass!' --role super-admin
//
// The new account has no TOTP secret yet; the first login at /admin/login
// walks through MFA setup (QR code) automatically.
import 'dotenv/config';
import mongoose from 'mongoose';
import AdminUser, { ROLE_PERMISSIONS } from '../models/AdminUser.js';

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i]?.replace(/^--/, '');
    if (key) args[key] = argv[i + 1];
  }
  return args;
}

async function main() {
  const { name, email, password, role = 'super-admin' } = parseArgs(process.argv.slice(2));

  if (!name || !email || !password) {
    console.error('Usage: node scripts/createAdminUser.js --name "Full Name" --email you@example.com --password "..." [--role super-admin|admin|editor|viewer]');
    process.exitCode = 1;
    return;
  }
  if (!Object.keys(ROLE_PERMISSIONS).includes(role)) {
    console.error(`Invalid role "${role}". Valid roles: ${Object.keys(ROLE_PERMISSIONS).join(', ')}`);
    process.exitCode = 1;
    return;
  }

  await mongoose.connect(process.env.MONGO_URI);

  try {
    const normalizedEmail = email.toLowerCase().trim();
    const existing = await AdminUser.findOne({ email: normalizedEmail });
    if (existing) {
      console.error(`An AdminUser with email ${normalizedEmail} already exists (id: ${existing._id}).`);
      process.exitCode = 1;
      return;
    }

    const admin = await AdminUser.create({ name, email: normalizedEmail, password, role });
    console.log(`Created AdminUser "${admin.email}" (role: ${admin.role}, id: ${admin._id}).`);
    console.log('Sign in at /admin/login — you will be guided through TOTP MFA setup on first login.');
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
