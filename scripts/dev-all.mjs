// Local dev launcher: runs the Express backend (port 5000) and the Vite
// frontend (port 3000) together, prefixing each line of output so the two
// streams stay readable. Ctrl+C stops both.
//
// Expects a local MongoDB at backend/.env's MONGO_URI (see README) and
// artifacts/al-rahma-academy/.env.local's VITE_API_URL pointing at the backend.
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
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
