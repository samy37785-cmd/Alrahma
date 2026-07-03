// Updates the `resources` field of existing course documents IN PLACE,
// matching by title, using the links defined in the frontend's data.js.
// Nothing is deleted — only the resources array is set.
// Run with:  npm run update:resources
import dotenv from 'dotenv';
import connectDB from './config/db.js';
import Course from './models/Course.js';
import { courses as siteCourses } from '../src/data.js';

dotenv.config();

async function updateResources() {
  await connectDB();
  try {
    // Only courses that actually define resources in data.js.
    const withLinks = siteCourses.filter((c) => c.resources?.length);

    for (const c of withLinks) {
      const updated = await Course.findOneAndUpdate(
        { title: c.title },                 // find the document by title
        { $set: { resources: c.resources } }, // set its resources array
        { new: true }                       // return the updated doc
      );
      if (updated) {
        console.log(`✅ ${updated.title}: ${updated.resources.length} resources set`);
      } else {
        console.log(`⚠️  Not found in DB (skipped): ${c.title}`);
      }
    }
    console.log('Done.');
  } catch (err) {
    console.error('❌ Update error:', err.message);
  } finally {
    process.exit();
  }
}

updateResources();
