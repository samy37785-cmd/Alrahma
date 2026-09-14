// Review follow-up (auth hardening batch): a handful of admin sub-resources
// (currently /v1/admin/trials, /v1/admin/subscribers) only have a real
// MongoDB implementation. Mounting that Mongo-mode router directly under
// DATA_BACKEND=supabase would not fail loudly — app.js deliberately never
// calls connectDB() in supabase mode (Postgres is the real datastore then),
// so every Mongoose query from those controllers would sit buffering
// against a connection that will never open, eventually failing with an
// opaque "operation buffering timed out" 500 with no indication that the
// real problem is "this feature has no Supabase adapter yet." An explicit,
// immediate 501 says exactly that instead.
export function backendNotImplemented(feature) {
  return (req, res) => {
    res.status(501).json({
      error:   'NOT_IMPLEMENTED_FOR_BACKEND',
      message: `${feature} has no DATA_BACKEND=supabase implementation yet.`,
    });
  };
}
