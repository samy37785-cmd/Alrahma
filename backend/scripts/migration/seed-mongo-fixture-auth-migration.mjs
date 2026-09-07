#!/usr/bin/env node
// Seeds a LOCAL, disposable MongoDB (never production) with synthetic
// `users`/`adminusers` fixtures for the Stage 2F real-GoTrue auth-migration
// rehearsal (rehearsal-auth-migration-real-gotrue.mjs). All emails/names
// below are invented for this rehearsal only. Deliberately includes:
//  - a duplicate-email pair within `users` (same email twice, different
//    _id) — proves migrate-users-to-supabase-auth.mjs creates exactly one
//    auth.users row, not two, for a dirty source collection.
//  - one admin with an UNMAPPED role — proves the script reports a clean
//    per-row error and creates no orphan auth.users/profiles/role-assignment
//    row for it (rollback-safety), rather than partially succeeding.
//  - admins with each of the four valid mapped roles.
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

  await db.collection('users').deleteMany({});
  await db.collection('adminusers').deleteMany({});

  await db.collection('users').insertMany([
    { name: 'Fixture User One', email: 'authmig.user1@example.test', createdAt: new Date() },
    { name: 'Fixture User Two', email: 'authmig.user2@example.test', createdAt: new Date() },
    // Deliberate duplicate email, different _id — dirty-source-data case.
    { name: 'Fixture User Three (dup A)', email: 'authmig.dup@example.test', createdAt: new Date() },
    { name: 'Fixture User Three (dup B)', email: 'authmig.dup@example.test', createdAt: new Date() },
  ]);

  await db.collection('adminusers').insertMany([
    { name: 'Fixture Super Admin', email: 'authmig.superadmin@example.test', role: 'super-admin', createdAt: new Date() },
    { name: 'Fixture Admin', email: 'authmig.admin@example.test', role: 'admin', createdAt: new Date() },
    { name: 'Fixture Editor', email: 'authmig.editor@example.test', role: 'editor', createdAt: new Date() },
    { name: 'Fixture Viewer', email: 'authmig.viewer@example.test', role: 'viewer', createdAt: new Date() },
    // Deliberate unmapped role — must error cleanly, no orphan rows.
    { name: 'Fixture Bad Role Admin', email: 'authmig.badrole@example.test', role: 'super-duper-admin', createdAt: new Date() },
  ]);

  console.log(JSON.stringify({
    users: await db.collection('users').countDocuments(),
    adminusers: await db.collection('adminusers').countDocuments(),
  }));

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('[seed-mongo-fixture-auth-migration] FAILED:', err);
  process.exitCode = 1;
});
