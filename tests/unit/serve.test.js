// U5 (SPEC_ETAPPE2 chapter 10): local server. Index under /app/, MIME types,
// refusal of path tricks, binding to 127.0.0.1 only.

import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { startServer } from '../../tools/serve.js';

const SECRET = 'TOP-SECRET-OUTSIDE-ROOT';
let tmp;
let site;
let repoServer;
let siteServer;

/** Raw GET without URL normalisation. */
function get(server, target, { method = 'GET', headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: '127.0.0.1', port: server.address().port, path: target, method, headers },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString('utf8') }));
      },
    );
    req.on('error', reject);
    req.end();
  });
}

before(async () => {
  tmp = mkdtempSync(path.join(os.tmpdir(), 'gs-serve-'));
  site = path.join(tmp, 'site');
  mkdirSync(path.join(site, 'app'), { recursive: true });
  mkdirSync(path.join(site, '.git'));
  writeFileSync(path.join(tmp, 'secret.txt'), SECRET);
  writeFileSync(path.join(site, 'secret-inside.txt'), 'inside');
  writeFileSync(path.join(site, '.git', 'config'), 'git-config');
  writeFileSync(path.join(site, 'app', 'index.html'), '<!doctype html><title>t</title>');
  writeFileSync(path.join(site, 'a.html'), '<p>a</p>');
  writeFileSync(path.join(site, 'a.js'), 'export default 1;');
  writeFileSync(path.join(site, 'a.css'), 'body{}');
  writeFileSync(path.join(site, 'a.json'), '{}');
  writeFileSync(path.join(site, 'a.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
  repoServer = await startServer(0);
  siteServer = await startServer(0, { root: site });
});

after(async () => {
  await Promise.all([repoServer, siteServer].map((s) => new Promise((r) => s.close(r))));
  rmSync(tmp, { recursive: true, force: true });
});

test('U5 index is served under /app/ (repository root)', async () => {
  const r = await get(repoServer, '/app/');
  assert.equal(r.status, 200);
  assert.match(r.headers['content-type'], /^text\/html/);
  assert.match(r.body, /<html/i);
});

test('U5 "/" redirects to /app/, "/app" to "/app/"', async () => {
  const a = await get(siteServer, '/');
  assert.equal(a.status, 302);
  assert.equal(a.headers.location, '/app/');
  const b = await get(siteServer, '/app');
  assert.equal(b.status, 301);
  assert.equal(b.headers.location, '/app/');
});

test('U5 MIME types: .js is text/javascript, plus html, css, json, svg', async () => {
  const expect = {
    '/a.js': /^text\/javascript/,
    '/a.html': /^text\/html/,
    '/a.css': /^text\/css/,
    '/a.json': /^application\/json/,
    '/a.svg': /^image\/svg\+xml/,
  };
  for (const [url, re] of Object.entries(expect)) {
    const r = await get(siteServer, url);
    assert.equal(r.status, 200, url);
    assert.match(r.headers['content-type'], re, url);
  }
  const real = await get(repoServer, '/core/index.js');
  assert.equal(real.status, 200);
  assert.match(real.headers['content-type'], /^text\/javascript/);
});

test('U5 HEAD works, other methods are refused', async () => {
  const h = await get(siteServer, '/a.js', { method: 'HEAD' });
  assert.equal(h.status, 200);
  assert.equal(h.body, '');
  const p = await get(siteServer, '/a.js', { method: 'POST' });
  assert.equal(p.status, 405);
});

test('U5 missing file answers 404', async () => {
  assert.equal((await get(siteServer, '/nope.js')).status, 404);
});

const TRICKS = [
  '/../secret.txt',
  '/app/../../secret.txt',
  '/%2e%2e/secret.txt',
  '/%2E%2E/secret.txt',
  '/%2e%2e%2fsecret.txt',
  '/app/%2e%2e/%2e%2e/secret.txt',
  '/..%2fsecret.txt',
  '/..%5csecret.txt',
  '/..\\secret.txt',
  '/app\\..\\..\\secret.txt',
  '/%5c..%5csecret.txt',
  '/%252e%252e/secret.txt',
  '/..;/secret.txt',
  '/....//secret.txt',
];

for (const target of TRICKS) {
  test(`U5 refused: ${target}`, async () => {
    const r = await get(siteServer, target);
    assert.ok([400, 403, 404].includes(r.status), `status ${r.status}`);
    assert.ok(!r.body.includes(SECRET));
  });
}

test('U5 refused: absolute paths and drive paths', async () => {
  const absolute = [
    path.join(tmp, 'secret.txt').replaceAll('\\', '/'),
    '/' + path.join(tmp, 'secret.txt').replaceAll('\\', '/'),
    '/' + encodeURIComponent(path.join(tmp, 'secret.txt')),
    '/C:/Windows/win.ini',
    '/C%3A/Windows/win.ini',
    '//' + path.join(tmp, 'secret.txt').replaceAll('\\', '/'),
    '/etc/passwd',
    'http://127.0.0.1/../secret.txt',
  ];
  for (const target of absolute) {
    const r = await get(siteServer, target);
    assert.ok([400, 403, 404].includes(r.status), `${target}: status ${r.status}`);
    assert.ok(!r.body.includes(SECRET), target);
  }
});

test('U5 the repository server does not deliver files outside the repo', async () => {
  for (const target of ['/../package.json', '/%2e%2e/package.json', '/app/..%2f..%2f..%2fpackage.json']) {
    const r = await get(repoServer, target);
    assert.ok([400, 403, 404].includes(r.status), `${target}: ${r.status}`);
  }
  // sibling check: the repository package.json is reachable only by its own path
  assert.equal((await get(repoServer, '/package.json')).status, 200);
});

test('U5 dot-files and dot-folders are refused', async () => {
  const r = await get(siteServer, '/.git/config');
  assert.ok([403, 404].includes(r.status));
  assert.ok(!r.body.includes('git-config'));
});

test('U5 foreign Host header is refused (DNS rebinding)', async () => {
  const r = await get(siteServer, '/a.js', { headers: { Host: 'evil.example' } });
  assert.equal(r.status, 403);
});

test('U5 server listens on 127.0.0.1 only', async () => {
  for (const s of [repoServer, siteServer]) {
    const a = s.address();
    assert.equal(a.address, '127.0.0.1');
    assert.equal(a.family, 'IPv4');
  }
  // no other local IPv4 address answers on the same port
  const others = Object.values(os.networkInterfaces())
    .flat()
    .filter((i) => i && i.family === 'IPv4' && i.address !== '127.0.0.1');
  for (const i of others) {
    const refused = await new Promise((resolve) => {
      const sock = net.connect({ host: i.address, port: siteServer.address().port, timeout: 1500 });
      sock.on('connect', () => { sock.destroy(); resolve(false); });
      sock.on('error', () => resolve(true));
      sock.on('timeout', () => { sock.destroy(); resolve(true); });
    });
    assert.ok(refused, `${i.address} must not accept connections`);
  }
});
