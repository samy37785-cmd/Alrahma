import { createContext, useContext, useMemo } from 'react';

// Deterministic variant assignment — same user always gets same variant.
// Uses a 32-bit FNV-1a hash on (experimentId + userId/anonymousId).
function fnv32a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (h * 0x01000193) >>> 0;
  }
  return h;
}

function getAnonymousId() {
  let id = localStorage.getItem('ab_anon_id');
  if (!id) {
    id = Math.random().toString(36).slice(2) + Date.now().toString(36);
    localStorage.setItem('ab_anon_id', id);
  }
  return id;
}

// Returns 0-based variant index deterministically for (experimentId, userId).
export function assignVariant(experimentId, numVariants = 2, userId = null) {
  const seed = userId || getAnonymousId();
  return fnv32a(experimentId + seed) % numVariants;
}

// Context so child components can read which variant they're in.
const ABContext = createContext(null);

/**
 * ABTest — render one of N children based on deterministic variant assignment.
 *
 * Usage:
 *   <ABTest id="hero-cta-copy" variants={['Get Started Free', 'Book a Free Trial']}>
 *     {(variant) => <button>{variant}</button>}
 *   </ABTest>
 *
 * Or with explicit variant children:
 *   <ABTest id="pricing-layout">
 *     <ABVariant>Layout A content</ABVariant>
 *     <ABVariant>Layout B content</ABVariant>
 *   </ABTest>
 */
export function ABTest({ id, variants, children, userId = null }) {
  const variantIdx = useMemo(
    () => assignVariant(id, variants ? variants.length : (Array.isArray(children) ? children.length : 2), userId),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [id, userId]
  );

  // If `variants` array of values provided, call children as render-prop
  if (variants) {
    return (
      <ABContext.Provider value={{ id, variantIdx, value: variants[variantIdx] }}>
        {typeof children === 'function' ? children(variants[variantIdx], variantIdx) : children}
      </ABContext.Provider>
    );
  }

  // Otherwise render only the matching child element
  const childArray = Array.isArray(children) ? children : [children];
  return (
    <ABContext.Provider value={{ id, variantIdx, value: variantIdx }}>
      {childArray[variantIdx] ?? childArray[0]}
    </ABContext.Provider>
  );
}

// Named variant wrapper — purely for readability; renders children as-is.
export function ABVariant({ children }) {
  return children;
}

// Hook to read current experiment context from within a variant.
export function useABTest() {
  return useContext(ABContext);
}
