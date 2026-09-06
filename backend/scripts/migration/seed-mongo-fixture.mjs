#!/usr/bin/env node
// Seeds a LOCAL MongoDB (never production) with fake fixture data for the
// Stage 2E migration rehearsal: "Mongo fixture -> Export -> Supabase local
// import -> API tests -> reconciliation". All names/emails/content below are
// synthetic, invented for this rehearsal only.
import mongoose from 'mongoose';

function assertLocalHost(uri, label) {
  const host = new URL(uri).hostname;
  if (host !== 'localhost' && host !== '127.0.0.1') {
    throw new Error(`Refusing to run: ${label} host "${host}" is not localhost/127.0.0.1.`);
  }
}

async function main() {
  const uri = process.env.MIGRATION_MONGO_URI;
  if (!uri) throw new Error('MIGRATION_MONGO_URI must be set (local-only).');
  assertLocalHost(uri, 'MIGRATION_MONGO_URI');

  await mongoose.connect(uri);
  const db = mongoose.connection;

  await db.collection('trialrequests').deleteMany({});
  await db.collection('subscribers').deleteMany({});
  await db.collection('blogs').deleteMany({});

  await db.collection('trialrequests').insertMany([
    { name: 'Fixture Student One', email: 'fixture.student1@example.test', phone: '+10000000001', course: 'Tajweed', message: 'Interested in a trial lesson.', status: 'new', createdAt: new Date() },
    { name: 'Fixture Student Two', email: 'fixture.student2@example.test', phone: '+10000000002', course: 'Hifz', message: 'Please contact me.', status: 'contacted', createdAt: new Date() },
  ]);

  await db.collection('subscribers').insertMany([
    { email: 'fixture.sub1@example.test', createdAt: new Date() },
    { email: 'fixture.sub2@example.test', createdAt: new Date() },
    { email: 'fixture.sub1@example.test', createdAt: new Date() }, // deliberate duplicate — tests idempotent import
  ]);

  await db.collection('blogs').insertMany([
    {
      title: 'Fixture Post: The Virtue of Learning Quran',
      slug: 'fixture-post-virtue-of-learning-quran',
      body: 'This is fixture content for the Stage 2E migration rehearsal only.',
      excerpt: 'Fixture excerpt.',
      category: 'quran',
      tags: ['fixture', 'rehearsal'],
      author: { name: 'Fixture Author', role: 'Teacher', image: null },
      readTime: 3,
      published: true,
      publishedAt: new Date(),
      views: 42,
      seo: { metaTitle: 'Fixture SEO Title', metaDescription: 'Fixture SEO description.' },
      createdAt: new Date(),
    },
    {
      title: 'Fixture Post: Draft Not Yet Published',
      slug: 'fixture-post-draft-not-published',
      body: 'Draft fixture content.',
      category: 'general',
      tags: ['fixture'],
      author: { name: 'Fixture Author' },
      published: false,
      views: 0,
      createdAt: new Date(),
    },
  ]);

  const counts = {
    trial_requests: await db.collection('trialrequests').countDocuments(),
    subscribers: await db.collection('subscribers').countDocuments(),
    blogs: await db.collection('blogs').countDocuments(),
  };
  console.log('[seed-mongo-fixture] seeded counts:', counts);

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('[seed-mongo-fixture] FATAL:', err.message);
  process.exitCode = 1;
});
