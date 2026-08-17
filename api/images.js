/**
 * Vercel 适配层：`/images/*` 静态代理（复用 Netlify handler）。
 */
import { handler } from '../netlify/functions/images.js';

export default async function (req, res) {
  const event = {
    path: (req.url || '/').split('?')[0],
    httpMethod: req.method || 'GET',
    headers: req.headers || {},
    queryStringParameters: req.query || {},
    body: '',
    isBase64Encoded: false,
  };
  const r = await handler(event);
  res.statusCode = r.statusCode || 200;
  for (const [k, v] of Object.entries(r.headers || {})) {
    try { res.setHeader(k, v); } catch { /* 忽略 */ }
  }
  if (r.isBase64Encoded && r.body) res.end(Buffer.from(r.body, 'base64'));
  else res.end(r.body || '');
}
