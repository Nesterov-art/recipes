// Local-only server for the production SPA export. Never use it for hosting.
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, resolve, sep } from 'node:path';

const root = resolve('dist');
const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.ttf': 'font/ttf', '.woff': 'font/woff', '.woff2': 'font/woff2',
};

createServer(async (request, response) => {
  if (!['GET', 'HEAD'].includes(request.method)) {
    response.writeHead(405).end();
    return;
  }
  try {
    const url = new URL(request.url, 'http://127.0.0.1:4173');
    const pathname = decodeURIComponent(url.pathname);
    let file = resolve(root, `.${pathname}`);
    if (file !== root && !file.startsWith(root + sep)) {
      response.writeHead(403).end();
      return;
    }
    if ((await stat(file).catch(() => null))?.isDirectory()) file = resolve(file, 'index.html');
    if (!(await stat(file).catch(() => null))?.isFile()) {
      // Expo Router's SPA routes need index.html; missing assets must stay 404.
      if (extname(pathname)) {
        response.writeHead(404).end();
        return;
      }
      file = resolve(root, 'index.html');
    }
    response.writeHead(200, {
      'Content-Type': types[extname(file)] ?? 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    if (request.method === 'HEAD') response.end();
    else createReadStream(file).on('error', () => response.destroy()).pipe(response);
  } catch {
    response.writeHead(400).end();
  }
}).listen(4173, '127.0.0.1', () => console.log('E2E web export: http://127.0.0.1:4173'));
