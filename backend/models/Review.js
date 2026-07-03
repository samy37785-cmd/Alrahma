import mongoose, { Types } from 'mongoose';

const reviewSchema = new mongoose.Schema(
  {
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    teacher: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    course: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Course',
    },
    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },
    title: {
      type: String,
      trim: true,
      maxlength: 120,
    },
    body: {
      type: String,
      required: true,
      trim: true,
      maxlength: 2000,
    },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
    },
    helpful: {
      type: Number,
      default: 0,
    },
    adminNote: {
      type: String,
      maxlength: 500,
    },
  },
  { timestamps: true },
);

reviewSchema.index({ teacher: 1, status: 1 });
reviewSchema.index({ course: 1, status: 1 });
reviewSchema.index({ student: 1 });

reviewSchema.statics.avgRatingForTeacher = async function (teacherId) {
  const result = await this.aggregate([
    { $match: { teacher: new Types.ObjectId(teacherId), status: 'approved' } },
    { $group: { _id: null, avg: { $avg: '$rating' }, count: { $sum: 1 } } },
  ]);
  return result[0] ?? { avg: 0, count: 0 };
};

const Review = mongoose.model('Review', reviewSchema);
export default Review;
