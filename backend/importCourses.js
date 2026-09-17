// Imports courses into MongoDB using the frontend's marketing course data as
// the single source of truth. Clears existing courses first to avoid
// duplicates. Run with:  npm run import:courses
//
// Production-readiness audit follow-up (2026-09-17): the import path this
// pointed at (../src/data.js) hasn't existed since the frontend moved under
// artifacts/al-rahma-academy — this would have thrown ERR_MODULE_NOT_FOUND
// if actually run. Fixed to point at the real current source. Unmounted
// standalone dev-tooling script (no live route ever imports this file), so
// this was never a runtime/security exposure — only a broken `npm run
// import:courses` invocation.
import dotenv from 'dotenv';
import connectDB from './config/db.js';
import Course from './models/Course.js';
import { courses as siteCourses } from '../artifacts/al-rahma-academy/src/data/marketing/courses.js';

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
