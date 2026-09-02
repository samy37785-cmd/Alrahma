/*
 * Single source for owner-confirmed academy facts (Content Truth Contract,
 * dated 2026-09-02). These are cumulative/static figures the owner
 * confirmed directly — never "live" or real-time counts, never derived
 * from lesson/review logs in this repo. Do not duplicate these numbers as
 * separate literals elsewhere; import this module and interpolate the
 * value into locale-specific copy instead.
 *
 * Do not add secrets, operational data, or a street/postal address here —
 * the owner confirmed the address must not be displayed publicly.
 */
export const siteFacts = {
  totalLessons: '15,000+',
  totalStudents: '1,500+',
  totalFamilies: '1,200+',
  totalTeachers: 30,
  featuredTeacherCount: 11,
  countriesServed: 10,
  academyRating: 4.9,
  academyRatingOutOf: 5,
  supportResponseHours: 24,
  freeTrialLessons: 1,
  trialLessonMinutes: 60,
  refundWindowDays: 24,
  standardWeeklyHours: 2,
  premiumWeeklyHours: 4,
  founder: 'Mahmoud Samy',
  foundingYear: '2020',
  phoneDisplay: '+20 101 605 4663',
};
