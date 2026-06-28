import mongoose from 'mongoose';
import { encrypt, decrypt } from '../config/encryption.js';

/**
 * Key-value store for runtime system configuration.
 * Values can be stored in plaintext or AES-256 encrypted (for secrets).
 *
 * Used by:
 *  - maintenance_mode   → "true" | "false"
 *  - financials_frozen  → "true" | "false"
 *  - (future) external API keys stored encrypted
 */
const systemConfigSchema = new mongoose.Schema(
  {
    key:        { type: String, required: true, unique: true, trim: true },
    _value:     { type: String, required: true },
    encrypted:  { type: Boolean, default: false },
    description:{ type: String, default: '' },
    updatedBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser', default: null },
  },
  { timestamps: true }
);

// ── Instance accessors ───────────────────────────────────────────────────────
systemConfigSchema.methods.getValue = function () {
  return this.encrypted ? decrypt(this._value) : this._value;
};

systemConfigSchema.methods.setValue = function (value, shouldEncrypt = false) {
  this.encrypted = shouldEncrypt;
  this._value    = shouldEncrypt ? encrypt(String(value)) : String(value);
};

// ── Static helpers ───────────────────────────────────────────────────────────
systemConfigSchema.statics.get = async function (key, defaultValue = null) {
  const doc = await this.findOne({ key });
  if (!doc) return defaultValue;
  return doc.getValue();
};

systemConfigSchema.statics.set = async function (key, value, {
  encrypt: shouldEncrypt = false,
  updatedBy   = null,
  description = '',
} = {}) {
  // findOneAndUpdate with upsert so SET is idempotent
  let doc = await this.findOne({ key });
  if (!doc) {
    doc = new this({ key, _value: '', description });
  }
  doc.setValue(value, shouldEncrypt);
  if (updatedBy)   doc.updatedBy   = updatedBy;
  if (description) doc.description = description;
  await doc.save();
  return doc;
};

export default mongoose.model('SystemConfig', systemConfigSchema);
