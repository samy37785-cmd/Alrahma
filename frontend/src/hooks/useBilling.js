import { useQuery } from '@tanstack/react-query';
import { getInvoices } from '../api/paymentApi';
import { sampleInvoices } from '../data/billing';

export const BILLING_KEYS = {
  invoices: ['billing', 'invoices'],
};

function toUiInvoice(inv) {
  return {
    id:             inv.invoiceNumber || inv._id,
    date:           inv.createdAt    || inv.date,
    plan:           inv.plan,
    originalAmount: inv.originalAmount,
    amount:         inv.amount,
    discountPct:    inv.discountPct,
    status:         inv.status,
  };
}

export function useInvoices(enabled = true) {
  return useQuery({
    queryKey: BILLING_KEYS.invoices,
    queryFn: async () => {
      try {
        const data = await getInvoices();
        return data.length ? data.map(toUiInvoice) : sampleInvoices;
      } catch {
        // Silently fall back to sample data — preserves original Billing.jsx behaviour.
        return sampleInvoices;
      }
    },
    enabled,
    placeholderData: sampleInvoices,
  });
}
