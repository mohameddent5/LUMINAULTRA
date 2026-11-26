// Zero-dependency static server for local testing. Usage: node serve.mjs [port]
import { createServer } from 'node:http'; import { readFile, stat } from 'node:fs/promises'; import { extname, join, normalize } from 'node:path'; import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('.', import.meta.url)), port = Number(process.argv[2]) || 8080;
const T = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm', '.onnx': 'application/octet-stream', '.task': 'application/octet-stream', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.png': 'image/png' };
createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (p.endsWith('/')) p += 'index.html';
    const f = normalize(join(root, p)); if (!f.startsWith(root)) { res.writeHead(403).end(); return; }
    if (!(await stat(f)).isFile()) throw 0;
    res.writeHead(200, { 'Content-Type': T[extname(f)] || 'application/octet-stream', 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'require-corp', 'Cross-Origin-Resource-Policy': 'same-origin', 'Cache-Control': 'no-cache' });
    res.end(await readFile(f));
  } catch { res.writeHead(404).end('not found'); }
}).listen(port, '127.0.0.1', () => console.log(`Lumina running at http://localhost:${port}  (Ctrl+C to stop)`));
