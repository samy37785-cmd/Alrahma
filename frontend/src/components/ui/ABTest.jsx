import { useMemo } from 'react';
import { assignVariant } from '../../utils/abTestAssignment';
import { ABContext } from '../../context/ABTestContext';

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
