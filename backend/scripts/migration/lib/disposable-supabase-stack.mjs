// A per-run, isolated copy of a Supabase-CLI stack definition.
//
// `supabase start` binds the host ports written in config.toml and names
// its containers/volumes after project_id. With one fixed copy, two runs
// (or a leftover stack) collide, and a fixed port can already be held by
// something else on the host -- CI hit exactly that: "failed to bind host
// port for 0.0.0.0:59442: address already in use". This copies the
// template's supabase/config.toml into a fresh temp workdir with:
//   - a unique project_id, so containers and volumes belong to this run only;
//   - every enabled host port replaced by a randomly chosen port that is
//     free right now, drawn from 20000-32767 -- below Linux's ephemeral
//     range (32768-60999), where the host's own outgoing connections pick
//     their source ports.
import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

const PORT_MIN = 20000;
const PORT_MAX = 32767;

function isFree(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.listen({ port, host: '0.0.0.0', exclusive: true }, () => server.close(() => resolve(true)));
  });
}

/** `count` distinct ports, random within 20000-32767, each free at the time of the check. */
export async function pickFreePorts(count) {
  const picked = new Set();
  for (let attempts = 0; picked.size < count; attempts++) {
    if (attempts > 500) throw new Error(`could not find ${count} free ports in ${PORT_MIN}-${PORT_MAX}`);
    const port = PORT_MIN + crypto.randomInt(PORT_MAX - PORT_MIN + 1);
    if (!picked.has(port) && (await isFree(port))) picked.add(port);
  }
  return [...picked];
}

/**
 * Rewrites a config.toml: project_id becomes `projectId`, and every
 * `port = N` / `shadow_port = N` assignment that is not commented out gets
 * the next port from `ports`. Returns the new text and the ports used per
 * key path (`[section].key`).
 */
export function rewriteStackConfig(text, { projectId, ports }) {
  let section = '';
  let next = 0;
  const assigned = {};
  const lines = text.split('\n').map((line) => {
    const header = /^\s*\[([^\]]+)\]\s*$/.exec(line);
    if (header) section = header[1];
    if (/^\s*project_id\s*=/.test(line)) return `project_id = "${projectId}"`;
    const port = /^(\s*)((?:shadow_)?port)\s*=\s*\d+\s*$/.exec(line);
    if (port) {
      if (next >= ports.length) throw new Error('not enough ports for the stack config');
      const value = ports[next++];
      assigned[`[${section}].${port[2]}`] = value;
      return `${port[1]}${port[2]} = ${value}`;
    }
    return line;
  });
  return { text: lines.join('\n'), assigned };
}

function countPortLines(text) {
  return text.split('\n').filter((l) => /^\s*(?:shadow_)?port\s*=\s*\d+\s*$/.test(l)).length;
}

/**
 * Creates the isolated workdir. `templateDir` contains supabase/config.toml.
 * Returns { workdir, projectId, ports, remove() }.
 */
export async function prepareIsolatedStack(templateDir, { prefix = 'disposable' } = {}) {
  const template = fs.readFileSync(path.join(templateDir, 'supabase', 'config.toml'), 'utf8');
  const projectId = `${prefix}-${crypto.randomBytes(4).toString('hex')}`;
  const ports = await pickFreePorts(countPortLines(template));
  const { text, assigned } = rewriteStackConfig(template, { projectId, ports });
  const workdir = fs.mkdtempSync(path.join(os.tmpdir(), `${projectId}-`));
  fs.mkdirSync(path.join(workdir, 'supabase'));
  fs.writeFileSync(path.join(workdir, 'supabase', 'config.toml'), text);
  return {
    workdir,
    projectId,
    ports: assigned,
    remove: () => fs.rmSync(workdir, { recursive: true, force: true }),
  };
}
