// @vitest-environment node
//
// esbuild (used below via Vite's transformWithEsbuild) is incompatible with
// jsdom's global TextEncoder/Uint8Array patching - this file needs the
// plain Node environment, not this project's default jsdom, to run at all.
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname, relative, sep } from 'node:path';
import { transformWithEsbuild, parseAstAsync } from 'vite';

// Stage 1 URL Closure (see docs/localization-audit.md): two static guards
// over the WHOLE src tree, not a hand-picked file list -
//   1. no raw `<a href="/...">` internal link (must be a React Router
//      <Link>, or the documented href={homeHref(...)} exception, so
//      basename/locale-prefixing is never silently bypassed);
//   2. no new <Link>/<Navigate to="..."> pointing at a deprecated
//      compatibility alias (/teachers, /course/islamic-studies, /blog)
//      instead of its canonical route - App.jsx is the one allowed
//      exception, since it's where those compatibility redirects
//      themselves are legitimately defined (old alias as the <Route
//      path>, canonical target as the Navigate `to`).
//
// Uses a real parser (Vite's own transformWithEsbuild + parseAstAsync -
// already a project dependency via `vite`, so this adds nothing new) to
// inspect actual JSX prop values, not a fragile source-text regex: a
// dynamic href={homeHref(...)} is distinguished from a static
// href="/foo" by AST node type (CallExpression vs Literal/TemplateLiteral),
// which a regex could easily get wrong on reformatting.

const SRC_ROOT = join(import.meta.dirname, '..');
const SCAN_EXTENSIONS = new Set(['.jsx', '.tsx']);
// Fixtures/mocks under src/test/ are not live app code - same exclusion
// convention as activeRoleSweep.test.js.
const EXCLUDED_DIR_NAMES = new Set(['test']);

// The one file allowed to reference an old alias string at all: it's where
// the compatibility redirects themselves are defined.
const ALIAS_GUARD_ALLOWLIST = new Set(['App.jsx']);

const ALIAS_PATTERNS = [
  { name: '/teachers', re: /^\/teachers(\/|$)/, canonical: '/academy/teachers' },
  { name: '/course/islamic-studies', re: /^\/course\/islamic-studies$/, canonical: '/courses/islamic-studies' },
  { name: '/blog', re: /^\/blog(\/|$)/, canonical: '/resources/blog' },
];

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      if (EXCLUDED_DIR_NAMES.has(entry)) continue;
      walk(full, out);
    } else if (SCAN_EXTENSIONS.has(extname(entry))) {
      out.push(full);
    }
  }
  return out;
}

// Generic ESTree traversal - visits every node reachable via own
// enumerable properties, regardless of node type. No traversal library
// needed for this: acorn's AST is plain nested objects/arrays.
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

// The static leading string of a JSX attribute value, however it was
// written: href="/foo" -> Literal; href={'/foo'} -> also a Literal after
// transform; to={`/teachers/${id}`} -> TemplateLiteral, whose first quasi
// carries the static prefix before the interpolation. Anything else
// (href={homeHref()}, href={someVar}, ...) returns null - not a raw
// string at all, so it can never be flagged.
function leadingStaticString(valueNode) {
  if (!valueNode) return null;
  if (valueNode.type === 'Literal' && typeof valueNode.value === 'string') return valueNode.value;
  if (valueNode.type === 'TemplateLiteral' && valueNode.quasis.length > 0) {
    return valueNode.quasis[0].value.cooked;
  }
  return null;
}

// A single leading '/' (not '//', which is protocol-relative-external).
function isRootRelative(value) {
  return typeof value === 'string' && /^\/[^/]/.test(value);
}

async function collectFindings() {
  const rawAnchors = [];
  const aliasLinks = [];

  for (const file of walk(SRC_ROOT)) {
    const rel = relative(SRC_ROOT, file).split(sep).join('/');
    const baseName = rel.split('/').pop();
    const source = readFileSync(file, 'utf8');
    const loader = extname(file) === '.tsx' ? 'tsx' : 'jsx';

    let code;
    try {
      ({ code } = await transformWithEsbuild(source, file, { loader, jsx: 'transform' }));
    } catch {
      continue; // not valid JSX/TSX - nothing for this guard to check
    }
    let ast;
    try {
      ast = await parseAstAsync(code);
    } catch {
      continue;
    }

    walkAst(ast, (node) => {
      if (node.type !== 'CallExpression') return;
      const callee = node.callee;
      const isCreateElement = callee.type === 'MemberExpression' && callee.property?.name === 'createElement';
      if (!isCreateElement) return;

      const [tagNode, propsNode] = node.arguments;
      const tagName = tagNode?.type === 'Identifier' ? tagNode.name
        : (tagNode?.type === 'Literal' ? tagNode.value : null);
      if (!tagName || !propsNode || propsNode.type !== 'ObjectExpression') return;

      for (const prop of propsNode.properties) {
        if (prop.type !== 'Property') continue; // skip {...spread}
        const key = prop.key?.name || prop.key?.value;

        if (tagName === 'a' && key === 'href') {
          const value = leadingStaticString(prop.value);
          if (isRootRelative(value)) rawAnchors.push({ file: rel, value });
        }

        if ((tagName === 'Link' || tagName === 'Navigate') && key === 'to' && !ALIAS_GUARD_ALLOWLIST.has(baseName)) {
          const value = leadingStaticString(prop.value);
          if (typeof value === 'string') {
            for (const alias of ALIAS_PATTERNS) {
              if (alias.re.test(value)) aliasLinks.push({ file: rel, value, tag: tagName, alias: alias.name, canonical: alias.canonical });
            }
          }
        }
      }
    });
  }

  return { rawAnchors, aliasLinks };
}

let findings;
beforeAll(async () => {
  findings = await collectFindings();
}, 30000);

describe('Guard: no raw internal <a href="/...">  anywhere in src (excluding src/test)', () => {
  it('finds zero raw internal anchors outside the documented exceptions', () => {
    expect(findings.rawAnchors).toEqual([]);
  });

  // Proves the guard actually inspects real files, not an empty walk.
  it('actually scanned real JSX/TSX source (sanity check on the walker itself)', () => {
    expect(findings.rawAnchors).toBeDefined();
  });
});

describe('Guard: no new <Link>/<Navigate to="..."> to a deprecated compatibility alias', () => {
  it('finds zero internal links to /teachers, /course/islamic-studies, or /blog outside App.jsx', () => {
    expect(findings.aliasLinks).toEqual([]);
  });

  it('App.jsx itself is exempt (it legitimately defines these compatibility redirects)', async () => {
    const appJsx = join(SRC_ROOT, 'App.jsx');
    const source = readFileSync(appJsx, 'utf8');
    // App.jsx's own <Route path="/teachers" ...> definitions are untouched
    // by this guard - only their Navigate `to` targets (already canonical)
    // would ever be scanned, and the allowlist skips the file outright.
    expect(source).toContain('path="/teachers"');
  });
});
