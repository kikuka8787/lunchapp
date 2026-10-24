// 웹 앱용 로컬 서버: web/ 정적 파일 + 브라우저 CORS 우회용 Yahoo 시세 프록시 + 설정 파일
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { YAHOO } from './data.js';

const PORT = Number(process.env.PORT) || 3000;
const ROOT = new URL('../', import.meta.url).pathname;
const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png' };

createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  try {
    if (url.pathname.startsWith('/api/chart/')) {
      const symbol = decodeURIComponent(url.pathname.slice('/api/chart/'.length));
      const upstream = await fetch(`${YAHOO}/${encodeURIComponent(symbol)}?${url.searchParams}`, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
      });
      res.writeHead(upstream.status, { 'Content-Type': 'application/json' });
      res.end(await upstream.text());
      return;
    }
    let file = url.pathname === '/' ? '/web/index.html' : url.pathname;
    if (!['/config.json', '/universe.json'].includes(file) && !file.startsWith('/web/') && !file.startsWith('/src/')) file = `/web${file}`;
    const path = join(ROOT, normalize(file));
    if (!path.startsWith(ROOT)) throw Object.assign(new Error('forbidden'), { code: 403 });
    const body = await readFile(path);
    res.writeHead(200, { 'Content-Type': MIME[extname(path)] ?? 'application/octet-stream' });
    res.end(body);
  } catch (e) {
    const code = e.code === 'ENOENT' ? 404 : e.code === 403 ? 403 : 500;
    res.writeHead(code, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(code === 404 ? 'Not found' : e.message);
  }
}).listen(PORT, () => console.log(`▶ http://localhost:${PORT}`));
