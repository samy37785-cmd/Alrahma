# 03 — User Roles & Permissions

> Complete role model, permissions, capabilities, restrictions, and the differences between roles. The platform runs **two entirely separate identity systems**; conflating them is the single most important thing to get right in a redesign.

Part of the [Product Documentation set](MASTER_PRODUCT_SPEC.md). Sources: [models/User.js](../../backend/models/User.js), [models/AdminUser.js](../../backend/models/AdminUser.js), [middleware/auth.js](../../backend/middleware/auth.js), [middleware/rbac.js](../../backend/middleware/rbac.js), [ProtectedRoute.jsx](../../frontend/src/components/ui/ProtectedRoute.jsx), [AdminSessionGate.jsx](../../frontend/src/components/ui/AdminSessionGate.jsx).

---

## 1. The two identity systems

| | **System A — App users** | **System B — Admin operators** |
|---|---|---|
| Model | [User.js](../../backend/models/User.js) | [AdminUser.js](../../backend/models/AdminUser.js) (separate collection) |
| Roles | `student`, `teacher`, `parent`, `admin` | `super-admin`, `admin`, `editor`, `viewer` |
| Self-registration | Yes (`student`/`parent` only) | **No** — provisioned via `npm run create-admin` |
| Auth | Password / Google → JWT httpOnly cookie (`token`) | Password → **TOTP MFA** → access+refresh cookies (`admin_at`/`admin_rt`) |
| Session | `tokenVersion` invalidation | Refresh-token family rotation + reuse detection |
| Extra hardening | — | IP whitelist (fails closed in prod), per-account lockout, encrypted MFA secret, strict CSP |
| Frontend context | `AuthContext` (`useAuth`) | `AdminAuthContext` (`useAdminAuth`) |
| Frontend guard | `ProtectedRoute` | `AdminSessionGate` (nested inside `ProtectedRoute adminOnly`) |

**Critical nuance:** the `/admin` console requires **both** a regular `User` with `role === 'admin'` (passes `ProtectedRoute adminOnly`) **and** a separate authenticated `AdminUser` MFA session (passes `AdminSessionGate`). A `User.role = admin` alone cannot use the console; an `AdminUser` session alone cannot pass the route guard. They are checked independently.

> **[needs verification]** How a person obtains both a `User{role:admin}` and a matching `AdminUser` account (are they linked by email? provisioned together?) is not fully traced in code — `createAdminUser.js` creates the `AdminUser`; the corresponding `User.role='admin'` provisioning path should be confirmed.

---

## 2. System A — App user roles

Enum on [User.js](../../backend/models/User.js): `student | teacher | parent | admin` (default `student`). Enforced by simple middleware guards in [middleware/auth.js](../../backend/middleware/auth.js):

| Guard | Grants access to | Used by |
|---|---|---|
| `protect` | any authenticated user (verifies JWT + `tokenVersion`) | most `/api/*` user routes |
| `adminOnly` | `role === 'admin'` | admin **reads** on legacy stack, admin list endpoints |
| `teacherOnly` | `role === 'teacher'` | `/api/teacher/*` |
| `parentOnly` | `role === 'parent'` | `/api/parent/*` |
| `staffOnly` | `role === 'admin'` **or** `'teacher'` | live-class create/update/delete |
| `softProtect` | optional — attaches user if present, allows guests | payment creation (guest checkout) |

Frontend mirror in [App.jsx](../../frontend/src/App.jsx): `ProtectedRoute` with `adminOnly` / `role="teacher"` / `role="parent"` props.

### Capabilities by app role

| Capability | Visitor | Student | Teacher | Parent | Admin (User) |
|---|:-:|:-:|:-:|:-:|:-:|
| Browse marketing, tools, blog, FAQ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Request trial / enroll / pay | ✅ | ✅ | ✅ | ✅ | ✅ |
| Quran reader (persist bookmarks/progress) | read-only | ✅ | ✅ | ✅ | ✅ |
| Access gated course content | — | ✅ (active sub) | ✅ | ✅ | ✅ |
| Per-lesson progress + gamification (XP) | — | ✅ | — | — | — |
| AI tutor | — | ✅ (all logged-in) | ✅ | ✅ | ✅ |
| Messaging (student ↔ assigned teacher only) | — | ✅ | ✅ | ✅ | ✅ |
| Community post/comment (moderated) | — | ✅ | ✅ | ✅ | ✅ |
| Wishlist, notifications, reviews | — | ✅ | ✅ | ✅ | ✅ |
| Certificates (view own) | — | ✅ | ✅ | ✅ | ✅ |
| Teacher: view assigned students, add records | — | — | ✅ | — | — |
| Teacher/Admin: schedule live classes (`staffOnly`) | — | — | ✅ | — | ✅ |
| Parent: link/view children | — | — | — | ✅ | — |
| Admin reads (legacy stack) | — | — | — | — | ✅ |

Guard logic on the frontend ([ProtectedRoute.jsx](../../frontend/src/components/ui/ProtectedRoute.jsx)): not logged in → `/login` (waits for `ensureSession()` server confirm first, to avoid redirect flicker); `adminOnly && !isAdmin` → `/`; `role && user.role !== role && !isAdmin` → `/` (**admins bypass role checks**). Messaging is constrained server-side by `canMessage` (student ↔ assigned-teacher only).

---

## 3. System B — Admin RBAC

