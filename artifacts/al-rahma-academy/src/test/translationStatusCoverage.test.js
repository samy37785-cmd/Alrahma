// @vitest-environment node
//
// Static guard (Phase 2a): every public route mounted in App.jsx must be
// one of exactly three things:
//   1. registered in src/data/translationStatus.js's TRANSLATION_STATUS
//   2. registered in KNOWN_OUT_OF_SCOPE (not content at all: auth/admin/
//      transactional/404)
//   3. registered in DYNAMIC_PUBLIC_OUT_OF_SCOPE (real public dynamic
//      content -- per-post/per-teacher -- that doesn't fit a static
//      route-key entry yet)
// A dynamic path (':' in it) is NOT, by itself, a reason to skip a route --
// closing that gap is the whole point of this revision (2026-09-18 review):
// a real public dynamic route with no per-item design yet must still be a
// *documented* decision (bucket 3), not silently invisible to this test.
// The only routes exempt with no registry entry at all are ones mechanically
// provable as a pure redirect (<Navigate>, including through a same-file
// wrapper component like RedirectBlogSlug/RedirectTeacherId) or an
// authenticated/admin-gated page (<ProtectedRoute>/<AdminSessionGate>) --
// see the explicit proof test below, which asserts this for each such route
// by name rather than trusting the mechanical check silently.
//
// Uses a real parser (Vite's transformWithEsbuild + parseAstAsync, same as
// internalLinkGuards.test.js) rather than a source-text regex, so JSX
// nesting (e.g. FEATURES.aiTutor ? <ProtectedRoute>...</ProtectedRoute> :
// <NotFound />) is resolved structurally instead of guessed at.
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { transformWithEsbuild, parseAstAsync } from 'vite';
import { TRANSLATION_STATUS, KNOWN_OUT_OF_SCOPE, DYNAMIC_PUBLIC_OUT_OF_SCOPE } from '../data/translationStatus';

const APP_JSX = join(import.meta.dirname, '..', 'App.jsx');

function walkAst(node, visit) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const item of node) walkAst(item, visit);
    return;
  }
  if (typeof node.type === 'string') visit(node);
  for (const key of Object.keys(node)) {
    if (key === 'type' || key === 'loc' || key === 'range' || key === 'start' || key === 'end') continue;
    const value = node[key];
    if (value && typeof value === 'object') walkAst(value, visit);
  }
}

// Every JSX tag name (React.createElement's first argument) reachable
// anywhere inside a subtree.
function collectTagNamesShallow(node) {
  const tags = new Set();
  walkAst(node, (n) => {
    if (n.type !== 'CallExpression') return;
    const callee = n.callee;
    const isCreateElement = callee.type === 'MemberExpression' && callee.property?.name === 'createElement';
    if (!isCreateElement) return;
    const tagNode = n.arguments[0];
    const tagName = tagNode?.type === 'Identifier' ? tagNode.name
      : (tagNode?.type === 'Literal' ? tagNode.value : null);
    if (tagName) tags.add(tagName);
  });
  return tags;
}

async function collectRouteData() {
  const source = readFileSync(APP_JSX, 'utf8');
  const { code } = await transformWithEsbuild(source, APP_JSX, { loader: 'jsx', jsx: 'transform' });
  const ast = await parseAstAsync(code);

  // Top-level function declarations in App.jsx (e.g. RedirectBlogSlug,
  // RedirectTeacherId) -- a Route's element can reference one of these by
  // name instead of inlining JSX directly, so a tag found on a Route's own
  // element subtree that matches one of these names needs its own body
  // walked too, or a wrapper-component redirect is invisible to the guard.
  const localComponents = new Map();
  walkAst(ast, (n) => {
    if (n.type === 'FunctionDeclaration' && n.id?.name) localComponents.set(n.id.name, n.body);
  });

  function collectTagNames(node, seen = new Set()) {
    const tags = collectTagNamesShallow(node);
    for (const tag of [...tags]) {
      if (seen.has(tag) || !localComponents.has(tag)) continue;
      seen.add(tag);
      for (const t of collectTagNames(localComponents.get(tag), seen)) tags.add(t);
    }
    return tags;
  }

  const routes = [];
  walkAst(ast, (node) => {
    if (node.type !== 'CallExpression') return;
    const callee = node.callee;
    const isCreateElement = callee.type === 'MemberExpression' && callee.property?.name === 'createElement';
    if (!isCreateElement) return;
    const [tagNode, propsNode] = node.arguments;
    const tagName = tagNode?.type === 'Identifier' ? tagNode.name
      : (tagNode?.type === 'Literal' ? tagNode.value : null);
    if (tagName !== 'Route' || !propsNode || propsNode.type !== 'ObjectExpression') return;

    let path = null;
    let elementProp = null;
    for (const prop of propsNode.properties) {
      if (prop.type !== 'Property') continue;
      const key = prop.key?.name || prop.key?.value;
      if (key === 'path' && prop.value.type === 'Literal') path = prop.value.value;
      if (key === 'element') elementProp = prop.value;
    }
    if (path == null) return;
    routes.push({ path, tags: elementProp ? collectTagNames(elementProp) : new Set() });
  });
  return routes;
}

// Mechanically provable exemptions -- a route whose element resolves
// (directly, or through a same-file wrapper component) to a <Navigate>, or
// which is wrapped in <ProtectedRoute>/<AdminSessionGate>. Dynamic-ness
// (':' in the path) is NOT part of this check any more -- a real public
// dynamic route must go through DYNAMIC_PUBLIC_OUT_OF_SCOPE instead.
function isMechanicallyExempt(route) {
  return route.tags.has('Navigate') || route.tags.has('ProtectedRoute') || route.tags.has('AdminSessionGate');
}

