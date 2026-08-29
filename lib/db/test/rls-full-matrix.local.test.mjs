// RLS Remediation Round 2 (finding 4): a systematic sweep of the RLS
// matrix (docs/rls-matrix.md) — every ✓ cell gets a real positive
// assertion, every ✗ cell that sits at a meaningful boundary (adjacent to
// a ✓, or one of Round 2's specific forgery/bypass vectors) gets a real
// negative assertion, and a blanket-denied role with no boundary nearby
// (e.g. anon on a fully admin/service-only table) gets one representative
// assertion per table rather than one per exact operation — a deliberate
// scoping choice, not a silent narrowing (see the plan this file was
// written against). This file complements, not replaces,
// rls.local.test.mjs, which already covers the specific findings in
// depth (RPC-bypass closure, forgery prevention, concurrency); this file
// is the standalone table-by-table sweep.
//
// Precision note repeated throughout: an INSERT whose WITH CHECK fails
// raises a hard error ("new row violates row-level security policy");
// an UPDATE/DELETE whose USING excludes every target row just silently
// affects 0 rows, no error. A GRANT-layer denial (no privilege at all)
// is a distinct third failure mode ("permission denied for table/
// function ..."), checked before RLS is even evaluated. Each assertion
// below expects the SPECIFIC failure mode Round 2's design intends, not
// just "some rejection happened."
import pg from "pg";
import crypto from "node:crypto";
import { createRlsHarness, requireLocalTestDatabaseUrl } from "./rls-helpers.mjs";

const connectionString = requireLocalTestDatabaseUrl();
const client = new pg.Client({ connectionString });
const { test, assert, expectReject, asSuperuser, asAnon, asUser, asService, report } = createRlsHarness(client);

