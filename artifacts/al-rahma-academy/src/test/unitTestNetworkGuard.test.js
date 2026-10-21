import { describe, it, expect, afterAll } from 'vitest';
import http from 'node:http';
import axios from 'axios';
import { connectTarget, isLoopback } from './utils/blockNetwork';

// setup.js installs utils/blockNetwork.js for every test file. These tests use
// the guard as installed there: no request below leaves this machine.
const quickly = 2000; // a refused connection fails at once; a real one would take longer or succeed

describe('unit tests cannot reach a real server', () => {
  it('fetch to an outside host fails at once, as if offline', async () => {
    const started = Date.now();
    const error = await fetch('https://example.com/').then(() => null, (e) => e);
    expect(error, 'fetch must fail').toBeInstanceOf(Error);
    expect(String(error.cause?.message ?? error.message)).toMatch(/unit tests may not use the network/);
    expect(Date.now() - started).toBeLessThan(quickly);
  });

  it('axios (jsdom XMLHttpRequest, which a fetch stub does not cover) fails at once too', async () => {
    const started = Date.now();
    const error = await axios.get('https://api.quran.com/api/v4/chapters').then(() => null, (e) => e);
    expect(error, 'the request must fail').toBeInstanceOf(Error);
    expect(error.response).toBeUndefined();
    expect(Date.now() - started).toBeLessThan(quickly);
  });

  describe('a server on this machine still answers', () => {
    const server = http.createServer((req, res) => res.end('local ok'));
    const listening = new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    afterAll(() => new Promise((resolve) => server.close(resolve)));

    it('fetch to 127.0.0.1', async () => {
      await listening;
      const res = await fetch(`http://127.0.0.1:${server.address().port}/`);
      expect(await res.text()).toBe('local ok');
    });
  });

  it('reads the target host of every Socket#connect call shape', () => {
    expect(connectTarget([{ host: 'api.quran.com', port: 443 }])).toBe('api.quran.com');
    expect(connectTarget([[{ host: 'example.com', port: 80 }, () => {}]])).toBe('example.com');
    expect(connectTarget([{ port: 80 }])).toBe('localhost');
    expect(connectTarget([443, 'example.com'])).toBe('example.com');
    expect(connectTarget([443])).toBe('localhost');
    expect(connectTarget([{ path: '/tmp/x.sock' }])).toBeNull();
    expect(connectTarget(['/tmp/x.sock'])).toBeNull();
    for (const host of ['localhost', '127.0.0.1', '127.1.2.3', '::1', '[::1]']) expect(isLoopback(host), host).toBe(true);
    for (const host of ['example.com', '10.0.0.1', '192.168.1.1', '127.example.com']) expect(isLoopback(host), host).toBe(false);
  });
});
