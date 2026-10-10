// Local dev launcher: runs the Express backend (port 5000) and the Vite
// frontend (port 3000) together, prefixing each line of output so the two
// streams stay readable. Ctrl+C stops both.
//
// Expects a local MongoDB at backend/.env's MONGO_URI (see README) and
// artifacts/al-rahma-academy/.env.local's VITE_API_URL pointing at the backend.
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Optional local-Supabase overrides for the backend (see ops/local-dev/README.md).
// Process env wins over backend/.env, so these shadow the real project's keys.
// Refuses to continue if they would point anywhere but this machine.
function loadLocalSupabaseEnv() {
  const file = path.join(root, 'ops', 'local-dev', '.env.backend');
  if (!existsSync(file)) return {};
  const overrides = {};
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line);
    if (match) overrides[match[1]] = match[2];
  }
  for (const key of ['SUPABASE_URL', 'SUPABASE_DB_URL']) {
    if (overrides[key] && !['127.0.0.1', 'localhost'].includes(new URL(overrides[key]).hostname)) {
      throw new Error(`${file}: ${key} must be a local address; refusing to start.`);
    }
  }
  return overrides;
}
const backendEnv = loadLocalSupabaseEnv();

const services = [
  { name: 'backend ', cwd: path.join(root, 'backend'), cmd: 'npm run dev', port: 5000, extraEnv: backendEnv },
  { name: 'frontend', cwd: root, cmd: 'pnpm --filter ./artifacts/al-rahma-academy run dev --port 3000', port: 3000 },
];

// Refuse to start if either port is taken (usually an earlier copy of this
// stack still running): otherwise the backend comes up, the frontend dies
// with EADDRINUSE, and the launcher tears both down with a confusing error.
function portInUse(port) {
  const probe = (host) => new Promise((resolve) => {
    const socket = net.connect({ port, host });
    socket.setTimeout(1000);
    socket.once('connect', () => { socket.destroy(); resolve(true); });
    socket.once('timeout', () => { socket.destroy(); resolve(false); });
    socket.once('error', () => resolve(false));
  });
  return Promise.all([probe('127.0.0.1'), probe('::1')]).then((r) => r.includes(true));
}
function describeListener(port) {
  if (process.platform !== 'win32') return '';
  try {
    const line = execFileSync('netstat', ['-ano', '-p', 'tcp'], { encoding: 'utf8' })
      .split(/\r?\n/).find((l) => /LISTENING/.test(l) && new RegExp(`:${port}\\s`).test(l));
    const pid = line?.trim().split(/\s+/).pop();
    if (!pid) return '';
    const name = execFileSync('tasklist', ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH'], { encoding: 'utf8' }).split(',')[0].replace(/"/g, '');
    return ` by ${name} (PID ${pid}); stop it with: taskkill /PID ${pid} /T /F`;
  } catch {
    return '';
  }
}
const busy = [];
for (const { port } of services) if (await portInUse(port)) busy.push(port);
if (busy.length) {
  console.error('Not starting: the site is probably already running somewhere (open http://localhost:3000).');
  for (const port of busy) console.error(`  port ${port} is in use${describeListener(port)}`);
  console.error('Stop the other copy (Ctrl+C in its terminal), then run npm run start again.');
  process.exit(1);
}

const children = services.map(({ name, cwd, cmd, port, extraEnv }) => {
  // Pin PORT per service: a PORT exported in the parent shell (e.g. left over
  // from running the frontend alone) must not leak into the backend.
  const env = { ...process.env, ...extraEnv, PORT: String(port) };
  const child = spawn(cmd, { cwd, env, shell: true, stdio: ['ignore', 'pipe', 'pipe'] });
  const pipe = (stream, out) => {
    let buffer = '';
    stream.on('data', (chunk) => {
      buffer += chunk;
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop();
      for (const line of lines) out.write(`[${name}] ${line}\n`);
    });
  };
  pipe(child.stdout, process.stdout);
  pipe(child.stderr, process.stderr);
  child.on('exit', (code) => {
    console.log(`[${name}] exited with code ${code}`);
    shutdown(code ?? 1);
  });
  return child;
});

let stopping = false;
function shutdown(code) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (child.exitCode === null) {
      // shell:true on Windows wraps the command, so kill the whole tree.
      if (process.platform === 'win32') spawn('taskkill', ['/pid', String(child.pid), '/T', '/F']);
      else child.kill('SIGTERM');
    }
  }
  setTimeout(() => process.exit(code), 500);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
