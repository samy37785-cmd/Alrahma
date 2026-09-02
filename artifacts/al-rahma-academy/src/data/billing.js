// Display-only placeholder invoices shown when the real billing API returns
// no data (see useBilling.js) — never submitted anywhere, so renaming the
// `plan` field to match the live plan names (Noorani/Huffaz) is a safe,
// display-only fix, not an internal identifier/payment-behavior change.
// Amounts were already Noorani's/Huffaz's real prices; only the label was
// stale.
export const sampleInvoices = [
  { id: 'INV-2025-006', date: '2025-06-01', plan: 'Noorani', originalAmount: 75,  amount: 56,  discountPct: 25, status: 'paid' },
  { id: 'INV-2025-005', date: '2025-05-01', plan: 'Noorani', originalAmount: 75,  amount: 56,  discountPct: 25, status: 'paid' },
  { id: 'INV-2025-004', date: '2025-04-01', plan: 'Noorani', originalAmount: 75,  amount: 56,  discountPct: 25, status: 'paid' },
  { id: 'INV-2025-003', date: '2025-03-01', plan: 'Huffaz',  originalAmount: 112, amount: 84,  discountPct: 25, status: 'paid' },
  { id: 'INV-2025-002', date: '2025-02-01', plan: 'Huffaz',  originalAmount: 112, amount: 84,  discountPct: 25, status: 'paid' },
  { id: 'INV-2025-001', date: '2025-01-01', plan: 'Noorani', originalAmount: 75,  amount: 56,  discountPct: 25, status: 'paid' },
];