async function main() {
  await client.connect();

  const userAId = crypto.randomUUID();
  const userBId = crypto.randomUUID();
  const adminId = crypto.randomUUID();
  let planId, inactivePlanId, chargeId, subscriptionId, manualPaymentId, invoiceId;
  let couponId, blogId, draftBlogId, testimonialId, draftTestimonialId;
  let enrollmentId, trialRequestId, subscriberId, notificationId, notifPrefUserId;
  let providerEventId, auditLogId;

  await test("seed: all fixtures", async () => {
    await asSuperuser();
    for (const [id, name] of [[userAId, "Matrix A"], [userBId, "Matrix B"], [adminId, "Matrix Admin"]]) {
      await client.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3::jsonb);`,
        [id, `${id}@example.test`, JSON.stringify({ name })]);
    }
    await client.query(`update public.profiles set role = 'admin' where id = $1;`, [adminId]);

    planId = (await client.query(
      `insert into public.plans (slug, name, amount_minor, currency, active) values ('matrix-plan', 'Matrix Plan', 4000, 'EUR', true) returning id;`,
    )).rows[0].id;
    inactivePlanId = (await client.query(
      `insert into public.plans (slug, name, amount_minor, currency, active) values ('matrix-plan-inactive', 'Matrix Plan Inactive', 4000, 'EUR', false) returning id;`,
    )).rows[0].id;

    chargeId = (await client.query(
      `insert into public.payments (user_id, plan_id, amount_minor, gateway) values ($1, $2, 4000, 'stripe') returning id;`,
      [userAId, planId],
    )).rows[0].id;
    await client.query(`update public.payments set status = 'succeeded' where id = $1;`, [chargeId]);

    subscriptionId = (await client.query(
      `insert into public.subscriptions (user_id, plan_id, provider, status, provider_customer_id, current_period_start, current_period_end) values ($1, $2, 'stripe', 'active', 'cus_matrix', now(), now() + interval '30 days') returning id;`,
      [userAId, planId],
    )).rows[0].id;

    manualPaymentId = (await client.query(
      `insert into public.manual_payments (user_id, amount_minor, method) values ($1, 3000, 'bank') returning id;`,
      [userAId],
    )).rows[0].id;

    // RLS Remediation Round 3 (Section D): raw INSERT into invoices is
    // gone — issue_invoice_from_payment() is now the only real issuance
    // path, so even fixture seeding goes through it (service_role, same
    // as the other service-only fixtures below).
    await asService();
    invoiceId = (await client.query(
      `select * from public.issue_invoice_from_payment($1);`,
      [chargeId],
    )).rows[0].id;
    await asSuperuser();

    couponId = (await client.query(
      `insert into public.coupons (code, type, value, discount_scope) values ('MATRIX10', 'percent', 10, 'first_payment_only') returning id;`,
    )).rows[0].id;
    await client.query(`insert into public.coupon_redemptions (coupon_id, user_id) values ($1, $2);`, [couponId, userAId]);

    blogId = (await client.query(
      `insert into public.blogs (title, slug, content, published, published_at) values ('Published', 'matrix-published', 'x', true, now()) returning id;`,
    )).rows[0].id;
    draftBlogId = (await client.query(
      `insert into public.blogs (title, slug, content, published) values ('Draft', 'matrix-draft', 'x', false) returning id;`,
    )).rows[0].id;

    testimonialId = (await client.query(
      `insert into public.testimonials (author_name, quote, published) values ('Author', 'Great!', true) returning id;`,
    )).rows[0].id;
    draftTestimonialId = (await client.query(
      `insert into public.testimonials (author_name, quote, published) values ('Author2', 'Draft quote', false) returning id;`,
    )).rows[0].id;

    enrollmentId = (await client.query(
      `insert into public.enrollments (name, email, times, subjects) values ('Matrix Lead', 'matrix-lead@example.test', '[]'::jsonb, '[]'::jsonb) returning id;`,
    )).rows[0].id;
    trialRequestId = (await client.query(
      `insert into public.trial_requests (name, email) values ('Matrix Trial', 'matrix-trial@example.test') returning id;`,
    )).rows[0].id;
    subscriberId = (await client.query(
      `insert into public.subscribers (email) values ('matrix-sub@example.test') returning id;`,
    )).rows[0].id;

    notificationId = (await client.query(
      `insert into public.notifications (user_id, type, title) values ($1, 'admin_announcement', 'Matrix Notif') returning id;`,
      [userAId],
    )).rows[0].id;

    notifPrefUserId = userAId;

    providerEventId = (await client.query(
      `insert into public.provider_events (provider, provider_event_id, event_type, payload_hash) values ('stripe', 'evt_matrix_1', 'payment_intent.succeeded', 'hashmatrix1') returning id;`,
    )).rows[0].id;

    const auditRes = await client.query(
      `insert into public.admin_audit_log (actor_admin_id, action, resource_type, resource_id) values ($1, 'matrix_seed', 'profiles', $2) returning id;`,
      [adminId, adminId],
    );
    auditLogId = auditRes.rows[0].id;
  });

  // ===================================================================
  // 1. profiles — docs/rls-matrix.md row 1.
  // ===================================================================
  await test("[profiles] owner SELECT own row, not another's", async () => {
    await asUser(userAId);
    const own = await client.query(`select * from public.profiles where id = $1;`, [userAId]);
    assert(own.rows.length === 1);
    const other = await client.query(`select * from public.profiles where id = $1;`, [userBId]);
    assert(other.rows.length === 0);
  });
  await test("[profiles] admin (AAL1) SELECT any row", async () => {
    await asUser(adminId, "aal1");
    const { rows } = await client.query(`select * from public.profiles where id = $1;`, [userBId]);
    assert(rows.length === 1);
  });
  await test("[profiles] anon SELECT denied at the GRANT layer", async () => {
    await asAnon();
    await expectReject(() => client.query(`select * from public.profiles;`));
  });
  await test("[profiles] authenticated raw INSERT denied at the GRANT layer (handle_new_user trigger is the only writer)", async () => {
    await asUser(userAId);
    await expectReject(() => client.query(`insert into public.profiles (id, email, role) values (gen_random_uuid(), 'x@example.test', 'user');`));
  });
  await test("[profiles] owner raw UPDATE denied at the GRANT layer (update_own_profile_name() RPC is the only writer)", async () => {
    await asUser(userAId);
    await expectReject(() => client.query(`update public.profiles set name = 'x' where id = $1;`, [userAId]));
  });
  await test("[profiles] owner raw DELETE denied at the GRANT layer", async () => {
    await asUser(userAId);
    await expectReject(() => client.query(`delete from public.profiles where id = $1;`, [userAId]));
  });
  await test("[profiles] service_role SELECT any row (bypass)", async () => {
    await asService();
    const { rows } = await client.query(`select * from public.profiles where id = $1;`, [userBId]);
    assert(rows.length === 1);
  });

  // ===================================================================
  // 2-4. quran_bookmarks / quran_reading_progress / quran_memorization_stats
  // — docs/rls-matrix.md rows 2-4. quran_bookmarks itself gets deep
  // coverage in rls.local.test.mjs; these two get the representative pass.
  // ===================================================================
  for (const t of ["quran_reading_progress", "quran_memorization_stats"]) {
    await test(`[${t}] owner INSERT/SELECT/UPDATE own row (singleton, PK=user_id)`, async () => {
      await asUser(userAId);
      await client.query(`insert into public.${t} (user_id) values ($1);`, [userAId]);
      const sel = await client.query(`select * from public.${t} where user_id = $1;`, [userAId]);
      assert(sel.rows.length === 1);
      await client.query(`update public.${t} set streak = 3 where user_id = $1;`, [userAId]);
      const upd = await client.query(`select streak from public.${t} where user_id = $1;`, [userAId]);
      assert(Number(upd.rows[0].streak) === 3);
    });
    await test(`[${t}] another user cannot see or insert-on-behalf-of user A's row`, async () => {
      await asUser(userBId);
      const sel = await client.query(`select * from public.${t} where user_id = $1;`, [userAId]);
      assert(sel.rows.length === 0);
      await expectReject(() => client.query(`insert into public.${t} (user_id) values ($1);`, [userAId]));
    });
    await test(`[${t}] admin CAN read (support), but has no write policy at all`, async () => {
      await asUser(adminId, "aal1");
      const sel = await client.query(`select * from public.${t} where user_id = $1;`, [userAId]);
      assert(sel.rows.length === 1);
      const del = await client.query(`delete from public.${t} where user_id = $1 returning user_id;`, [userAId]);
      assert(del.rows.length === 0, "admin DELETE should affect 0 rows — no admin write policy exists");
    });
  }

  // ===================================================================
  // 5. enrollments — docs/rls-matrix.md row 5. Guest-INSERT forgery
  // already covered in rls.local.test.mjs; this fills in the admin
  // UPDATE/DELETE AAL1-vs-AAL2 boundary.
  // ===================================================================
  await test("[enrollments] a plain authenticated (non-admin) session sees 0 rows", async () => {
    await asUser(userAId);
    const { rows } = await client.query(`select * from public.enrollments;`);
    assert(rows.length === 0);
  });
  await test("[enrollments] admin AAL1 UPDATE/DELETE affect 0 rows (need AAL2); AAL2 succeeds", async () => {
    await asUser(adminId, "aal1");
    const upd1 = await client.query(`update public.enrollments set status = 'contacted' where id = $1 returning id;`, [enrollmentId]);
    assert(upd1.rows.length === 0);

    await asUser(adminId, "aal2");
    const upd2 = await client.query(`update public.enrollments set status = 'contacted' where id = $1 returning status;`, [enrollmentId]);
    assert(upd2.rows.length === 1 && upd2.rows[0].status === "contacted");

    await asUser(adminId, "aal1");
    const del1 = await client.query(`delete from public.enrollments where id = $1 returning id;`, [enrollmentId]);
    assert(del1.rows.length === 0);
  });

  // ===================================================================
  // 6. plans — docs/rls-matrix.md row 6.
  // ===================================================================
  await test("[plans] anon SELECT active plan, not the inactive one", async () => {
    await asAnon();
    const active = await client.query(`select * from public.plans where id = $1;`, [planId]);
    assert(active.rows.length === 1);
    const inactive = await client.query(`select * from public.plans where id = $1;`, [inactivePlanId]);
    assert(inactive.rows.length === 0);
  });
  await test("[plans] admin AAL1 CAN see the inactive plan too", async () => {
    await asUser(adminId, "aal1");
    const { rows } = await client.query(`select * from public.plans where id = $1;`, [inactivePlanId]);
    assert(rows.length === 1);
  });
  // RLS Remediation Round 3 (Section E): plans_insert_admin_aal2 and
  // plans_update_admin_aal2 (the raw admin policies) are BOTH gone —
  // raw INSERT/UPDATE on plans is now denied at the GRANT layer for
  // EVERY authenticated caller, AAL1 or AAL2 alike (a stronger, earlier
  // denial than "RLS lets AAL2 through" — there is no raw path left at
  // all any more). create_plan_version()/deactivate_plan()/
  // admin_update_plan_display() are the only real write paths now, and
  // ARE where the real AAL1-vs-AAL2 boundary lives.
  await test("[plans] raw INSERT/UPDATE denied at the GRANT layer for AAL1 AND AAL2 admin alike — no raw path exists any more", async () => {
    await asUser(adminId, "aal1");
    await expectReject(
      () => client.query(`insert into public.plans (slug, name, amount_minor, currency) values ('matrix-plan-2', 'X', 1000, 'EUR');`),
      { sqlState: "42501", messageIncludes: "permission denied" },
    );
    await asUser(adminId, "aal2");
    await expectReject(
      () => client.query(`insert into public.plans (slug, name, amount_minor, currency) values ('matrix-plan-2', 'X', 1000, 'EUR');`),
      { sqlState: "42501", messageIncludes: "permission denied" },
    );
    await expectReject(
      () => client.query(`update public.plans set display_order = 9 where id = $1;`, [planId]),
      { sqlState: "42501", messageIncludes: "permission denied" },
    );
  });

  let newVersionPlanId;
  await test("[plans] create_plan_version(): AAL1 rejected; AAL2 creates a new version, deactivates the old row", async () => {
    await asUser(adminId, "aal1");
    await expectReject(
      () => client.query(
        `select * from public.create_plan_version($1, null, 'Matrix Plan', 4500, 'EUR', null, null, null, null, null, null, 0);`,
        [planId],
      ),
      { sqlState: "P0001", messageIncludes: "is not an AAL2-verified admin" },
    );

    await asUser(adminId, "aal2");
    const versioned = await client.query(
      `select * from public.create_plan_version($1, null, 'Matrix Plan', 4500, 'EUR', null, null, null, null, null, null, 0);`,
      [planId],
    );
    assert(versioned.rows[0].active === true && Number(versioned.rows[0].amount_minor) === 4500, "the new version should be active with the new price");
    newVersionPlanId = versioned.rows[0].id;

    await asSuperuser();
    const oldRow = await client.query(`select active, amount_minor from public.plans where id = $1;`, [planId]);
    assert(oldRow.rows[0].active === false, "the old row must be deactivated");
    assert(Number(oldRow.rows[0].amount_minor) === 4000, "the old row's price must be UNCHANGED — immutability held even through versioning");
  });

  await test("[plans] enforce_plan_immutability(): changing price on an OLD (already-superseded) row is rejected even for service_role", async () => {
    await asService();
    await expectReject(
      () => client.query(`update public.plans set amount_minor = 1 where id = $1;`, [planId]),
      { sqlState: "P0001", messageIncludes: "amount_minor cannot be changed" },
      "no role, not even service_role, may change amount_minor on an existing plan row",
    );
  });

  await test("[plans] deactivate_plan() / admin_update_plan_display(): AAL2 only, audited", async () => {
    await asUser(adminId, "aal2");
    const disp = await client.query(`select * from public.admin_update_plan_display($1, 3);`, [newVersionPlanId]);
    assert(disp.rows[0].display_order === 3);

    const deactivated = await client.query(`select * from public.deactivate_plan($1);`, [newVersionPlanId]);
    assert(deactivated.rows[0].active === false);

    const audit = await client.query(
      `select count(*)::int as n from public.admin_audit_log where action in ('create_plan_version', 'deactivate_plan', 'admin_update_plan_display') and resource_id = $1;`,
      [newVersionPlanId],
    );
    assert(audit.rows[0].n >= 2, `expected at least 2 audit rows for this plan (deactivate + display update), got ${audit.rows[0].n}`);
  });

  await test("[plans] a race between two create_plan_version() calls on the same old row produces exactly one new active version", async () => {
    await asSuperuser();
    const racePlan = (await client.query(
      `insert into public.plans (slug, name, amount_minor, currency, active) values ('matrix-race-plan', 'Race Plan', 1000, 'EUR', true) returning id;`,
    )).rows[0].id;

    const race = new pg.Client({ connectionString });
    await race.connect();
    try {
      await Promise.all([client.query(`set role authenticated;`), race.query(`set role authenticated;`)]);
      await Promise.all([
        client.query(`select set_config('request.jwt.claims', $1, false);`, [JSON.stringify({ sub: adminId, aal: "aal2" })]),
        race.query(`select set_config('request.jwt.claims', $1, false);`, [JSON.stringify({ sub: adminId, aal: "aal2" })]),
      ]);
      const attempt = (conn) =>
        conn
          .query(
            `select * from public.create_plan_version($1, null, 'Race Plan', 1100, 'EUR', null, null, null, null, null, null, 0);`,
            [racePlan],
          )
          .then(() => "ok", () => "rejected");
      const [a, b] = await Promise.all([attempt(client), attempt(race)]);
      assert((a === "ok") !== (b === "ok"), `expected exactly one winner, got a=${a} b=${b}`);

      await asSuperuser();
      const activeCount = await client.query(`select count(*)::int as n from public.plans where slug = 'matrix-race-plan' and active = true;`);
      assert(activeCount.rows[0].n === 1, `expected exactly 1 active version, got ${activeCount.rows[0].n}`);
    } finally {
      await race.end();
      await asSuperuser();
    }
  });

  // -------------------------------------------------------------------
  // RLS Remediation Round 4: a real bug a fresh review found in Round
  // 3's own create_plan_version() — the NULL-old-id ("brand new plan")
  // branch had no check that p_slug already had history, so a slug
  // whose only active row was retired via deactivate_plan() (a
  // deliberate, separate action from versioning) could be "recreated"
  // as a second, unrelated version-1 row under the exact same slug.
  // -------------------------------------------------------------------
  let retiredSlugPlanId;
  await test("[plans] create_plan_version(NULL, ...) is rejected for a slug with any existing history — the Round 4 duplicate-version fix", async () => {
    await asSuperuser();
    retiredSlugPlanId = (await client.query(
      `insert into public.plans (slug, name, amount_minor, currency, active) values ('matrix-retired-plan', 'Retired Plan', 2000, 'EUR', true) returning id;`,
    )).rows[0].id;

    await asUser(adminId, "aal2");
    await client.query(`select * from public.deactivate_plan($1);`, [retiredSlugPlanId]);

    // The slug now has exactly one row, and it's inactive — exactly the
    // state that used to let the NULL branch silently mint a duplicate
    // "version 1".
    await expectReject(
      () => client.query(
        `select * from public.create_plan_version(null, 'matrix-retired-plan', 'Retired Plan Reborn', 2500, 'EUR', null, null, null, null, null, null, 0);`,
      ),
      { sqlState: "P0001", messageIncludes: "already has plan history" },
      "creating a 'brand new' plan under a slug with existing (even fully inactive) history must be rejected",
    );

    // The correct path — versioning the existing row via p_old_plan_id,
    // even though it's currently inactive — still works (Round 4 also
    // relaxed the old "old_row.active" requirement to "old_row is the
    // latest version for its slug", so a fully-retired slug can still be
    // revived, just never re-created from scratch).
    const revived = await client.query(
      `select * from public.create_plan_version($1, null, 'Retired Plan Reborn', 2500, 'EUR', null, null, null, null, null, null, 0);`,
      [retiredSlugPlanId],
    );
    assert(
      revived.rows[0].active === true && revived.rows[0].slug === "matrix-retired-plan" && Number(revived.rows[0].version) === 2,
      `expected an active version 2 under the same slug, got active=${revived.rows[0].active} slug=${revived.rows[0].slug} version=${revived.rows[0].version}`,
    );

    await asSuperuser();
    const dup = await client.query(`select count(*)::int as n from public.plans where slug = 'matrix-retired-plan' and version = 1;`);
    assert(dup.rows[0].n === 1, `expected exactly 1 row at slug=matrix-retired-plan version=1 (no duplicate minted), got ${dup.rows[0].n}`);
  });

  await test("[plans] create_plan_version() rejects an old_plan_id that isn't the latest version for its slug — can't fork a stale version", async () => {
    await asUser(adminId, "aal2");
    await expectReject(
      () => client.query(
        // retiredSlugPlanId is now version 1, superseded by version 2 above.
        `select * from public.create_plan_version($1, null, 'Should Not Exist', 1, 'EUR', null, null, null, null, null, null, 0);`,
        [retiredSlugPlanId],
      ),
      { sqlState: "P0001", messageIncludes: "is not the latest version" },
      "forking a new version from an already-superseded old row must be rejected",
    );
  });

  await test("[plans] anon/authenticated see only active plans — a superseded (inactive) version is invisible to the public", async () => {
    await asAnon();
    const { rows } = await client.query(`select * from public.plans where id = $1;`, [planId]);
    assert(rows.length === 0, "the deactivated old plan row must not be visible to anon");
  });

  // ===================================================================
  // 7. subscriptions — docs/rls-matrix.md row 7. AAL1/AAL2 boundary
  // already covered in rls.local.test.mjs; this fills in owner/other and
  // the missing INSERT/DELETE grant boundary.
  // ===================================================================
  await test("[subscriptions] owner SELECT own, not another's", async () => {
    await asUser(userAId);
    const own = await client.query(`select * from public.subscriptions where id = $1;`, [subscriptionId]);
    assert(own.rows.length === 1);
    await asUser(userBId);
    const other = await client.query(`select * from public.subscriptions where id = $1;`, [subscriptionId]);
    assert(other.rows.length === 0);
  });
  // RLS Remediation Round 3 (Section C/G): direct ACL check found the
  // INSERT half of this was NEVER actually GRANT-denied — 0004's
  // restated matrix carried forward an unused INSERT grant on
  // subscriptions to authenticated (subscriptions never had a matching
  // INSERT policy, so RLS — not the GRANT layer — was the real, if
  // accidental, reason it always failed). 0006_subscription_
  // integrity.sql now explicitly revokes that leftover grant, making
  // this a genuine GRANT-layer denial too, and the matchers below prove
  // it via SQLSTATE 42501 + the real message, not by inference.
  await test("[subscriptions] owner raw INSERT/DELETE both genuinely denied at the GRANT layer (verified via SQLSTATE, not inferred)", async () => {
    await asUser(userAId);
    await expectReject(
      () => client.query(`insert into public.subscriptions (user_id, plan_id, provider, status) values ($1, $2, 'stripe', 'active');`, [userAId, planId]),
      { sqlState: "42501", messageIncludes: "permission denied" },
    );
    await expectReject(
      () => client.query(`delete from public.subscriptions where id = $1;`, [subscriptionId]),
      { sqlState: "42501", messageIncludes: "permission denied" },
    );
  });

  // ===================================================================
  // 8. payments — docs/rls-matrix.md row 8. Own/other/AAL1/AAL2 already
  // covered in rls.local.test.mjs; this fills in the owner write boundary.
  // ===================================================================
  await test("[payments] owner raw INSERT/UPDATE denied at the GRANT layer", async () => {
    await asUser(userAId);
    await expectReject(() => client.query(`insert into public.payments (user_id, plan_id, amount_minor, gateway) values ($1, $2, 1000, 'stripe');`, [userAId, planId]));
    await expectReject(() => client.query(`update public.payments set amount_minor = 1 where id = $1;`, [chargeId]));
  });

  // ===================================================================
  // 9. provider_events — docs/rls-matrix.md row 9. AAL1/AAL2 SELECT and
  // claim/complete EXECUTE already covered in rls.local.test.mjs.
  // ===================================================================
  await test("[provider_events] a plain authenticated (non-admin) session sees 0 rows", async () => {
    await asUser(userAId);
    const { rows } = await client.query(`select * from public.provider_events;`);
    assert(rows.length === 0);
  });
  await test("[provider_events] authenticated raw INSERT denied at the GRANT layer (service_role only)", async () => {
    await asUser(adminId, "aal2");
    await expectReject(() => client.query(`insert into public.provider_events (provider, provider_event_id, event_type, payload_hash) values ('stripe', 'evt_matrix_2', 'x', 'h');`));
  });

  // ===================================================================
  // 10. manual_payments — docs/rls-matrix.md row 10. Insert restriction
  // and admin-update bypass-closure already covered in rls.local.test.mjs.
  // ===================================================================
  await test("[manual_payments] another user cannot SELECT it", async () => {
    await asUser(userBId);
    const { rows } = await client.query(`select * from public.manual_payments where id = $1;`, [manualPaymentId]);
    assert(rows.length === 0);
  });
  await test("[manual_payments] owner raw DELETE denied at the GRANT layer", async () => {
    await asUser(userAId);
    await expectReject(() => client.query(`delete from public.manual_payments where id = $1;`, [manualPaymentId]));
  });

  // ===================================================================
  // 11. invoices — docs/rls-matrix.md row 11.
  // ===================================================================
  await test("[invoices] owner SELECT own, not another's", async () => {
    await asUser(userAId);
    const own = await client.query(`select * from public.invoices where id = $1;`, [invoiceId]);
    assert(own.rows.length === 1);
    await asUser(userBId);
    const other = await client.query(`select * from public.invoices where id = $1;`, [invoiceId]);
    assert(other.rows.length === 0);
  });
  await test("[invoices] AAL1 admin rejected reading directly; AAL2 admin CAN read", async () => {
    await asUser(adminId, "aal1");
    const aal1 = await client.query(`select * from public.invoices where id = $1;`, [invoiceId]);
    assert(aal1.rows.length === 0);
    await asUser(adminId, "aal2");
    const aal2 = await client.query(`select * from public.invoices where id = $1;`, [invoiceId]);
    assert(aal2.rows.length === 1);
  });
  // RLS Remediation Round 3 (Section D): the raw INSERT policy is gone
  // entirely (was is_admin_aal2()-gated before) — a non-admin user's own
  // INSERT attempt is now denied at the GRANT layer, before RLS is even
  // evaluated, not "rejected by RLS."
  await test("[invoices] a non-admin user's own INSERT attempt is rejected at the GRANT layer (even with a real succeeded payment)", async () => {
    await asUser(userAId);
    await expectReject(
      () => client.query(
        `insert into public.invoices (user_id, payment_id, amount_minor_snapshot) values ($1, $2, 4000);`,
        [userAId, chargeId],
      ),
      { sqlState: "42501", messageIncludes: "permission denied" },
    );
  });
  await test("[invoices] no UPDATE policy, and no UPDATE grant at all — even AAL2 admin's raw UPDATE is denied at the GRANT layer", async () => {
    await asUser(adminId, "aal2");
    await expectReject(
      () => client.query(`update public.invoices set status = 'cancelled' where id = $1;`, [invoiceId]),
      { sqlState: "42501", messageIncludes: "permission denied" },
    );
  });

  // RLS Remediation Round 4: issue_invoice_from_payment() previously
  // wrote no admin_audit_log row at all — unlike every other
  // financially-consequential admin RPC in this schema. admin_audit_log.
  // actor_admin_id is NOT NULL with a real FK to profiles (verified live
  // while building this: a service_role call crashed outright on that
  // constraint before the fix below) — so a real admin's genuine
  // issuance IS audited, but a service_role-issued invoice deliberately
  // is NOT (same reasoning as service_apply_subscription_update()'s own
  // "no audit — a service action, not an admin one"). Both halves proven
  // directly, not assumed.
  await test("[invoices] issue_invoice_from_payment() audits a real admin's genuine issuance exactly once, NOT again on replay, and NOT at all for a service_role issuance (Round 4)", async () => {
    await asSuperuser();
    const adminCharge = (await client.query(
      `insert into public.payments (user_id, plan_id, amount_minor, gateway) values ($1, $2, 4000, 'stripe') returning id;`,
      [userAId, planId],
    )).rows[0].id;
    await client.query(`update public.payments set status = 'succeeded' where id = $1;`, [adminCharge]);

    await asUser(adminId, "aal2");
    const issued = await client.query(`select * from public.issue_invoice_from_payment($1);`, [adminCharge]);
    const adminInvoiceId = issued.rows[0].id;

    await asSuperuser();
    const afterAdminIssue = await client.query(
      `select count(*)::int as n from public.admin_audit_log where action = 'issue_invoice_from_payment' and resource_id = $1;`,
      [adminInvoiceId],
    );
    assert(afterAdminIssue.rows[0].n === 1, `expected exactly 1 audit row for a real admin's genuine issuance, got ${afterAdminIssue.rows[0].n}`);

    await asUser(adminId, "aal2");
    const replay = await client.query(`select * from public.issue_invoice_from_payment($1);`, [adminCharge]);
    assert(replay.rows[0].id === adminInvoiceId, "an idempotent replay must return the SAME pre-existing invoice, not create a new one");

    await asSuperuser();
    const afterReplay = await client.query(
      `select count(*)::int as n from public.admin_audit_log where action = 'issue_invoice_from_payment' and resource_id = $1;`,
      [adminInvoiceId],
    );
    assert(afterReplay.rows[0].n === 1, `an idempotent replay must NOT write a second audit row, got ${afterReplay.rows[0].n}`);

    // invoiceId (seeded above via asService()) was a genuinely NEW
    // invoice too, but issued by service_role, not an admin — by design,
    // it must have written NO audit row at all (auth.uid() is NULL for
    // a service_role session, and actor_admin_id is NOT NULL).
    const serviceIssued = await client.query(
      `select count(*)::int as n from public.admin_audit_log where action = 'issue_invoice_from_payment' and resource_id = $1;`,
      [invoiceId],
    );
    assert(serviceIssued.rows[0].n === 0, `a service_role-issued invoice must write NO audit row, got ${serviceIssued.rows[0].n}`);
  });

  // -------------------------------------------------------------------
  // RLS Remediation Round 3 (Section D): issue_invoice_from_payment()
  // sweep — every rejection path validate_invoice_insert() and the RPC
  // together enforce. The happy-path/idempotency/concurrency coverage
  // already lives in rls.local.test.mjs; this fills in the rejection
  // matrix specifically.
  // -------------------------------------------------------------------
  await test("[invoices] issue_invoice_from_payment() rejects a pending, a failed, and a refund-kind payment", async () => {
    await asSuperuser();
    const pending = (await client.query(
      `insert into public.payments (user_id, plan_id, amount_minor, gateway) values ($1, $2, 4000, 'stripe') returning id;`,
      [userAId, newVersionPlanId ?? planId],
    )).rows[0].id;
    const failed = (await client.query(
      `insert into public.payments (user_id, plan_id, amount_minor, gateway) values ($1, $2, 4000, 'stripe') returning id;`,
      [userAId, newVersionPlanId ?? planId],
    )).rows[0].id;
    await client.query(`update public.payments set status = 'failed' where id = $1;`, [failed]);
    const refundCharge = (await client.query(
      `insert into public.payments (user_id, amount_minor, gateway, status) values ($1, 100, 'stripe', 'succeeded') returning id;`,
      [userAId],
    )).rows[0].id;
    const refund = (await client.query(
      `insert into public.payments (user_id, kind, parent_payment_id, amount_minor, gateway, status) values ($1, 'refund', $2, 50, 'stripe', 'succeeded') returning id;`,
      [userAId, refundCharge],
    )).rows[0].id;

    await asUser(adminId, "aal2");
    await expectReject(
      () => client.query(`select * from public.issue_invoice_from_payment($1);`, [pending]),
      { sqlState: "P0001", messageIncludes: "is not a succeeded charge" },
      "a pending payment should not be invoiceable",
    );
    await expectReject(
      () => client.query(`select * from public.issue_invoice_from_payment($1);`, [failed]),
      { sqlState: "P0001", messageIncludes: "is not a succeeded charge" },
      "a failed payment should not be invoiceable",
    );
    await expectReject(
      () => client.query(`select * from public.issue_invoice_from_payment($1);`, [refund]),
      { sqlState: "P0001", messageIncludes: "is not a succeeded charge" },
      "a refund-kind payment should not be invoiceable",
    );
  });

  await test("[invoices] validate_invoice_insert() rejects a mismatched amount/discount/plan/user/currency even from a raw service_role INSERT", async () => {
    await asService();
    await expectReject(
      () => client.query(
        `insert into public.invoices (user_id, plan_id, payment_id, amount_minor_snapshot, currency_snapshot, status) values ($1, $2, $3, 999999, 'EUR', 'paid');`,
        [userAId, newVersionPlanId ?? planId, chargeId],
      ),
      { sqlState: "P0001", messageIncludes: "does not match its linked payment's" },
      "a mismatched amount_minor_snapshot should be rejected even for a raw service_role insert",
    );
    await expectReject(
      () => client.query(
        `insert into public.invoices (user_id, payment_id, amount_minor_snapshot, currency_snapshot, status) values ($1, $2, 4000, 'EUR', 'paid');`,
        [userBId, chargeId],
      ),
      { sqlState: "P0001", messageIncludes: "does not match its linked payment" },
      "a mismatched user_id should be rejected",
    );
  });

  // ===================================================================
  // 12. coupons — docs/rls-matrix.md row 12 (no prior coverage at all).
  // ===================================================================
  await test("[coupons] anon SELECT denied at the GRANT layer", async () => {
    await asAnon();
    await expectReject(() => client.query(`select * from public.coupons;`));
  });
  await test("[coupons] a plain authenticated (non-admin) session sees 0 rows (grant exists, RLS filters)", async () => {
    await asUser(userAId);
    const { rows } = await client.query(`select * from public.coupons;`);
    assert(rows.length === 0);
  });
  await test("[coupons] admin AAL1 CAN read; AAL1 INSERT rejected (needs AAL2); AAL2 INSERT/UPDATE/DELETE succeed", async () => {
    await asUser(adminId, "aal1");
    const sel = await client.query(`select * from public.coupons where id = $1;`, [couponId]);
    assert(sel.rows.length === 1);
    await expectReject(() => client.query(`insert into public.coupons (code, type, value, discount_scope) values ('MATRIX20', 'percent', 20, 'first_payment_only');`));

    await asUser(adminId, "aal2");
    const ins = await client.query(`insert into public.coupons (code, type, value, discount_scope) values ('MATRIX20', 'percent', 20, 'first_payment_only') returning id;`);
    const upd = await client.query(`update public.coupons set active = false where id = $1 returning active;`, [ins.rows[0].id]);
    assert(upd.rows[0].active === false);
    const del = await client.query(`delete from public.coupons where id = $1 returning id;`, [ins.rows[0].id]);
    assert(del.rows.length === 1);
  });

  // ===================================================================
  // 13. coupon_redemptions — docs/rls-matrix.md row 13 (no prior coverage).
  // ===================================================================
  await test("[coupon_redemptions] owner SELECT own, not another user's; admin AAL1 CAN read", async () => {
    await asUser(userAId);
    const own = await client.query(`select * from public.coupon_redemptions where coupon_id = $1 and user_id = $2;`, [couponId, userAId]);
    assert(own.rows.length === 1);
    await asUser(userBId);
    const other = await client.query(`select * from public.coupon_redemptions where coupon_id = $1 and user_id = $2;`, [couponId, userAId]);
    assert(other.rows.length === 0);
    await asUser(adminId, "aal1");
    const admin = await client.query(`select * from public.coupon_redemptions where coupon_id = $1 and user_id = $2;`, [couponId, userAId]);
    assert(admin.rows.length === 1);
  });
  await test("[coupon_redemptions] authenticated raw INSERT denied at the GRANT layer (service_role/checkout-flow only)", async () => {
    await asUser(userAId);
    await expectReject(() => client.query(`insert into public.coupon_redemptions (coupon_id, user_id) values ($1, $2);`, [couponId, userBId]));
  });

  // ===================================================================
  // 14-15. blogs / testimonials — docs/rls-matrix.md rows 14-15 (no
  // prior coverage). Full pass on blogs; representative pass on
  // testimonials (structurally identical policy shape).
  // ===================================================================
  await test("[blogs] anon SELECT published, not the draft", async () => {
    await asAnon();
    const pub = await client.query(`select * from public.blogs where id = $1;`, [blogId]);
    assert(pub.rows.length === 1);
    const draft = await client.query(`select * from public.blogs where id = $1;`, [draftBlogId]);
    assert(draft.rows.length === 0);
  });
  await test("[blogs] admin AAL1 CAN see the draft; AAL1 UPDATE affects 0 rows (needs AAL2); AAL2 write succeeds", async () => {
    await asUser(adminId, "aal1");
    const sel = await client.query(`select * from public.blogs where id = $1;`, [draftBlogId]);
    assert(sel.rows.length === 1);
    const upd1 = await client.query(`update public.blogs set title = 'x' where id = $1 returning id;`, [draftBlogId]);
    assert(upd1.rows.length === 0, "AAL1 admin's UPDATE should affect 0 rows (USING requires AAL2), not throw");

    await asUser(adminId, "aal2");
    const upd = await client.query(`update public.blogs set title = 'Updated' where id = $1 returning title;`, [draftBlogId]);
    assert(upd.rows[0].title === "Updated");
    const del = await client.query(`delete from public.blogs where id = $1 returning id;`, [draftBlogId]);
    assert(del.rows.length === 1);
  });
  await test("[testimonials] anon SELECT published, not the draft; admin AAL2 full CRUD", async () => {
    await asAnon();
    const pub = await client.query(`select * from public.testimonials where id = $1;`, [testimonialId]);
    assert(pub.rows.length === 1);
    const draft = await client.query(`select * from public.testimonials where id = $1;`, [draftTestimonialId]);
    assert(draft.rows.length === 0);

    await asUser(adminId, "aal2");
    const upd = await client.query(`update public.testimonials set published = true where id = $1 returning published;`, [draftTestimonialId]);
    assert(upd.rows[0].published === true);
  });

  // ===================================================================
  // 16. trial_requests — docs/rls-matrix.md row 16. Guest-INSERT forgery
  // already covered in rls.local.test.mjs.
  // ===================================================================
  await test("[trial_requests] admin AAL1 CAN read, AAL1 UPDATE/DELETE affect 0 rows, AAL2 succeeds", async () => {
    await asUser(adminId, "aal1");
    const sel = await client.query(`select * from public.trial_requests where id = $1;`, [trialRequestId]);
    assert(sel.rows.length === 1);
    const upd1 = await client.query(`update public.trial_requests set status = 'contacted' where id = $1 returning id;`, [trialRequestId]);
    assert(upd1.rows.length === 0);

    await asUser(adminId, "aal2");
    const upd2 = await client.query(`update public.trial_requests set status = 'contacted' where id = $1 returning status;`, [trialRequestId]);
    assert(upd2.rows[0].status === "contacted");
    const del = await client.query(`delete from public.trial_requests where id = $1 returning id;`, [trialRequestId]);
    assert(del.rows.length === 1);
  });

  // ===================================================================
  // 17. subscribers — docs/rls-matrix.md row 17. Guest-INSERT forgery
  // already covered in rls.local.test.mjs.
  // ===================================================================
  await test("[subscribers] admin AAL1 CAN read; a plain authenticated (non-admin) UPDATE affects 0 rows; AAL2 admin UPDATE succeeds", async () => {
    await asUser(adminId, "aal1");
    const sel = await client.query(`select * from public.subscribers where id = $1;`, [subscriberId]);
    assert(sel.rows.length === 1);

    await asUser(userAId);
    const upd1 = await client.query(`update public.subscribers set status = 'unsubscribed' where id = $1 returning id;`, [subscriberId]);
    assert(upd1.rows.length === 0);

    await asUser(adminId, "aal2");
    const upd2 = await client.query(`update public.subscribers set status = 'unsubscribed' where id = $1 returning status;`, [subscriberId]);
    assert(upd2.rows[0].status === "unsubscribed");
  });

  // ===================================================================
  // 18. notifications — docs/rls-matrix.md row 18. Owner read/dismiss,
  // AAL2 admin full read, mark_notification_read() all covered in
  // rls.local.test.mjs.
  // ===================================================================
  await test("[notifications] admin AAL2 raw INSERT (admin_announcement) succeeds", async () => {
    await asUser(adminId, "aal2");
    const ins = await client.query(
      `insert into public.notifications (user_id, type, title) values ($1, 'admin_announcement', 'Matrix Announce') returning id;`,
      [userAId],
    );
    assert(ins.rows.length === 1);
  });
  await test("[notifications] owner raw UPDATE denied at the GRANT layer (mark_notification_read() RPC is the only writer)", async () => {
    await asUser(userAId);
    await expectReject(() => client.query(`update public.notifications set read = true where id = $1;`, [notificationId]));
  });
  await test("[notifications] another user's DELETE affects 0 rows; owner CAN delete (dismiss) their own", async () => {
    await asUser(userBId);
    const other = await client.query(`delete from public.notifications where id = $1 returning id;`, [notificationId]);
    assert(other.rows.length === 0);

    await asUser(userAId);
    const own = await client.query(`delete from public.notifications where id = $1 returning id;`, [notificationId]);
    assert(own.rows.length === 1, "the owner should be able to delete (dismiss) their own notification");
  });
  await test("[notifications] AAL2 admin's DELETE of another user's notification affects 0 rows (no admin delete policy exists)", async () => {
    await asSuperuser();
    const seed = await client.query(
      `insert into public.notifications (user_id, type, title) values ($1, 'admin_announcement', 'For delete test') returning id;`,
      [userAId],
    );
    await asUser(adminId, "aal2");
    const del = await client.query(`delete from public.notifications where id = $1 returning id;`, [seed.rows[0].id]);
    assert(del.rows.length === 0);
  });

  // ===================================================================
  // 19. notification_preferences — docs/rls-matrix.md row 19 (no prior
  // coverage).
  // ===================================================================
  await test("[notification_preferences] owner INSERT own row under real RLS (not seeded as superuser)", async () => {
    await asUser(userAId);
    const ins = await client.query(`insert into public.notification_preferences (user_id, language) values ($1, 'en') returning user_id;`, [userAId]);
    assert(ins.rows.length === 1);
  });
  await test("[notification_preferences] another user cannot insert a preferences row on user A's behalf", async () => {
    await asUser(userBId);
    await expectReject(() => client.query(`insert into public.notification_preferences (user_id, language) values ($1, 'en');`, [userAId]));
  });
  await test("[notification_preferences] owner SELECT/UPDATE own, not another's; admin AAL1 CAN read", async () => {
    await asUser(userAId);
    const own = await client.query(`select * from public.notification_preferences where user_id = $1;`, [notifPrefUserId]);
    assert(own.rows.length === 1);
    const upd = await client.query(`update public.notification_preferences set language = 'ar' where user_id = $1 returning language;`, [notifPrefUserId]);
    assert(upd.rows[0].language === "ar");

    await asUser(userBId);
    const other = await client.query(`select * from public.notification_preferences where user_id = $1;`, [notifPrefUserId]);
    assert(other.rows.length === 0);

    await asUser(adminId, "aal1");
    const admin = await client.query(`select * from public.notification_preferences where user_id = $1;`, [notifPrefUserId]);
    assert(admin.rows.length === 1);
  });
  await test("[notification_preferences] owner raw DELETE denied at the GRANT layer (settings singleton, never deleted)", async () => {
    await asUser(userAId);
    await expectReject(() => client.query(`delete from public.notification_preferences where user_id = $1;`, [notifPrefUserId]));
  });

  // ===================================================================
  // 20. admin_audit_log — docs/rls-matrix.md row 20. AAL2 SELECT +
  // authenticated raw-INSERT rejection already covered in
  // rls.local.test.mjs; this fills in the AAL1-denied boundary and the
  // GRANT-vs-trigger distinction for UPDATE/DELETE.
  // ===================================================================
  await test("[admin_audit_log] AAL1 admin sees 0 rows (needs AAL2)", async () => {
    await asUser(adminId, "aal1");
    const { rows } = await client.query(`select * from public.admin_audit_log where id = $1;`, [auditLogId]);
    assert(rows.length === 0);
  });
  await test("[admin_audit_log] AAL2 admin's raw UPDATE/DELETE denied at the GRANT layer (not just the trigger)", async () => {
    await asUser(adminId, "aal2");
    await expectReject(() => client.query(`update public.admin_audit_log set action = 'x' where id = $1;`, [auditLogId]));
    await expectReject(() => client.query(`delete from public.admin_audit_log where id = $1;`, [auditLogId]));
  });
  await test("[admin_audit_log] service_role HAS the grant, but forbid_audit_log_mutation() trigger still rejects UPDATE/DELETE", async () => {
    await asService();
    await expectReject(
      () => client.query(`update public.admin_audit_log set action = 'x' where id = $1;`, [auditLogId]),
      "service_role has the base UPDATE grant here (unrestricted), so this must be the trigger rejecting it, not the grant",
    );
    await expectReject(() => client.query(`delete from public.admin_audit_log where id = $1;`, [auditLogId]));
  });

  await asSuperuser();

  const ok = report();
  await client.end();
  if (!ok) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error("[rls-full-matrix-test] harness crashed:", err);
  process.exitCode = 1;
});
