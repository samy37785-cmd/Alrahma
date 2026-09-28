import { vi } from 'vitest';
import { cleanup, fireEvent, act } from '@testing-library/react';
import { mountFullPage, headMeta, bodyStrings } from './fullPageRender';
import ResourcesHub from '../../pages/hubs/ResourcesHub';
import ToolsHub from '../../pages/hubs/ToolsHub';
import IslamicTools from '../../pages/IslamicTools';
import Blog from '../../pages/Blog';

// French Localization Batch 1D: every template of the batch and every state
// a visitor can reach on it without anything leaving the browser. Shared by
// the French test and the EN/AR regression test.
//
// Callers mock '../api/blogApi' (getBlogPosts) and '../api/contentApi'
// (submitTrial) before importing this module. The blog states are the ones
// production can show today: loading, load error and the empty listing
// (the API has 0 posts). The trial modal's success/failure screens are
// reached through the submitTrial mock only.

async function settle(ms = 10) {
  await act(async () => { await vi.advanceTimersByTimeAsync(ms); });
}

async function click(el) {
  fireEvent.click(el);
  await settle();
}

async function type(el, value) {
  fireEvent.change(el, { target: { value } });
  await act(async () => {});
}

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

export function pageMeta() {
  return {
    title: document.title,
    description: headMeta('meta[name="description"]'),
    ogTitle: headMeta('meta[property="og:title"]'),
    ogDescription: headMeta('meta[property="og:description"]'),
    twitterTitle: headMeta('meta[name="twitter:title"]'),
    twitterDescription: headMeta('meta[name="twitter:description"]'),
    htmlLang: document.documentElement.lang,
    htmlDir: document.documentElement.dir,
    jsonLd: $$('script[type="application/ld+json"]').map((s) => s.textContent),
  };
}

async function resourcesStates(prefix, visit) {
  await mountFullPage(`${prefix}/resources`, ResourcesHub);
  await visit('initial');
}

async function prayerHubStates(prefix, visit) {
  await mountFullPage(`${prefix}/tools/prayer`, IslamicTools);
  await visit('initial');
}

// Tools hub, then its free-trial modal: open, both validation messages,
// failed request, success screen.
async function toolsStates(prefix, visit, { submitTrial }) {
  await mountFullPage(`${prefix}/tools`, ToolsHub);
  await visit('initial');
  await click($('.tools-enroll-cta .btn--gold'));
  await visit('trialOpen');
  const submit = () => $('.qtm__form button[type="submit"]');
  await click(submit()); await visit('trialErrName');
  const inputs = () => $$('.qtm__form input');
  await type(inputs()[0], 'Test Student');
  await type(inputs()[1], 'not-an-email');
  await click(submit()); await visit('trialErrEmail');
  await type(inputs()[1], 'student@example.com');
  await type(inputs()[2], '+44 7700 900000');
  submitTrial.mockRejectedValueOnce(new Error('offline'));
  await click(submit()); await visit('trialFailed');
  submitTrial.mockResolvedValueOnce({});
  await click(submit()); await visit('trialDone');
}

// Blog index in the states production can show: loading, load error, and
// the empty listing (0 posts). No post is rendered or created.
async function blogStates(prefix, visit, { getBlogPosts }) {
  getBlogPosts.mockImplementationOnce(() => new Promise(() => {}));
  await mountFullPage(`${prefix}/resources/blog`, Blog);
  await visit('loading');
  cleanup();
  getBlogPosts.mockRejectedValueOnce(new Error('offline'));
  await mountFullPage(`${prefix}/resources/blog`, Blog);
  await settle(50);
  await visit('error');
  cleanup();
  getBlogPosts.mockResolvedValueOnce({ posts: [] });
  await mountFullPage(`${prefix}/resources/blog`, Blog);
  await settle(50);
  await visit('empty');
}

export const BATCH_1D = [
  { key: 'resources', path: '/resources', run: resourcesStates },
  { key: 'tools', path: '/tools', run: toolsStates },
  { key: 'prayerHub', path: '/tools/prayer', run: prayerHubStates },
  { key: 'blog', path: '/resources/blog', run: blogStates },
];

// Every visible/accessible string and the metadata of every state.
export async function collect(page, prefix, mocks) {
  const strings = new Set();
  const states = {};
  await page.run(prefix, async (name) => {
    bodyStrings().forEach((s) => strings.add(s));
    states[name] = pageMeta();
  }, mocks);
  cleanup();
  return { strings, states };
}
