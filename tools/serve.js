#!/usr/bin/env node
// Local static file server for the GroundSlide app (SPEC_ETAPPE2 chapter 3).
//
//   node tools/serve.js [port]        default port 8080
//
// - Binds to 127.0.0.1 only, never to all network interfaces.
// - Serves only files below the repository folder. Paths with "..", absolute
//   or drive paths, backslashes and dot-files answer 403 or 404.
// - "/" redirects to "/app/", a folder answers with its index.html.
// - Only node: modules.

import http from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HOST = '127.0.0.1';
const DEFAULT_PORT = 8080;
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
};

const ALLOWED_HOSTS = new Set(['127.0.0.1', 'localhost']);

function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(body);
}

/** Host header without port; guards against DNS rebinding. */
function hostName(header) {
  if (typeof header !== 'string') return '';
  return header.replace(/:\d*$/, '').toLowerCase();
}

/**
 * Map a request target to a path below `root`.
 * Returns { status } for a refused request or { file } for a candidate path.
 */
export function resolveRequestPath(target, root) {
  if (typeof target !== 'string' || !target.startsWith('/')) return { status: 400 };
  const rawPath = target.split(/[?#]/, 1)[0];
  let decoded;
  try {
    decoded = decodeURIComponent(rawPath);
  } catch {
    return { status: 400 };
  }
  if (decoded.includes('\0')) return { status: 400 };
  // backslashes (raw or %5c), drive letters / alternate streams (":"), parent segments
  if (rawPath.includes('\\') || decoded.includes('\\')) return { status: 403 };
  const segments = decoded.split('/');
  for (const seg of segments) {
    if (seg === '..' || seg.includes(':')) return { status: 403 };
    if (seg.startsWith('.') && seg !== '' && seg !== '.') return { status: 403 }; // dot-files, e.g. .git
  }
  const file = path.resolve(root, '.' + decoded);
  const rel = path.relative(root, file);
  if (rel.startsWith('..') || path.isAbsolute(rel)) return { status: 403 };
  return { file, trailingSlash: decoded.endsWith('/') };
}

/** Create the server (not listening). Options: { root } for tests. */
export function createServer({ root = REPO_ROOT } = {}) {
  const rootDir = path.resolve(root);
  return http.createServer(async (req, res) => {
    try {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        return send(res, 405, 'Method not allowed', { Allow: 'GET, HEAD' });
      }
      if (!ALLOWED_HOSTS.has(hostName(req.headers.host))) return send(res, 403, 'Forbidden');
      if (req.url === '/' || req.url.startsWith('/?')) return send(res, 302, '', { Location: '/app/' });

      const r = resolveRequestPath(req.url, rootDir);
      if (r.status) return send(res, r.status, r.status === 403 ? 'Forbidden' : 'Bad request');

      let file = r.file;
      let info = await stat(file).catch(() => null);
      if (info && info.isDirectory()) {
        if (!r.trailingSlash) {
          return send(res, 301, '', { Location: req.url.split(/[?#]/, 1)[0] + '/' });
        }
        file = path.join(file, 'index.html');
        info = await stat(file).catch(() => null);
      }
      if (!info || !info.isFile()) return send(res, 404, 'Not found');

      const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': type, 'Content-Length': info.size, 'Cache-Control': 'no-store' });
      if (req.method === 'HEAD') return res.end();
      const stream = createReadStream(file);
      stream.on('error', () => res.destroy());
      stream.pipe(res);
    } catch {
      if (!res.headersSent) send(res, 500, 'Server error');
      else res.destroy();
    }
  });
}

/** Create the server and listen on 127.0.0.1. Resolves with the listening server. */
export function startServer(port = DEFAULT_PORT, options = {}) {
  const server = createServer(options);
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, HOST, () => resolve(server));
  });
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  const arg = process.argv[2];
  const port = arg === undefined ? DEFAULT_PORT : Number(arg);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    console.error('Usage: node tools/serve.js [port]');
    process.exit(2);
  }
  startServer(port).then(
    (server) => console.log(`GroundSlide: http://${HOST}:${server.address().port}/`),
    (e) => {
      console.error(`Cannot start server: ${e.message}`);
      process.exit(1);
    },
  );
}
