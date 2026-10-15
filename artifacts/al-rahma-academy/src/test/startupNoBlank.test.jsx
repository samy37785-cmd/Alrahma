import { describe, it, expect } from 'vitest';
import { Suspense } from 'react';
import { render, screen } from '@testing-library/react';
import { lazyPage } from '../utils/lazyPage';
import { initialPageFor } from '../App.jsx';
import { PRERENDER_MANIFEST } from '../../scripts/prerender-routes.mjs';

// #250: at startup the lazy page suspended once even when its chunk was already
// downloaded, so the Suspense spinner replaced the prerendered content for a
// moment. main.jsx now preloads the current page; a preloaded page renders
// synchronously, with no fallback.
const tree = (Page) => (
  <Suspense fallback={<p>LOADING</p>}>
    <Page />
  </Suspense>
);

describe('lazyPage()', () => {
  it('without preload, the first render shows the fallback (the old behaviour)', () => {
    const Page = lazyPage(() => Promise.resolve({ default: () => <h1>Ready</h1> }));
    render(tree(Page));
    expect(screen.getByText('LOADING')).toBeInTheDocument();
  });

  it('after preload(), the first render is the page itself, never the fallback', async () => {
    const Page = lazyPage(() => Promise.resolve({ default: () => <h1>Ready</h1> }));
    await Page.preload();
    render(tree(Page));
    expect(screen.queryByText('LOADING')).toBeNull();
    expect(screen.getByRole('heading', { name: 'Ready' })).toBeInTheDocument();
  });

  it('a failed preload can be retried', async () => {
    let calls = 0;
    const Page = lazyPage(() => (++calls === 1 ? Promise.reject(new Error('offline')) : Promise.resolve({ default: () => <h1>Ready</h1> })));
    await expect(Page.preload()).rejects.toThrow('offline');
    await Page.preload();
    render(tree(Page));
    expect(screen.getByRole('heading', { name: 'Ready' })).toBeInTheDocument();
    expect(calls).toBe(2);
  });
});

describe('initialPageFor()', () => {
  it('every published prerendered route resolves to a page', () => {
    const routes = [...new Set(PRERENDER_MANIFEST.filter((e) => e.status === 'published').map((e) => e.route))];
    const missing = routes.filter((route) => !initialPageFor(route));
    expect(missing).toEqual([]);
  });

  it('the home page and a city prayer-times page resolve to different pages; an unknown URL to none', () => {
    expect(initialPageFor('/')).toBeTruthy();
    expect(initialPageFor('/tools/prayer-times/roma')).toBeTruthy();
    expect(initialPageFor('/tools/prayer-times/roma')).not.toBe(initialPageFor('/'));
    expect(initialPageFor('/no-such-page')).toBeNull();
  });
});