Separate `AdminUser` accounts with role + optional per-account `extraPermissions[]`. Effective permissions = `ROLE_PERMISSIONS[role]` ∪ `extraPermissions` (`getPermissions()` merges).

### Permission strings ([AdminUser.js](../../backend/models/AdminUser.js) `ALL_PERMISSIONS`, lines 8–23)
```
users:read        users:write        users:delete
courses:read      courses:write      courses:delete
payments:read     payments:write     payments:refund
enrollments:read  enrollments:write
audit:read
system:maintenance   system:kill-switch      ← see note below
blog:write   coupons:write   contact:write
certificates:write   referrals:write   reviews:write   community:write
```

> **Verified:** `system:maintenance` and `system:kill-switch` are **defined but never consumed** — the system kill-switch routes in [systemRoutes.js](../../backend/routes/v1/admin/systemRoutes.js) gate on `requireAdminRole('super-admin')`, not on these permission strings (grep of `backend/` finds them only at [AdminUser.js:14](../../backend/models/AdminUser.js#L14)). A redesign should either wire them up or remove them.

### Role → permission bundles ([AdminUser.js](../../backend/models/AdminUser.js) `ROLE_PERMISSIONS`, lines 26–46)

| Permission | super-admin | admin | editor | viewer |
|---|:-:|:-:|:-:|:-:|
| users:read | ✅ | ✅ | | ✅ |
| users:write | ✅ | ✅ | | |
| users:delete | ✅ | | | |
| courses:read | ✅ | ✅ | ✅ | ✅ |
| courses:write | ✅ | ✅ | ✅ | |
| courses:delete | ✅ | | | |
| payments:read | ✅ | ✅ | | ✅ |
| payments:write | ✅ | ✅ | | |
| payments:refund | ✅ | | | |
| enrollments:read | ✅ | ✅ | ✅ | ✅ |
| enrollments:write | ✅ | ✅ | | |
| audit:read | ✅ | ✅ | | ✅ |
| blog / coupons / contact / certificates / referrals / reviews / community :write | ✅ | ✅ | | |
| system:maintenance / system:kill-switch | ✅ (unused string) | | | |

Summary: **super-admin** = everything (incl. all delete/refund + system kill-switches by role). **admin** = read+write across the board **except** delete/refund/system. **editor** = course authoring + enrollment reads. **viewer** = read-only across users/courses/payments/enrollments/audit.

### Enforcement ([middleware/rbac.js](../../backend/middleware/rbac.js))
- `requirePermissions(...perms)` — must hold **all** listed permissions (`hasPermission` uses `.every()`).
- `requireAdminRole(...roles)` — coarse role gate for super-admin-only actions (system kill-switches, admin creation, audit purge, admin listing).

### Per-request admin pipeline ([routes/v1/admin/index.js](../../backend/routes/v1/admin/index.js))
Every `/api/v1/admin/*` request passes, in order:
`ipWhitelist` → strict admin Helmet CSP (HSTS, frameguard deny, noSniff) → `adminApiLimiter` → `sanitizeMongo` → (`/auth` public) → `verifyAccessToken` → `maintenanceGuard` → route-level `requirePermissions()` → `auditFromReq` on mutations.

---

## 4. Restrictions & guardrails (code-grounded)

| Restriction | Where | Effect |
|---|---|---|
| **IP whitelist fails closed in prod** | [middleware/ipWhitelist.js](../../backend/middleware/ipWhitelist.js) | If `ADMIN_IP_WHITELIST` unset on Render, **all** admin requests denied |
| **TOTP MFA mandatory** | `adminAuthController.js`, `AdminSessionGate` | Admin session requires verified TOTP each login |
| **Account lockout** | [AdminUser.js](../../backend/models/AdminUser.js) | 5 failed attempts → 15-min lock |
| **Financial freeze** | `financialGuard`, `SystemConfig.financials_frozen` | Blocks manual-payment approve/reject (423); **super-admin bypasses** |
| **Maintenance mode** | `maintenanceGuard`, `SystemConfig.maintenance_mode` | 503 for non-super-admin admin routes |
| **Admin-role user creation** | `userAdminController.js` | Creating a `User` with `role: admin` restricted to super-admin |
| **Audit purge floor** | `systemController.js` | GDPR audit purge requires ≥ 90-day retention |
| **Immutable audit log** | [SystemAuditLog.js](../../backend/models/SystemAuditLog.js) | Pre-hooks throw on any update |
| **Encrypted MFA secrets** | [config/encryption.js](../../backend/config/encryption.js) | AES-256-GCM, `select:false` |
| **Message scoping** | `messageController.canMessage` | Student ↔ assigned teacher only |

---

## 5. Key role differences at a glance

- **Student** is the only role with **learning mechanics** (progress, XP/level/streak/badges, wishlist, AI tutor as primary audience).
- **Teacher** is the only role with **student-record authoring** and (with admin) live-class scheduling.
- **Parent** is read-only oversight of **linked children** (no learning surface of its own).
- **Admin (User role)** unlocks the console **route**, but real power comes from the paired **AdminUser RBAC** grant.
- The **AdminUser** ladder (viewer → editor → admin → super-admin) is a strict capability escalation; only super-admin holds destructive (delete/refund) and system (kill-switch/admin-provisioning/audit-purge) powers.

See [04_USER_FLOWS.md](04_USER_FLOWS.md) for how these roles move through auth and their core journeys, and [08_API_MAPPING.md](08_API_MAPPING.md) for the per-endpoint guard mapping.
