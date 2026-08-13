/**
 * 本地模拟 Netlify 运行环境（开发/验证用，无需 Supabase）
 * - 复用 netlify/functions 的 handler，保证本地与生产行为一致
 * - 数据存 local-data/（文件系统适配器）
 *
 * 运行：npm run build && npm run serve
 * 打开：http://localhost:3000（前台）、http://localhost:3000/admin.html（后台）
 */
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(__dirname, '..', 'dist');
const PORT = process.env.PORT || 3000;

/* 加载 .env（如有），必须在 import functions 之前，保证 db.js 正确选择适配器 */
try {
  const envFile = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8');
  for (const line of envFile.split('\n')) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  console.log(`📄 已加载 .env（Supabase 模式: ${!!process.env.SUPABASE_URL}` + (process.env.SUPABASE_URL ? ' ✅' : ' ❌ 使用本地文件系统') + '）');
} catch { console.log('ℹ️ 无 .env，使用本地文件系统模式'); }

// 加载生产 functions（与 Netlify 一致）
const apiHandler = (await import('../netlify/functions/api.js')).handler;
const sitesHandler = (await import('../netlify/functions/sites.js')).handler;
const imagesHandler = (await import('../netlify/functions/images.js')).handler;

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const rawUrl = req.url;
    const pathname = url.pathname;
    const method = req.method || 'GET';

    // 读取 body
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const bodyBuf = Buffer.concat(chunks);

    const event = {
      path: pathname,
      rawUrl,
      httpMethod: method,
      headers: req.headers,
      queryStringParameters: Object.fromEntries(url.searchParams),
      body: bodyBuf.length ? bodyBuf.toString('base64') : null,
      isBase64Encoded: true,
    };

    let result = null;
    if (pathname.startsWith('/api/')) result = await apiHandler(event);
    else if (pathname.startsWith('/sites/')) result = await sitesHandler(event);
    else if (pathname.startsWith('/images/')) result = await imagesHandler(event);

    if (result) {
      res.writeHead(result.statusCode || 200, result.headers || {});
      res.end(result.isBase64Encoded ? Buffer.from(result.body, 'base64') : result.body);
      return;
    }

    // 静态文件
    const rel = pathname === '/' ? 'index.html' : pathname.slice(1);
    const file = path.join(DIST, rel);
    if (file.startsWith(DIST) && fs.existsSync(file) && fs.statSync(file).isFile()) {
      const ctype = MIME[path.extname(file).slice(1)] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': ctype });
      fs.createReadStream(file).pipe(res);
      return;
    }
    // SPA 兜底
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    fs.createReadStream(path.join(DIST, 'index.html')).pipe(res);
  } catch (e) {
    console.error('server error:', e);
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('Internal Server Error: ' + e.message);
  }
});

const MIME = {
  html: 'text/html; charset=utf-8', js: 'text/javascript', mjs: 'text/javascript', css: 'text/css',
  json: 'application/json', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
  svg: 'image/svg+xml', webp: 'image/webp', ico: 'image/x-icon', woff: 'font/woff', woff2: 'font/woff2',
  ttf: 'font/ttf', otf: 'font/otf', txt: 'text/plain', map: 'application/json',
};

server.listen(PORT, () => {
  console.log(`🚀 本地站点已启动（模拟 Netlify 环境，文件系统存储）`);
  console.log(`   前台:  http://localhost:${PORT}`);
  console.log(`   后台:  http://localhost:${PORT}/admin.html`);
  console.log(`   默认密码: admin123（环境变量 ADMIN_PASSWORD 可改）`);
});
