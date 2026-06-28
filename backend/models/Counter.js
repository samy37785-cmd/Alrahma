import mongoose from 'mongoose';

// Atomic, monotonically-increasing sequence counters.
// Each counter has a string _id (e.g. "invoice-2025") and a seq number.
// Use Counter.nextSeq(id) to get the next value atomically.
const counterSchema = new mongoose.Schema({
  _id: { type: String },
  seq: { type: Number, default: 0 },
});

counterSchema.statics.nextSeq = async function (id) {
  const doc = await this.findOneAndUpdate(
    { _id: id },
    { $inc: { seq: 1 } },
    { upsert: true, new: true },
  );
  return doc.seq;
};

export default mongoose.model('Counter', counterSchema);
