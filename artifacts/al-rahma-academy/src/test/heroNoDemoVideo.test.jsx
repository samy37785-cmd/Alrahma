import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, extname } from 'node:path';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { LangProvider } from '../context/LangContext';
import Hero from '../components/features/marketing/Hero';

// The hero's "Watch a live lesson" window embedded a placeholder YouTube ID
// (dQw4w9WgXcQ, a music video with dancing, not a lesson) whenever
// VITE_DEMO_VIDEO_ID was unset, which it was in production. The owner asked
// for the videos themselves to be removed while every place that shows one
// stays as it is: the button and the window remain, and the window holds no
// video. The unused YouTube playlist link in the marketing course data went
// with it.
//
// On 2026-11-06 the owner chose to hide the button as well, because a window
// with nothing in it looked broken. The window's markup stays in Hero.jsx as
// the slot for a real lesson recording (HAS_LESSON_VIDEO).

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcRoot = join(__dirname, '..');

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === 'test' || entry === 'node_modules') continue;
      walk(full, out);
    } else if (['.js', '.jsx'].includes(extname(entry))) {
      out.push(full);
    }
  }
  return out;
}

function renderHero() {
  window.history.replaceState({}, '', '/');
  return render(
    <BrowserRouter>
      <LangProvider>
        <Hero onTrialClick={() => {}} />
      </LangProvider>
    </BrowserRouter>,
  );
}

describe('the hero lesson window holds no video', () => {
  it('hides the button while there is no lesson video, and embeds nothing', () => {
    const { container } = renderHero();

    expect(screen.queryByRole('button', { name: 'Watch a live lesson' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Book a Free Trial' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(container.querySelector('iframe, video')).toBeNull();
    expect(container.innerHTML).not.toMatch(/youtube/i);
  });

  it('keeps the empty window in Hero.jsx as the slot for a real recording', () => {
    const source = readFileSync(join(srcRoot, 'components/features/marketing/Hero.jsx'), 'utf8');
    expect(source).toMatch(/const HAS_LESSON_VIDEO = false;/);
    expect(source).toMatch(/className="hero__video-iframe"/);
  });

  it('no source file under src mentions the placeholder video, its env variable or the removed playlist', () => {
    const files = walk(srcRoot);
    expect(files.length).toBeGreaterThan(100);
    const offenders = files
      .filter((f) => /dQw4w9WgXcQ|VITE_DEMO_VIDEO_ID|PLRpvHZq8NeLacnKt2FKtlTSRLWoFOpBGA/.test(readFileSync(f, 'utf8')))
      .map((f) => relative(srcRoot, f));
    expect(offenders).toEqual([]);
  });
});
