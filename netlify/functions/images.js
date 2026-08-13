/**
 * 图片静态代理：GET /images/*（仅本地模式需要；生产直接走 Supabase Storage 公共 URL）
 */
import { db, MIME } from './lib/db.js';

export async function handler(event) {
  const { pathname } = new URL(event.rawUrl || event.path || '/', 'http://localhost');
  const rel = pathname.replace(/^\/images\/?/, '');
  if (!rel || rel.includes('..')) return text('Not Found', 404);
  const hit = db.serveImage(rel);
  if (!hit) return text('Not Found', 404);
  return {
    statusCode: 200,
    headers: { 'Content-Type': MIME[hit.ext] || 'application/octet-stream', 'Cache-Control': 'public, max-age=31536000' },
    body: hit.data.toString('base64'),
    isBase64Encoded: true,
  };
}

function text(body, status = 200) {
  return { statusCode: status, headers: { 'Content-Type': 'text/plain; charset=utf-8' }, body };
}
