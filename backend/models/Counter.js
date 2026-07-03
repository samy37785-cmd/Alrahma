import mongoose from 'mongoose';

// Atomic, monotonically-increasing sequence counters.
// Each counter has a string _id (e.g. "invoice-2025") and a seq number.
// Use Counter.nextSeq(id) to get the next value atomically.
const counterSchema = new mongoose.Schema({
  _id: { type: String },
  seq: { type: Number, default: 0 },
});

// `seed`, if given, initializes the counter to that value the first time
// it's used — safe under concurrency because $setOnInsert only takes effect
// on the single upsert that actually creates the document; callers racing
// the very first call never overwrite each other or the real increment.
// Existing callers that omit `seed` are unaffected (no-op, same as before).
counterSchema.statics.nextSeq = async function (id, seed = 0) {
  if (seed) {
    await this.findOneAndUpdate(
      { _id: id },
      { $setOnInsert: { seq: seed } },
      { upsert: true },
    );
  }
  const doc = await this.findOneAndUpdate(
    { _id: id },
    { $inc: { seq: 1 } },
    { upsert: true, new: true },
  );
  return doc.seq;
};

export default mongoose.model('Counter', counterSchema);
