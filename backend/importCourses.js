// Imports courses into MongoDB using the frontend's data.js as the single
// source of truth. Clears existing courses first to avoid duplicates.
// Run with:  npm run import:courses
import dotenv from 'dotenv';
import connectDB from './config/db.js';
import Course from './models/Course.js';
import { courses as siteCourses } from '../src/data.js';

dotenv.config();

// Map the frontend shape { media, title, text } to the DB model shape.
function toCourseDoc(c) {
  return {
    title: c.title,
    description: c.text,
    icon: c.media,
    level: c.level || 'All levels',
    resources: c.resources || [],
    published: true,
  };
}

async function importCourses() {
  await connectDB();
  try {
    const docs = siteCourses.map(toCourseDoc);
    await Course.deleteMany();                 // wipe old/duplicate entries
    const inserted = await Course.insertMany(docs);
    console.log(`✅ Imported ${inserted.length} courses from src/data.js`);
    inserted.forEach((c) => console.log(`   ${c.icon}  ${c.title}`));
  } catch (err) {
    console.error('❌ Import error:', err.message);
  } finally {
    process.exit();
  }
}

importCourses();
