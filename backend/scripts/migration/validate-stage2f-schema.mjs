#!/usr/bin/env node
// One-off functional validation script for the Stage 2F schema (0012-0015),
// run directly against a disposable local Postgres (never production).
// Not part of any permanent test suite — a throwaway script used once to
// prove the new RLS/RPC design actually behaves as intended before building
// adapters on top of it. Safe to delete after Stage 2F is reviewed.
import pg from 'pg';

function assertLocalHost(uri) {
  const host = new URL(uri).hostname;
  if (host !== 'localhost' && host !== '127.0.0.1') throw new Error('local-only');
}

const uri = process.env.VALIDATE_DB_URL;
assertLocalHost(uri);
const pool = new pg.Pool({ connectionString: uri });

let passed = 0, failed = 0;
async function check(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  PASS  ${name}`);
  } catch (err) {
    failed++;
    console.log(`  FAIL  ${name}: ${err.message}`);
  }
}

async function asUser(userId, claims, fn, { commit = false } = {}) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL ROLE authenticated');
    await client.query('SELECT set_config($1, $2, true)', ['request.jwt.claims', JSON.stringify({ sub: userId, ...claims })]);
    const result = await fn(client);
    await client.query(commit ? 'COMMIT' : 'ROLLBACK');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

async function asSuperuser(fn) {
  const client = await pool.connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

async function main() {
  const admin = '10000000-0000-4000-8000-000000000001';
  const editor = '10000000-0000-4000-8000-000000000002';
  const student1 = '10000000-0000-4000-8000-000000000003';
  const student2 = '10000000-0000-4000-8000-000000000004';
  const teacher1 = '10000000-0000-4000-8000-000000000005';

  await asSuperuser(async (c) => {
    for (const [id, email, role] of [
      [admin, 'admin@test.local', 'admin'],
      [editor, 'editor@test.local', 'admin'],
      [student1, 'student1@test.local', 'user'],
      [student2, 'student2@test.local', 'user'],
      [teacher1, 'teacher1@test.local', 'user'],
    ]) {
      await c.query(`INSERT INTO auth.users (id, email) VALUES ($1,$2) ON CONFLICT (id) DO NOTHING`, [id, email]);
      await c.query(`INSERT INTO profiles (id, email, name, role) VALUES ($1,$2,$2,$3) ON CONFLICT (id) DO UPDATE SET role=$3`, [id, email, role]);
    }
    await c.query(`UPDATE profiles SET teacher_id = $1, referral_code = 'REFSTUDENT1' WHERE id = $2`, [teacher1, student1]);
    await c.query(`INSERT INTO admin_role_assignments (user_id, role) VALUES ($1,'admin') ON CONFLICT (user_id) DO UPDATE SET role='admin'`, [admin]);
    await c.query(`INSERT INTO admin_role_assignments (user_id, role) VALUES ($1,'editor') ON CONFLICT (user_id) DO UPDATE SET role='editor'`, [editor]);
  });

  // --- authorize() / is_super_admin_aal2() ---
  await check('authorize(): admin has courses:write, editor does not have users:read', async () => {
    const r1 = await asUser(admin, {}, (c) => c.query('SELECT authorize($1) AS ok', ['courses:write']));
    if (r1.rows[0].ok !== true) throw new Error('admin should have courses:write');
    const r2 = await asUser(editor, {}, (c) => c.query('SELECT authorize($1) AS ok', ['users:read']));
    if (r2.rows[0].ok !== false) throw new Error('editor should NOT have users:read');
  });

  await check('authorize(): a non-admin (student) has no permissions at all', async () => {
    const r = await asUser(student1, {}, (c) => c.query('SELECT authorize($1) AS ok', ['courses:read']));
    if (r.rows[0].ok !== false) throw new Error('non-admin should never pass authorize()');
  });

  await check('is_super_admin_aal2(): false for admin without super-admin role, even at aal2', async () => {
    const r = await asUser(admin, { aal: 'aal2' }, (c) => c.query('SELECT is_super_admin_aal2() AS ok'));
    if (r.rows[0].ok !== false) throw new Error('plain admin should not pass is_super_admin_aal2()');
  });

  // --- courses RLS ---
  const courseId = await asSuperuser(async (c) => {
    const r = await c.query(`INSERT INTO courses (title, description, published) VALUES ('Published Course','d',true) RETURNING id`);
    await c.query(`INSERT INTO courses (title, description, published) VALUES ('Draft Course','d',false)`);
    return r.rows[0].id;
  });

  await check('courses: anon sees only published courses', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL ROLE anon');
      const r = await client.query('SELECT title FROM courses');
      await client.query('ROLLBACK');
      const titles = r.rows.map((x) => x.title);
      if (!titles.includes('Published Course') || titles.includes('Draft Course')) {
        throw new Error(`unexpected titles: ${JSON.stringify(titles)}`);
      }
    } finally {
      client.release();
    }
  });

  await check('courses: a non-admin authenticated user cannot INSERT a course', async () => {
    let threw = false;
    try {
      await asUser(student1, {}, (c) => c.query(`INSERT INTO courses (title, description) VALUES ('hack','d')`));
    } catch {
      threw = true;
    }
    if (!threw) throw new Error('expected the insert to be rejected by RLS');
  });

  await check('courses: an AAL2 admin with courses:write CAN insert a course', async () => {
    const r = await asUser(admin, { aal: 'aal2' }, (c) =>
      c.query(`INSERT INTO courses (title, description) VALUES ('New Course','d') RETURNING id`)
    );
    if (!r.rows[0]?.id) throw new Error('expected a successful insert');
  });

  await check('courses: an AAL1 admin (no aal2 claim) CANNOT insert a course', async () => {
    let threw = false;
    try {
      await asUser(admin, {}, (c) => c.query(`INSERT INTO courses (title, description) VALUES ('aal1-hack','d')`));
    } catch {
      threw = true;
    }
    if (!threw) throw new Error('expected AAL1 admin insert to be rejected');
  });

  // --- live_classes / student_records: teacher-of relationship ---
  await check('live_classes: teacher1 can schedule a class for their own student (student1)', async () => {
    const r = await asUser(teacher1, {}, (c) =>
      c.query(`INSERT INTO live_classes (teacher_id, student_id, title, starts_at) VALUES ($1,$2,'Lesson',now()+interval '1 day') RETURNING id`, [teacher1, student1])
    );
    if (!r.rows[0]?.id) throw new Error('expected success');
  });

  await check('live_classes: teacher1 CANNOT schedule a class for student2 (not their student)', async () => {
    let threw = false;
    try {
      await asUser(teacher1, {}, (c) =>
        c.query(`INSERT INTO live_classes (teacher_id, student_id, title, starts_at) VALUES ($1,$2,'Lesson',now()+interval '1 day')`, [teacher1, student2])
      );
    } catch {
      threw = true;
    }
    if (!threw) throw new Error('expected rejection — student2 is not assigned to teacher1');
  });

  // --- messages: can_message() ---
  await check('messages: student1 can message their assigned teacher (teacher1)', async () => {
    const r = await asUser(student1, {}, (c) =>
      c.query(`INSERT INTO messages (from_user_id, to_user_id, body) VALUES ($1,$2,'hi') RETURNING id`, [student1, teacher1]),
      { commit: true }
    );
    if (!r.rows[0]?.id) throw new Error('expected success');
  });

  await check('messages: student1 CANNOT message student2 (not a student-teacher pair)', async () => {
    let threw = false;
    try {
      await asUser(student1, {}, (c) => c.query(`INSERT INTO messages (from_user_id, to_user_id, body) VALUES ($1,$2,'hi')`, [student1, student2]));
    } catch {
      threw = true;
    }
    if (!threw) throw new Error('expected rejection');
  });

  await check('messages: student2 cannot read student1<->teacher1 messages', async () => {
    const r = await asUser(student2, {}, (c) => c.query('SELECT * FROM messages'));
    if (r.rows.length !== 0) throw new Error(`expected 0 visible rows, got ${r.rows.length}`);
  });

  // --- wishlists owner isolation ---
  await check('wishlists: student2 cannot see student1\'s wishlist row', async () => {
    await asUser(student1, {}, (c) => c.query('INSERT INTO wishlists (user_id, course_id) VALUES ($1,$2)', [student1, courseId]), { commit: true });
    const r = await asUser(student2, {}, (c) => c.query('SELECT * FROM wishlists'));
    if (r.rows.length !== 0) throw new Error(`expected 0 rows visible to student2, got ${r.rows.length}`);
  });

  // --- enrollments owner-read fix ---
  await check('enrollments: a caller can read their OWN submission by email (Stage 2E gap fix)', async () => {
    await asSuperuser((c) => c.query(`INSERT INTO enrollments (name, email) VALUES ('S1','student1@test.local')`));
    const r = await asUser(student1, { email: 'student1@test.local' }, (c) => c.query('SELECT * FROM enrollments'));
    if (r.rows.length < 1) throw new Error(`expected at least 1 row, got ${r.rows.length}`);
    if (!r.rows.every((row) => row.email === 'student1@test.local')) throw new Error('a foreign enrollment leaked into the result');
  });

  // --- referrals: track_referral ---
  await check('track_referral: student2 using student1\'s code creates a referral row with referee=auth.uid()', async () => {
    const r = await asUser(student2, {}, (c) => c.query('SELECT * FROM track_referral($1)', ['REFSTUDENT1']));
    if (r.rows[0].referee_id !== student2) throw new Error('referee_id must always be the caller');
  });

  await check('track_referral: self-referral is rejected', async () => {
    let threw = false;
    try {
      await asUser(student1, {}, (c) => c.query('SELECT * FROM track_referral($1)', ['REFSTUDENT1']));
    } catch {
      threw = true;
    }
    if (!threw) throw new Error('expected self-referral to be rejected');
  });

  await check('track_referral: replaying the same code for the same user is idempotent (same row)', async () => {
    const r1 = await asUser(student2, {}, (c) => c.query('SELECT * FROM track_referral($1)', ['REFSTUDENT1']), { commit: true });
    const r2 = await asUser(student2, {}, (c) => c.query('SELECT * FROM track_referral($1)', ['REFSTUDENT1']), { commit: true });
    if (r1.rows[0].id !== r2.rows[0].id) throw new Error('expected the same referral row on replay');
  });

  // --- certificate/invoice numbering ---
  await check('next_document_number(): sequential, year-scoped, zero-padded', async () => {
    const scope = `unittest-${Date.now()}`; // unique per run — the counter is real, persistent state, not reset between runs
    const n1 = (await asSuperuser((c) => c.query('SELECT next_document_number($1,$2) AS n', [scope, 'TST']))).rows[0].n;
    const n2 = (await asSuperuser((c) => c.query('SELECT next_document_number($1,$2) AS n', [scope, 'TST']))).rows[0].n;
    if (!/^TST-\d{4}-0001$/.test(n1) || !/^TST-\d{4}-0002$/.test(n2)) {
      throw new Error(`unexpected numbers: ${n1}, ${n2}`);
    }
  });

  // --- ensure_referral_code() ---
  await check('ensure_referral_code(): generates once, idempotent on replay', async () => {
    const r1 = await asUser(student2, {}, (c) => c.query('SELECT ensure_referral_code() AS code'), { commit: true });
    const r2 = await asUser(student2, {}, (c) => c.query('SELECT ensure_referral_code() AS code'), { commit: true });
    if (!r1.rows[0].code || r1.rows[0].code !== r2.rows[0].code) {
      throw new Error(`expected a stable code, got ${r1.rows[0].code} then ${r2.rows[0].code}`);
    }
  });

  // --- student_records RLS ---
  await check('student_records: teacher1 can add a record for student1 (their own student)', async () => {
    const r = await asUser(teacher1, {}, (c) =>
      c.query(`INSERT INTO student_records (student_id, teacher_id, note) VALUES ($1,$2,'ok') RETURNING id`, [student1, teacher1])
    );
    if (!r.rows[0]?.id) throw new Error('expected success');
  });

  await check('student_records: teacher1 CANNOT add a record for student2 (not their student)', async () => {
    let threw = false;
    try {
      await asUser(teacher1, {}, (c) =>
        c.query(`INSERT INTO student_records (student_id, teacher_id, note) VALUES ($1,$2,'hack')`, [student2, teacher1])
      );
    } catch { threw = true; }
    if (!threw) throw new Error('expected rejection');
  });

  await check('student_records: a plain admin (AAL1, no AAL2) cannot add a record for an arbitrary student', async () => {
    let threw = false;
    try {
      await asUser(admin, {}, (c) =>
        c.query(`INSERT INTO student_records (student_id, teacher_id, note) VALUES ($1,$2,'hack')`, [student2, admin])
      );
    } catch { threw = true; }
    if (!threw) throw new Error('expected rejection — admin without AAL2 must not bypass is_teacher_of()');
  });

  await check('student_records: an AAL2 admin CAN add a record for an arbitrary student', async () => {
    const r = await asUser(admin, { aal: 'aal2' }, (c) =>
      c.query(`INSERT INTO student_records (student_id, teacher_id, note) VALUES ($1,$2,'admin override') RETURNING id`, [student2, admin])
    );
    if (!r.rows[0]?.id) throw new Error('expected success');
  });

  // --- contact_messages ---
  await check('contact_messages: an anonymous visitor can submit, but cannot read any of it back', async () => {
    // Two separate transactions: a permission-denied statement aborts a
    // Postgres transaction (any later COMMIT on it silently discards
    // everything, including the earlier successful INSERT) — the insert
    // must be committed on its own before the read-back is even attempted.
    const insertClient = await pool.connect();
    try {
      await insertClient.query('BEGIN');
      await insertClient.query('SET LOCAL ROLE anon');
      await insertClient.query(
        `INSERT INTO contact_messages (name, email, subject, message) VALUES ('Guest','g@test.local','Hi','Hello there')`
      );
      await insertClient.query('COMMIT');
    } finally {
      insertClient.release();
    }

    const readClient = await pool.connect();
    try {
      await readClient.query('BEGIN');
      await readClient.query('SET LOCAL ROLE anon');
      let threw = false;
      try {
        await readClient.query('SELECT * FROM contact_messages');
      } catch { threw = true; }
      await readClient.query('ROLLBACK');
      if (!threw) throw new Error('anon should have no SELECT grant on contact_messages at all');
    } finally {
      readClient.release();
    }
  });

  await check('contact_messages: an admin can read submitted messages', async () => {
    const r = await asUser(admin, {}, (c) => c.query('SELECT * FROM contact_messages'));
    if (r.rows.length < 1) throw new Error('expected the guest submission to be visible to admin');
  });

  // --- system_config_set() ---
  await check('system_config_set(): a plain admin (not super-admin) is rejected even at AAL2', async () => {
    let threw = false;
    try {
      await asUser(admin, { aal: 'aal2' }, (c) => c.query(`SELECT system_config_set('maintenance_mode','true',null)`));
    } catch { threw = true; }
    if (!threw) throw new Error('expected rejection — system_config_set requires super-admin, not just admin');
  });

  await check('system_config_set(): a super-admin at AAL2 can set and admins can read it back', async () => {
    await asSuperuser((c) =>
      c.query(`INSERT INTO admin_role_assignments (user_id, role) VALUES ($1,'super-admin') ON CONFLICT (user_id) DO UPDATE SET role='super-admin'`, [admin])
    );
    await asUser(admin, { aal: 'aal2' }, (c) => c.query(`SELECT system_config_set('maintenance_mode','true',null)`), { commit: true });
    const r = await asUser(editor, {}, (c) => c.query(`SELECT value FROM system_config WHERE key='maintenance_mode'`));
    if (r.rows[0]?.value !== 'true') throw new Error(`expected 'true', got ${r.rows[0]?.value}`);
  });

  console.log(`\n${passed}/${passed + failed} validation checks passed`);
  await pool.end();
  if (failed > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exitCode = 1;
});
