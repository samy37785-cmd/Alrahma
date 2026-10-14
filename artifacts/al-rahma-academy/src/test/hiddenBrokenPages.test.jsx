import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { navFor } from '../components/layout/dashboardNav';

// AI Tutor and Community have no server endpoints (every /api/ai-tutor and
// /api/community call is a 404 on Production, checked 2026-10-15), so both
// pages were broken for students. They are hidden until a backend exists.

const srcRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(srcRoot, rel), 'utf8');

describe('AI Tutor and Community stay hidden while they have no backend', () => {
  it('the student sidebar has no link to either page', () => {
    const links = navFor(false, 0).map((i) => i.to);
    expect(links).not.toContain('/ai-tutor');
    expect(links).not.toContain('/community');
  });

  it('the dashboard has no "Ask AI Tutor" button', () => {
    expect(read('pages/Dashboard.jsx')).not.toMatch(/\/ai-tutor/);
  });

  it('old links to either page redirect to the dashboard', () => {
    const app = read('App.jsx');
    expect(app).toMatch(/path="\/ai-tutor" element={<Navigate to="\/dashboard" replace \/>}/);
    expect(app).toMatch(/path="\/community" element={<Navigate to="\/dashboard" replace \/>}/);
  });
});
