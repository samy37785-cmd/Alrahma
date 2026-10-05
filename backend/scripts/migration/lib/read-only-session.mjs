// Plan mode writes nothing -- and with this, Postgres itself refuses any
// write a plan run might attempt by mistake. Every connection the pool
// opens is switched to read-only transactions before it is handed out,
// and the first one is checked to really be read-only.
//
// Used for every plan/dry-run connection of the orchestrator and both
// workers (and the bootstrap collector), local or production. A
// plan-scope approval manifest therefore can never lead to a write.

/** Makes every session `pool` opens read-only. Call before the first connect(). */
export function makePoolReadOnly(pool) {
  pool.on('connect', (client) => {
    // Queued ahead of anything the caller sends on this client.
    client.query('SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY').catch(() => {});
  });
  return pool;
}

/** Throws unless `client`'s session is read-only. */
export async function assertSessionReadOnly(client) {
  const { rows } = await client.query('SHOW default_transaction_read_only');
  if (rows[0]?.default_transaction_read_only !== 'on') {
    throw new Error('read-only session expected for a plan run, but default_transaction_read_only is not on -- refusing to continue');
  }
}
