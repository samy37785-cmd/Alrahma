import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { encrypt, decrypt } from '../config/encryption.js';

const BCRYPT_ROUNDS = 12;

// Every possible permission in the system
export const ALL_PERMISSIONS = [
  'users:read',   'users:write',   'users:delete',
  'courses:read', 'courses:write', 'courses:delete',
  'payments:read','payments:write','payments:refund',
  'enrollments:read','enrollments:write',
  'audit:read',
  'system:maintenance','system:kill-switch',
  // Added when blog/coupon/contact/certificate/referral/review admin
  // mutations were migrated off the legacy protect+adminOnly stack onto
  // this RBAC system — granted to admin/super-admin only, mirroring the
  // legacy stack's binary "any admin" access (no finer-grained editor/
  // viewer split existed for these resources before the migration).
  'blog:write','coupons:write','contact:write',
  'certificates:write','referrals:write','reviews:write',
];

// Default permissions bundled with each role
export const ROLE_PERMISSIONS = {
  'super-admin': ALL_PERMISSIONS,
  'admin': [
    'users:read','users:write',
    'courses:read','courses:write',
    'payments:read','payments:write',
    'enrollments:read','enrollments:write',
    'audit:read',
    'blog:write','coupons:write','contact:write',
    'certificates:write','referrals:write','reviews:write',
  ],
  'editor': [
    'courses:read','courses:write',
    'enrollments:read',
  ],
  'viewer': [
    'users:read','courses:read','payments:read',
    'enrollments:read','audit:read',
  ],
};

const adminUserSchema = new mongoose.Schema(
  {
    name:  { type: String, required: [true, 'Name is required'], trim: true },
    email: {
      type:     String,
      required: [true, 'Email is required'],
      unique:   true,
      lowercase: true,
      trim:      true,
      match: [/^\S+@\S+\.\S+$/, 'Invalid email format'],
    },
    password: {
      type:      String,
      required:  [true, 'Password is required'],
      minlength: [12, 'Password must be at least 12 characters'],
      maxlength: [72, 'Password must not exceed 72 characters'],
      select:    false,
    },
    role: {
      type:    String,
      enum:    Object.keys(ROLE_PERMISSIONS),
      default: 'viewer',
    },
    // Grants extra permissions on top of the role defaults.
    // Use to give an editor one-off payment:read without promoting them to admin.
    extraPermissions: { type: [String], enum: ALL_PERMISSIONS, default: [] },

    // TOTP MFA — secret stored AES-256-GCM encrypted
    _mfaSecret:        { type: String, default: null, select: false },
    mfaEnabled:        { type: Boolean, default: false },
    // Temporary secret during the setup flow (before first successful TOTP)
    _mfaPendingSecret: { type: String, default: null, select: false },

    // Brute-force protection — per-account lock independent of rate limiting
    failedLoginAttempts: { type: Number, default: 0 },
    lockedUntil:         { type: Date,   default: null },

    // GDPR: store anonymized IP, never raw
    lastLoginAt:  { type: Date,   default: null },
    lastLoginIp:  { type: String, default: null },

    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// ── Password hashing ────────────────────────────────────────────────────────
adminUserSchema.pre('save', async function () {
  if (!this.isModified('password')) return;
  const salt   = await bcrypt.genSalt(BCRYPT_ROUNDS);
  this.password = await bcrypt.hash(this.password, salt);
});

adminUserSchema.methods.matchPassword = function (entered) {
  return bcrypt.compare(entered, this.password);
};

// ── Permissions ─────────────────────────────────────────────────────────────
adminUserSchema.methods.getPermissions = function () {
  const base = ROLE_PERMISSIONS[this.role] ?? [];
  return [...new Set([...base, ...this.extraPermissions])];
};

adminUserSchema.methods.hasPermission = function (...perms) {
  const mine = this.getPermissions();
  return perms.every((p) => mine.includes(p));
};

// ── Encrypted TOTP secret accessors ─────────────────────────────────────────
adminUserSchema.methods.getMfaSecret = function () {
  return this._mfaSecret ? decrypt(this._mfaSecret) : null;
};
adminUserSchema.methods.setMfaSecret = function (secret) {
  this._mfaSecret = secret ? encrypt(secret) : null;
};
adminUserSchema.methods.getMfaPendingSecret = function () {
  return this._mfaPendingSecret ? decrypt(this._mfaPendingSecret) : null;
};
adminUserSchema.methods.setMfaPendingSecret = function (secret) {
  this._mfaPendingSecret = secret ? encrypt(secret) : null;
};

// ── Brute-force helpers ──────────────────────────────────────────────────────
adminUserSchema.methods.isLocked = function () {
  return !!(this.lockedUntil && new Date(this.lockedUntil) > new Date());
};

adminUserSchema.methods.incrementFailedAttempts = async function () {
  this.failedLoginAttempts += 1;
  if (this.failedLoginAttempts >= 5) {
    // Lock for 15 minutes
    this.lockedUntil = new Date(Date.now() + 15 * 60 * 1000);
  }
  await this.save({ validateBeforeSave: false });
};

adminUserSchema.methods.resetFailedAttempts = async function () {
  if (this.failedLoginAttempts === 0 && !this.lockedUntil) return;
  this.failedLoginAttempts = 0;
  this.lockedUntil         = null;
  await this.save({ validateBeforeSave: false });
};

export default mongoose.model('AdminUser', adminUserSchema);
