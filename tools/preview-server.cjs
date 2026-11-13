// Isolated visual preview: serves the real PWA with fabricated data and no cloud access.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../public');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };
http.createServer((req, res) => {
  if (req.method !== 'GET') { res.writeHead(405); res.end(); return; }
  const pathname = new URL(req.url, 'http://localhost').pathname;
  if (pathname === '/__viewport320') {
    res.writeHead(200, { 'Content-Type': types['.html'], 'Cache-Control': 'no-store' });
    res.end('<!doctype html><html lang="ru"><title>Проверка PWA 320px</title><body style="margin:0;background:#102233;display:grid;place-items:center"><iframe title="PWA at 320 pixels" src="/" style="width:320px;height:812px;border:0"></iframe></body></html>'); return;
  }
  if (pathname === '/__preview-fixture.js') {
    res.writeHead(200, { 'Content-Type': types['.js'], 'Cache-Control': 'no-store' });
    res.end(fs.readFileSync(path.join(__dirname, 'preview-fixture.js'))); return;
  }
  const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : decodeURIComponent(pathname)));
  if (!file.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store', 'Content-Security-Policy': "connect-src 'self'" });
  let source = fs.readFileSync(file);
  if (file.endsWith('.html')) source = source.toString().replace(/<script[^>]*src="https:\/\/cdn\.jsdelivr\.net\/npm\/@supabase[^>]*><\/script>/, '').replace('<head>', '<head><script src="/__preview-fixture.js"></script>');
  res.end(source);
}).listen(8765, '127.0.0.1', () => console.log('Isolated PWA preview ready: http://localhost:8765 (fabricated marks; cloud disabled)'));
