// Populates the database with sample courses + one admin user.
// Run with:  npm run seed
import dotenv from 'dotenv';
import connectDB from './config/db.js';
import Course from './models/Course.js';
import User from './models/User.js';

dotenv.config();

const courses = [
  { title: 'Quran Reading (Noorani Qaida)', icon: '📖', level: 'Beginner', description: 'Learn to read the Quran correctly from the very basics of Arabic letters and sounds.' },
  { title: 'Recitation with Tajweed', icon: '🎙️', level: 'Intermediate', description: 'Master the rules of Tajweed for beautiful and accurate Quranic recitation.' },
  { title: 'Quran Memorization (Hifz)', icon: '🧠', level: 'All levels', description: 'Structured memorization programs with revision plans for all ages.' },
  { title: 'Quran Ijazah Course', icon: '📜', level: 'Advanced', description: 'Earn a formal certification (Ijazah) with a connected chain of narration.' },
  { title: 'Islamic Studies', icon: '🕌', level: 'All levels', description: 'Learn the fundamentals of Aqeedah, Fiqh, Seerah and daily Islamic practice.' },
  { title: 'Arabic Language', icon: '🔤', level: 'All levels', description: 'Speak, read and write Modern Standard Arabic with confidence.' },
];

async function seed() {
  await connectDB();
  try {
    await Course.deleteMany();
    await Course.insertMany(courses);
    console.log(`✅ Inserted ${courses.length} courses`);

    const adminEmail = 'alrahmaacademy038@gmail.com';
    if (!(await User.findOne({ email: adminEmail }))) {
      await User.create({
        name: 'Academy Admin',
        email: adminEmail,
        password: 'admin123', // change after first login!
        role: 'admin',
      });
      console.log(`✅ Created admin: ${adminEmail} / admin123`);
    }
    console.log('🌱 Seeding done.');
  } catch (err) {
    console.error('Seed error:', err.message);
  } finally {
    process.exit();
  }
}

seed();
