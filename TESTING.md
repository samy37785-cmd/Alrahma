# Testing Guide — Al-Rahma Academy

## Overview

| Layer | Framework | Runner | Location |
|-------|-----------|--------|----------|
| Backend unit | Node built-in test | `node --test` | `backend/tests/` |
| Frontend unit | Vitest | `vitest` | `frontend/src/test/` |
| Component | Testing Library | via Vitest | `frontend/src/test/` |
| E2E | Playwright | `playwright test` | `tests/` (root) |

## Running Tests

```bash
# All tests (backend + frontend)
npm test

# Backend only
npm run test:backend

# Frontend only
npm run test:frontend

# Frontend with HTML coverage report
npm run test:coverage

# Frontend in watch mode (during development)
cd frontend && npm run test:watch
```

## Backend Test Files

| File | What it tests |
|------|--------------|
| `health.test.js` | Server health endpoint availability |
| `plans.test.js` | Pricing plan structure validation |
| `subscription.test.js` | Subscription lifecycle business logic |
| `courseLock.test.js` | Course access gate enforcement |
| `coupon.test.js` | Coupon validity + discount calculation |
| `csrf.test.js` | CSRF token generation + validation |

## Frontend Test Files

| File | What it tests |
|------|--------------|
| `ThemeContext.test.jsx` | Dark/light mode toggle + persistence |
| `useWishlist.test.jsx` | Wishlist queries + mutations |
| `useSearch.test.jsx` | Search query enablement + results |

## Writing Backend Tests

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('MyFeature', () => {
  it('does the right thing', () => {
    assert.equal(myFunction(input), expected);
  });
});
```

No mocking library needed — Node's built-in `test` and `assert/strict` are sufficient for pure unit tests. Integration tests that require a running DB should be skipped in CI unless `MONGO_URI` is set.

## Writing Frontend Tests

```jsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import MyComponent from '../components/MyComponent';

describe('MyComponent', () => {
  it('renders correctly', () => {
    render(<MyComponent />);
    expect(screen.getByText('expected text')).toBeInTheDocument();
  });
});
```

### Wrapping with Providers

Most hooks need `QueryClientProvider`:

```jsx
function wrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: 0 } } });
  return ({ children }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

const { result } = renderHook(() => useMyHook(), { wrapper: wrapper() });
```

## E2E Tests (Playwright)

Playwright is installed at the root. To run:

```bash
npx playwright test
```

Requires the dev server to be running. Configure browsers and base URL in `playwright.config.js`.

## Coverage Targets

| Layer | Target |
|-------|--------|
| Backend business logic | 80%+ |
| Frontend hooks | 70%+ |
| Frontend components (critical paths) | 60%+ |
