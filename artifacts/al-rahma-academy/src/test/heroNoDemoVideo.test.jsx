import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, extname } from 'node:path';
import { render, screen, fireEvent } from '@testing-library/react';
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
  it('keeps the button and the window, and the window embeds nothing', () => {
    const { container } = renderHero();

    fireEvent.click(screen.getByRole('button', { name: 'Watch a live lesson' }));

    const dialog = screen.getByRole('dialog', { name: 'Live lesson demo' });
    expect(dialog.querySelector('.hero__video-iframe')).not.toBeNull();
    expect(container.querySelector('iframe, video')).toBeNull();
    expect(container.innerHTML).not.toMatch(/youtube/i);

    fireEvent.click(screen.getByRole('button', { name: 'Close video' }));
    expect(screen.queryByRole('dialog')).toBeNull();
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
