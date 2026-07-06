import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useInvoices, BILLING_KEYS } from '../hooks/useBilling';
import { sampleInvoices } from '../data/billing';

// Coverage for useBilling.js (previously untested — the highest-risk frontend
// gap identified by the discovery audit, since it drives the real-money
// Billing page). Mocks only the api/ network boundary (paymentApi.js), the
// same level every other hook test in this suite mocks at — the hook's own
// transform logic (toUiInvoice) and fallback behaviour are exercised for
// real, not reimplemented.

vi.mock('../api/paymentApi.js', () => ({
  getInvoices: vi.fn(),
}));

import * as client from '../api/paymentApi.js';

function wrapper({ retry = 0 } = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry } } });
  function Wrapper({ children }) { return <QueryClientProvider client={qc}>{children}</QueryClientProvider>; }
  return Wrapper;
}

const realInvoice = {
  _id: 'mongo-id-1',
  invoiceNumber: 'INV-2026-002',
  createdAt: '2026-02-01T00:00:00.000Z',
  plan: 'Standard',
  originalAmount: 112,
  amount: 84,
  discountPct: 25,
  status: 'paid',
};

describe('useInvoices', () => {
  beforeEach(() => vi.clearAllMocks());

  // ---------------------------------------------------------------------
  // Loading state
  // ---------------------------------------------------------------------
  it('loading state: placeholder sample data is available immediately, and isFetching clears once the real request resolves', async () => {
    let resolveFetch;
    client.getInvoices.mockReturnValue(new Promise((r) => { resolveFetch = r; }));

    const { result } = renderHook(() => useInvoices(true), { wrapper: wrapper() });

    // Immediately (before the network call resolves): placeholder data is
    // already present (this is what Billing.jsx's `isLoading` check keys
    // off of — placeholderData means the skeleton is skipped, not shown).
    expect(result.current.data).toEqual(sampleInvoices);
    expect(result.current.isPlaceholderData).toBe(true);
    expect(result.current.isFetching).toBe(true);

    resolveFetch([realInvoice]);
    await waitFor(() => expect(result.current.isFetching).toBe(false));
    expect(result.current.isPlaceholderData).toBe(false);
  });

  // ---------------------------------------------------------------------
  // Successful billing flow
  // ---------------------------------------------------------------------
  it('successful flow: maps real invoice fields to the UI shape used by Billing.jsx', async () => {
    client.getInvoices.mockResolvedValue([realInvoice]);

    const { result } = renderHook(() => useInvoices(true), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isPlaceholderData).toBe(false));

    expect(result.current.data).toEqual([{
      id: 'INV-2026-002',
      date: '2026-02-01T00:00:00.000Z',
      plan: 'Standard',
      originalAmount: 112,
      amount: 84,
      discountPct: 25,
      status: 'paid',
    }]);
  });

  it('successful flow: an invoice missing invoiceNumber/createdAt falls back to _id/date', async () => {
    client.getInvoices.mockResolvedValue([{
      _id: 'mongo-id-2', date: '2026-03-01', plan: 'Starter',
      originalAmount: 75, amount: 56, discountPct: 25, status: 'paid',
    }]);

    const { result } = renderHook(() => useInvoices(true), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isPlaceholderData).toBe(false));

    expect(result.current.data[0].id).toBe('mongo-id-2');
    expect(result.current.data[0].date).toBe('2026-03-01');
  });

  // ---------------------------------------------------------------------
  // Genuinely-empty account (real API call succeeds, user just has 0 invoices)
  // ---------------------------------------------------------------------
  // NOTE: this is not a "failed" case — getInvoices resolves successfully
  // with []. Documented here because it is indistinguishable, from the
  // hook's output alone, from the network-failure case below: both produce
  // sampleInvoices. See the flagged observation in the task report — this
  // is existing, intentional-looking behaviour (comment in useBilling.js
  // says it "preserves original Billing.jsx behaviour"), not something
  // introduced or changed by this test file.
  it('a real, successful response with zero invoices also falls back to sample data (existing behaviour, not something this test suite changes)', async () => {
    client.getInvoices.mockResolvedValue([]);

    const { result } = renderHook(() => useInvoices(true), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isPlaceholderData).toBe(false));

    expect(result.current.data).toEqual(sampleInvoices);
  });

  // ---------------------------------------------------------------------
  // Failed billing flow / error state
  // ---------------------------------------------------------------------
  it('failed flow: a rejected request resolves successfully with sample data rather than surfacing an error state', async () => {
    client.getInvoices.mockRejectedValue(new Error('Network Error'));

    const { result } = renderHook(() => useInvoices(true), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isPlaceholderData).toBe(false));

    expect(result.current.isError).toBe(false);
    expect(result.current.isSuccess).toBe(true);
    expect(result.current.data).toEqual(sampleInvoices);
  });

  // ---------------------------------------------------------------------
  // Retry behaviour
  // ---------------------------------------------------------------------
  it('retry behaviour: a rejected request is never retried, because the hook catches the error inside queryFn before React Query ever sees a rejection', async () => {
    client.getInvoices.mockRejectedValue(new Error('Network Error'));

    // Uses real React Query retry defaults (not retry:0) so this test would
    // actually fail — by observing multiple calls — if a future change
    // removed the internal try/catch and let the rejection propagate.
    const { result } = renderHook(() => useInvoices(true), { wrapper: wrapper({ retry: 3 }) });
    await waitFor(() => expect(result.current.isPlaceholderData).toBe(false));

    expect(client.getInvoices).toHaveBeenCalledTimes(1);
  });

  // ---------------------------------------------------------------------
  // enabled flag (Billing.jsx passes `!!user` — no session, no request)
  // ---------------------------------------------------------------------
  it('enabled=false (e.g. no logged-in user): never calls the API', () => {
    client.getInvoices.mockResolvedValue([realInvoice]);

    const { result } = renderHook(() => useInvoices(false), { wrapper: wrapper() });

    expect(client.getInvoices).not.toHaveBeenCalled();
    // Placeholder data is still surfaced even while disabled, matching what
    // Billing.jsx destructures as `data`.
    expect(result.current.data).toEqual(sampleInvoices);
  });

  // ---------------------------------------------------------------------
  // Cache invalidation
  // ---------------------------------------------------------------------
  // Not implemented anywhere in the codebase: no mutation calls
  // queryClient.invalidateQueries(BILLING_KEYS.invoices), so there is no
  // invalidation behaviour to test. Documented as a gap rather than
  // silently skipped. This assertion just locks in the query key shape
  // so a future invalidation call site has a stable target.
  it('exposes a stable query key for future cache-invalidation call sites', () => {
    expect(BILLING_KEYS.invoices).toEqual(['billing', 'invoices']);
  });
});
