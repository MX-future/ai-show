/**
 * Vercel 适配层：把 Vercel 的 (req, res) 转换为 Netlify event 格式，
 * 复用 netlify/functions 的 handler，避免双份业务逻辑。
 */
import { handler } from '../netlify/functions/api.js';

export default async function (req, res) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks);

  const event = {
    path: (req.url || '/').split('?')[0],
    httpMethod: req.method || 'GET',
    headers: req.headers || {},
    queryStringParameters: req.query || {},
    body: raw.toString('base64'),
    isBase64Encoded: true,
  };

  const r = await handler(event);
  res.statusCode = r.statusCode || 200;
  for (const [k, v] of Object.entries(r.headers || {})) {
    try { res.setHeader(k, v); } catch { /* 忽略非法头 */ }
  }
  if (r.isBase64Encoded && r.body) res.end(Buffer.from(r.body, 'base64'));
  else res.end(r.body || '');
}
