// Stage 2J-B, PR #70 review round 7, item 1 -- a strict, shared CLI
// argument parser for every entrypoint script in this directory.
//
// Concrete bug this closes: both migrate-users-to-supabase-auth.mjs and
// production-import-orchestrator.mjs previously parsed flags ad hoc.
// production-import-orchestrator.mjs's own main() did `const execute =
// !!args.execute` where `args.execute` came from a generic `--key=value`
// splitter -- `--execute=false` parsed to the STRING `"false"`, and
// `!!"false"` is `true` in JavaScript (any non-empty string is truthy).
// A single stray `=false` on the command line silently turned an intended
// dry-run into a REAL --execute run. Neither script rejected an unknown or
// misspelled flag either (e.g. `--compansate`, a typo of `--compensate`)
// -- it was simply ignored, so a typo silently fell back to a DIFFERENT
// mode than the operator intended, with no error at all.
//
// This parser is used identically by every worker/orchestrator script:
//   - Every flag must be declared up front in `spec.flags` (allowlist).
//     An unrecognized `--foo` is a hard, fail-closed error, never
//     silently accepted or ignored.
//   - A `type: 'boolean'` flag (e.g. --execute, --compensate) must be
//     passed BARE, no `=value` at all -- `--execute=false`, `--execute=1`,
//     `--execute=` are ALL rejected outright, structurally eliminating the
//     truthy-string class of bug (there is no string value to coerce; the
//     flag is present or it is not).
//   - A `type: 'string'` flag (e.g. --approved-dispositions=<path>) must
//     carry a non-empty `=value`; bare or `=`-empty is rejected.
//   - Any flag passed more than once is rejected (no "last one wins").
//   - Any bare positional argument (doesn't start with `--`) is rejected.
//
// This module has zero I/O and zero side effects -- pure argv in, parsed
// object out or throw -- so it runs before ANY environment-variable read,
// database connection, or network call in every caller, structurally
// guaranteeing a bad/typo'd flag stops the process before it can touch
// anything.
export function parseStrictCliArgs(argv, spec) {
  const flags = spec?.flags ?? {};
  const parsed = {};
  const seen = new Set();

  for (const token of argv) {
    if (typeof token !== 'string' || !token.startsWith('--')) {
      throw new Error(`unexpected positional argument "${token}" -- every argument must be a --flag`);
    }
    const body = token.slice(2);
    const equalsAt = body.indexOf('=');
    const key = equalsAt === -1 ? body : body.slice(0, equalsAt);
    const hasValue = equalsAt !== -1;
    const rawValue = hasValue ? body.slice(equalsAt + 1) : null;

    if (!key) throw new Error('empty CLI flag ("--" alone) is not allowed');
    if (!Object.prototype.hasOwnProperty.call(flags, key)) {
      throw new Error(`unknown flag "--${key}" -- not one of: ${Object.keys(flags).map((k) => `--${k}`).join(', ')}`);
    }
    if (seen.has(key)) throw new Error(`--${key} was passed more than once -- pass each flag exactly once`);
    seen.add(key);

    const flagSpec = flags[key];
    if (flagSpec.type === 'boolean') {
      if (hasValue) {
        throw new Error(
          `--${key} is a boolean flag and must be passed bare (no "=value") -- got "--${key}=${rawValue}". ` +
          `A value after a boolean flag is never accepted, specifically so a mistake like "--${key}=false" can never ` +
          `be silently coerced to true.`
        );
      }
      parsed[key] = true;
    } else if (flagSpec.type === 'string') {
      if (!hasValue || rawValue === '') {
        throw new Error(`--${key} requires a non-empty "=<value>"`);
      }
      parsed[key] = rawValue;
    } else {
      // Defensive -- every flag declared in a spec must have a real type;
      // an unrecognized type in the SPEC ITSELF is a programmer error in
      // this codebase, not operator input, so it fails loudly rather than
      // silently treating the flag as either kind.
      throw new Error(`internal error: flag "--${key}" has an unrecognized spec type "${flagSpec.type}"`);
    }
  }

  return parsed;
}
