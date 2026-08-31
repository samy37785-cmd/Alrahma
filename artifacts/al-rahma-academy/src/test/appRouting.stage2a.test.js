import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Stage 2A (see docs/user-admin-auth-contract.md, Sections 5-6): a source-
// level guard on App.jsx's actual route wiring, complementing the
// behavioral coverage in ProtectedRoute.test.jsx (which proves the guard
// component's own logic, but not that App.jsx wires it correctly). Locks
// in:
//   - /admin/login is registered WITHOUT a ProtectedRoute wrapper (it must
//     be reachable by an unauthenticated visitor - wrapping it again would
//     silently reintroduce the circular-guard bug this stage fixed).
//   - /teacher and /parent no longer select TeacherDashboard/ParentDashboard
//     by role - both just redirect to /dashboard.
//   - no ProtectedRoute route="teacher"/role="parent" usage remains.

const __dirname = dirname(fileURLToPath(import.meta.url));
const appSource = readFileSync(join(__dirname, '..', 'App.jsx'), 'utf8');

describe('App.jsx route wiring (Stage 2A)', () => {
  it('/admin/login is registered without a ProtectedRoute wrapper', () => {
    expect(appSource).toMatch(/<Route path="\/admin\/login" element=\{<AdminLogin \/>\} \/>/);
    expect(appSource).not.toMatch(/<Route path="\/admin\/login" element=\{<ProtectedRoute/);
  });

  it('/admin is still gated by ProtectedRoute adminOnly + AdminSessionGate', () => {
    expect(appSource).toMatch(/<Route path="\/admin" element=\{<ProtectedRoute adminOnly><AdminSessionGate><AdminDashboard \/><\/AdminSessionGate><\/ProtectedRoute>\} \/>/);
  });

  it('/teacher and /parent redirect to /dashboard instead of selecting a role-specific dashboard', () => {
    expect(appSource).toMatch(/<Route path="\/teacher" element=\{<Navigate to="\/dashboard" replace \/>\} \/>/);
    expect(appSource).toMatch(/<Route path="\/parent" element=\{<Navigate to="\/dashboard" replace \/>\} \/>/);
  });

  it('no route registration uses the removed ProtectedRoute role= prop', () => {
    expect(appSource).not.toMatch(/role="teacher"/);
    expect(appSource).not.toMatch(/role="parent"/);
    expect(appSource).not.toMatch(/<ProtectedRoute role=/);
  });

  it('TeacherDashboard/ParentDashboard are not imported by App.jsx any more (unreachable, not deleted)', () => {
    expect(appSource).not.toMatch(/lazy\(\(\) => import\('\.\/pages\/TeacherDashboard'\)\)/);
    expect(appSource).not.toMatch(/lazy\(\(\) => import\('\.\/pages\/ParentDashboard'\)\)/);
  });
});
