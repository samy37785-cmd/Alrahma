import net from 'node:net';

// Unit tests must not reach a real server. Several files stub `fetch` to "allow
// no network", but axios goes through jsdom's XMLHttpRequest, which that stub
// does not cover: a full run (2026-10-21, every outbound connection logged)
// still sent requests to api.quran.com from five of them. Whether the reply
// arrived, and how fast, could then change what a test saw.
//
// Installed once per worker from setup.js: every TCP connection to a host other
// than this machine fails at once with ECONNREFUSED, as if offline. Loopback
// (local test servers, the browser of the layout tests) is unaffected.
const INSTALLED = Symbol.for('alrahma.test.blockNetwork');
const LOOPBACK = /^(localhost|127(?:\.\d{1,3}){3}|::1|\[::1\]|0\.0\.0\.0)$/i;

/** The host a `Socket#connect(...)` call targets, or null for a local IPC path. */
export function connectTarget(args) {
  let first = args[0];
  if (Array.isArray(first)) first = first[0]; // net.connect() passes its normalized [options, cb]
  if (first && typeof first === 'object') return first.path ? null : String(first.host ?? 'localhost');
  if (typeof first === 'string' && !/^\d+$/.test(first)) return null; // an IPC path
  return typeof args[1] === 'string' ? args[1] : 'localhost';
}

export const isLoopback = (host) => LOOPBACK.test(host);

export function blockNetwork() {
  const proto = net.Socket.prototype;
  if (proto[INSTALLED]) return;
  const connect = proto.connect;
  proto.connect = function connectLoopbackOnly(...args) {
    const host = connectTarget(args);
    if (host !== null && !isLoopback(host)) {
      const error = new Error(`connect ECONNREFUSED ${host}: unit tests may not use the network (src/test/utils/blockNetwork.js)`);
      error.code = 'ECONNREFUSED';
      process.nextTick(() => this.destroy(error));
      return this;
    }
    return connect.apply(this, args);
  };
  Object.defineProperty(proto, INSTALLED, { value: true });
}
