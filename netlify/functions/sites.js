/**
 * dist 静态代理：GET /sites/{id}/*  →  从 Storage/本地读取文件返回
 * - 支持嵌套子路径（资源相对路径）
 * - history 路由兜底：路径不存在时回退到该站点 index.html
 */
import { db, MIME } from './lib/db.js';

export async function handler(event) {
  try {
    const { pathname } = new URL(event.rawUrl || event.path || '/', 'http://localhost');
    const segs = pathname.replace(/^\/sites\/?/, '').split('/').filter(Boolean);
    if (!segs.length) return text('Not Found', 404);
    const id = decodeURIComponent(segs[0]);
    if (!/^[\w-]{1,64}$/.test(id)) return text('Bad Request', 400);

    // 站点根必须带尾斜杠，否则页内相对路径会解析到 /sites/ 上一级 → 301 纠正
    if (segs.length === 1 && !pathname.endsWith('/')) {
      return { statusCode: 301, headers: { Location: `/sites/${id}/` }, body: '' };
    }

    let rel = segs.slice(1).join('/');
    if (!rel || rel.endsWith('/')) rel += 'index.html';

    // 站点根：优先读 meta.base（如 '/dist/'），正确拼接相对路径
    let base = '';
    try { const meta = await db.distMeta(id); if (meta) base = meta.base || ''; } catch { /* 忽略 */ }
    if (base) rel = base.replace(/\/+$/, '') + '/' + rel;

    let hit = await db.getDistFile(id, rel);
    if (!hit) {
      // history 路由兜底：仅对无扩展名的页面路径回退 index.html；
      // 资源请求（带扩展名）缺失时返回真实 404，避免返回 HTML 导致 MIME 类型错误
      const hasExt = /\.[a-z0-9]{1,6}$/i.test(rel.split('?')[0].split('#')[0]);
      if (!hasExt) {
        const idx = (base ? base.replace(/\/+$/, '') + '/' : '') + 'index.html';
        hit = await db.getDistFile(id, idx) || await db.getDistFile(id, 'index.html');
      }
      if (!hit) return text('Not Found', 404);
    }
    const ctype = MIME[hit.ext] || 'application/octet-stream';
    return {
      statusCode: 200,
      headers: {
        'Content-Type': ctype,
        'Cache-Control': 'no-cache',
        'X-Content-Type-Options': 'nosniff',
      },
      body: hit.data.toString('base64'),
      isBase64Encoded: true,
    };
  } catch (e) {
    console.error('sites error:', e);
    return text('Server Error', 500);
  }
}

function text(body, status = 200) {
  return { statusCode: status, headers: { 'Content-Type': 'text/plain; charset=utf-8' }, body };
}