let routes;
beforeAll(async () => {
  routes = await collectRouteData();
}, 30000);

describe('translationStatus coverage: every public route is a documented decision', () => {
  it('actually parsed real routes out of App.jsx (sanity check on the walker itself)', () => {
    expect(routes.length).toBeGreaterThan(20);
  });

  it('every non-exempt route has a TRANSLATION_STATUS, KNOWN_OUT_OF_SCOPE, or DYNAMIC_PUBLIC_OUT_OF_SCOPE entry', () => {
    const undecided = routes
      .filter((r) => !isMechanicallyExempt(r))
      .map((r) => r.path)
      .filter((path) => !(path in TRANSLATION_STATUS) && !(path in KNOWN_OUT_OF_SCOPE) && !(path in DYNAMIC_PUBLIC_OUT_OF_SCOPE));
    expect(undecided).toEqual([]);
  });

  it('explicit proof: routes excluded with NO registry entry are provably redirects or provably protected/admin-gated, not just assumed', () => {
    const byPath = Object.fromEntries(routes.map((r) => [r.path, r]));

    const REDIRECTS = [
      '/tools/quran', '/quran', '/adhkar', '/hadith-library', '/islamic-tools',
      '/blog', '/blog/:slug', '/faq', '/about', '/teachers', '/teachers/:id',
      '/privacy', '/terms', '/refund-policy', '/course/ijazah', '/course/islamic-studies',
      '/teacher', '/parent',
    ];
    for (const path of REDIRECTS) {
      expect(byPath[path], `expected route ${path} to exist in App.jsx`).toBeDefined();
      expect(byPath[path]?.tags.has('Navigate'), `expected ${path} to resolve to a Navigate redirect`).toBe(true);
    }

    const PROTECTED = [
      '/courses/:id', '/dashboard', '/wishlist', '/profile', '/messages',
      '/calendar', '/admin', '/ai-tutor', '/community',
    ];
    for (const path of PROTECTED) {
      expect(byPath[path], `expected route ${path} to exist in App.jsx`).toBeDefined();
      const tags = byPath[path]?.tags;
      expect(
        tags?.has('ProtectedRoute') || tags?.has('AdminSessionGate'),
        `expected ${path} to be wrapped in ProtectedRoute/AdminSessionGate`,
      ).toBe(true);
    }
  });

  it('every KNOWN_OUT_OF_SCOPE path actually exists as a route in App.jsx (no stale exclusions)', () => {
    const realPaths = new Set(routes.map((r) => r.path));
    const stale = Object.keys(KNOWN_OUT_OF_SCOPE).filter((p) => !realPaths.has(p));
    expect(stale).toEqual([]);
  });

  it('every translationStatus.js key actually exists as a route in App.jsx (no stale/typo\'d registry entries)', () => {
    const realPaths = new Set(routes.map((r) => r.path));
    const stale = Object.keys(TRANSLATION_STATUS).filter((p) => !realPaths.has(p));
    expect(stale).toEqual([]);
  });

  it('every DYNAMIC_PUBLIC_OUT_OF_SCOPE path actually exists as a route in App.jsx and is genuinely dynamic', () => {
    const realPaths = new Set(routes.map((r) => r.path));
    const stale = Object.keys(DYNAMIC_PUBLIC_OUT_OF_SCOPE).filter((p) => !realPaths.has(p));
    expect(stale).toEqual([]);
    const notActuallyDynamic = Object.keys(DYNAMIC_PUBLIC_OUT_OF_SCOPE).filter((p) => !p.includes(':'));
    expect(notActuallyDynamic).toEqual([]);
  });

  it('DYNAMIC_PUBLIC_OUT_OF_SCOPE routes are not themselves mechanically-exempt (redirect/protected) -- they belong in that bucket instead if they are', () => {
    const byPath = Object.fromEntries(routes.map((r) => [r.path, r]));
    const misclassified = Object.keys(DYNAMIC_PUBLIC_OUT_OF_SCOPE).filter((p) => isMechanicallyExempt(byPath[p] || { tags: new Set() }));
    expect(misclassified).toEqual([]);
  });

  it('no route appears in more than one of TRANSLATION_STATUS / KNOWN_OUT_OF_SCOPE / DYNAMIC_PUBLIC_OUT_OF_SCOPE', () => {
    const sets = [
      ['TRANSLATION_STATUS', new Set(Object.keys(TRANSLATION_STATUS))],
      ['KNOWN_OUT_OF_SCOPE', new Set(Object.keys(KNOWN_OUT_OF_SCOPE))],
      ['DYNAMIC_PUBLIC_OUT_OF_SCOPE', new Set(Object.keys(DYNAMIC_PUBLIC_OUT_OF_SCOPE))],
    ];
    const overlaps = [];
    for (let i = 0; i < sets.length; i++) {
      for (let j = i + 1; j < sets.length; j++) {
        for (const path of sets[i][1]) {
          if (sets[j][1].has(path)) overlaps.push({ path, in: [sets[i][0], sets[j][0]] });
        }
      }
    }
    expect(overlaps).toEqual([]);
  });

  it('every registered route that has at least one draft language is wrapped in TranslationGate in App.jsx', () => {
    const needsGate = Object.entries(TRANSLATION_STATUS)
      .filter(([, entry]) => Object.values(entry.languages).some((l) => l.status === 'draft'))
      .map(([path]) => path);
    const gated = new Set(routes.filter((r) => r.tags.has('TranslationGate')).map((r) => r.path));
    const missingGate = needsGate.filter((path) => !gated.has(path));
    expect(missingGate).toEqual([]);
  });
});
