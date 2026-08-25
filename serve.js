#!/usr/bin/env node
'use strict';

// Server statico di sviluppo per dist/ — solo moduli core.
// Non e' un sostituto di Cloudflare Pages: le Function in functions/
// non vengono eseguite. Per provarle serve `wrangler pages dev`.

const http = require('http');
const fs = require('fs');
const path = require('path');

const DIST = path.join(__dirname, 'dist');
const PORT = Number(process.env.PORT) || 8080;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.woff2': 'font/woff2'
};

function resolveFile(urlPath) {
  // decodifica e normalizza; path.normalize neutralizza i ../
  let rel = decodeURIComponent(urlPath.split('?')[0]);
  if (rel.endsWith('/')) rel += 'index.html';
  const full = path.join(DIST, path.normalize(rel));
  // niente uscite da dist/
  if (!full.startsWith(DIST)) return null;
  if (fs.existsSync(full) && fs.statSync(full).isFile()) return full;
  return null;
}

const server = http.createServer((req, res) => {
  // "/" non ha una Function qui: si serve dist/index.html, che rimanda
  // a /en/ via JS, come farebbe il fallback in produzione.
  const file = resolveFile(req.url);

  if (!file) {
    const notFound = path.join(DIST, '404.html');
    const body = fs.existsSync(notFound) ? fs.readFileSync(notFound) : 'Not found';
    res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(body);
  }

  res.writeHead(200, {
    'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
    'Cache-Control': 'no-store'
  });
  fs.createReadStream(file).pipe(res);
});

server.listen(PORT, () => {
  console.log('dist/ servita su http://localhost:' + PORT + '/');
  console.log('  ctrl-c per fermare');
});
