/**
 * 统一 API Function：/api/*
 * 路由（event.path 为原始路径）：
 *   POST   /api/admin/login               密码登录 -> token
 *   GET    /api/admin/check               校验 token（管理）
 *   GET    /api/projects                  项目列表（公开只读）
 *   GET    /api/projects/:id              单个项目（公开）
 *   GET    /api/projects/:id/dist-info    查询 dist 上传状态（公开）
 *   POST   /api/projects                  新建项目（管理）
 *   PUT    /api/projects/:id              更新项目（管理）
 *   DELETE /api/projects/:id              删除项目（管理）
 *   POST   /api/projects/:id/dist         上传 dist zip（管理）
 *   POST   /api/upload                    上传图片（管理）-> publicUrl
 */
import { db, MIME } from './lib/db.js';
import { checkPassword, signToken, requireAdmin, changePassword } from './lib/auth.js';
import { extractDist } from './lib/unzip.js';

export async function handler(event) {
  try {
    const { pathname: rawPath } = new URL(event.rawUrl || event.path || '/', 'http://localhost');
    // URL.pathname 保留百分号编码（如中文 id），解码后再路由匹配
    const path = decodeURIComponent(rawPath.replace(/^\/api/, ''));
    const method = event.httpMethod || 'GET';
    let body = {};
    if (event.body) {
      try { body = JSON.parse(event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString() : event.body); } catch { body = {}; }
    }

    /* --- 登录 --- */
    if (method === 'POST' && path === '/admin/login') {
      if (!(await checkPassword(String(body.password || '')))) return json({ error: '密码错误' }, 401);
      return json({ ok: true, token: signToken() });
    }
    if (method === 'GET' && path === '/admin/check') {
      return json({ ok: requireAdmin(event) });
    }
    /* --- 修改密码 --- */
    if (method === 'POST' && path === '/admin/change-password') {
      if (!requireAdmin(event)) return json({ error: '未授权，请先登录' }, 401);
      const r = await changePassword(String(body.old_password || ''), String(body.new_password || ''));
      if (!r.ok) return json({ error: r.error }, 400);
      return json({ ok: true });
    }

    /* --- 公开只读 --- */
    if (method === 'GET' && path === '/projects') return json(await db.listProjects());
    const m = path.match(/^\/projects\/([\w-]+)$/);
    const mDistInfo = path.match(/^\/projects\/([\w-]+)\/dist-info$/);
    const mDist = path.match(/^\/projects\/([\w-]+)\/dist$/);
    if (method === 'GET' && mDistInfo) return json((await db.distMeta(mDistInfo[1])) || { exists: false });
    if (method === 'GET' && m) {
      const p = await db.getProject(m[1]);
      return p ? json(p) : json({ error: '项目不存在' }, 404);
    }

    /* --- 以下均为管理接口 --- */
    if (!requireAdmin(event)) return json({ error: '未授权，请先登录' }, 401);

    if (method === 'POST' && path === '/projects') {
      const exist = await db.getProject(String(body.id || ''));
      const p = normalizeProject(body, exist || {});
      await db.saveProject(p);
      return json({ ok: true, project: p });
    }

    if (method === 'PUT' && m) {
      const exist = await db.getProject(m[1]);
      if (!exist) return json({ error: '项目不存在' }, 404);
      const p = normalizeProject({ ...exist, ...body, id: m[1] }, exist);
      await db.saveProject(p);
      return json({ ok: true, project: p });
    }

    if (method === 'DELETE' && m) {
      await db.deleteProject(m[1]);
      return json({ ok: true });
    }

    /* --- dist 上传（multipart）--- */
    if (method === 'POST' && mDist) {
      const raw = event.body || '';
      const buf = Buffer.from(raw, event.isBase64Encoded ? 'base64' : 'utf8');
      const file = parseMultipart(buf, event.headers['content-type'] || event.headers['Content-Type'] || '');
      if (!file) return json({ error: '缺少文件字段 file' }, 400);
      if (!file.name.toLowerCase().endsWith('.zip')) return json({ error: '请上传 .zip 文件' }, 400);

      // 支持"先传 dist 再保存项目"的流程：项目不存在时自动创建占位记录
      const exist = await db.getProject(mDist[1]);
      if (!exist) await db.saveProject({ id: mDist[1], name: mDist[1], type: 'web' });

      const { files, base } = extractDist(file.data);
      await db.saveDistFiles(mDist[1], files, base);
      const sizeMB = (file.data.length / 1024 / 1024).toFixed(1);
      return json({ ok: true, base, message: `已托管 ${files.length} 个文件（${sizeMB}MB），站点根 /sites/${mDist[1]}${base}` });
    }

    /* --- 图片上传 --- */
    if (method === 'POST' && path === '/upload') {
      const raw = event.body || '';
      const buf = Buffer.from(raw, event.isBase64Encoded ? 'base64' : 'utf8');
      const file = parseMultipart(buf, event.headers['content-type'] || event.headers['Content-Type'] || '');
      if (!file) return json({ error: '缺少文件字段 file' }, 400);
      if (buf.length > 10 * 1024 * 1024) return json({ error: '图片不能超过 10MB' }, 400);
      const url = await db.uploadImage(file.name, file.data);
      return json({ ok: true, url });
    }

    return json({ error: '接口不存在: ' + method + ' ' + path }, 404);
  } catch (e) {
    console.error('api error:', e);
    return json({ error: e.message || '服务器错误' }, 500);
  }
}

/* ---------- 工具 ---------- */
function json(data, status = 200) {
  return { statusCode: status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, body: JSON.stringify(data) };
}

function normalizeProject(body, exist = {}) {
  const id = String(body.id || '').trim();
  if (!/^[\w-]{1,64}$/.test(id)) throw new Error('项目 id 只能包含字母/数字/下划线/连字符');
  return {
    id,
    name: String(body.name || '').trim() || id,
    type: ['web', 'app', 'mac', 'exe'].includes(body.type) ? body.type : 'web',
    tagline: String(body.tagline || ''),
    description: String(body.description || ''),
    tech: Array.isArray(body.tech) ? body.tech.map(String) : [],
    cover_from: String(body.cover_from || '#6366f1'),
    cover_to: String(body.cover_to || '#8b5cf6'),
    cover_image: String(body.cover_image || ''),
    date: String(body.date || ''),
    status: body.status || 'online',
    url: String(body.url || ''),
    allow_embed: !!body.allow_embed,
    screenshots: Array.isArray(body.screenshots) ? body.screenshots : [],
    downloads: Array.isArray(body.downloads) ? body.downloads : [],
    sort: Number(body.sort) || 0,
    // 保留已有 dist 状态：上传后保存项目不丢失 dist_base
    dist_base: body.dist_base !== undefined ? String(body.dist_base) : (exist.dist_base || ''),
    dist_uploaded_at: body.dist_uploaded_at !== undefined ? String(body.dist_uploaded_at) : (exist.dist_uploaded_at || ''),
  };
}

function parseMultipart(buf, contentType) {
  const m = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType || '');
  if (!m) return null;
  const boundary = '--' + (m[1] || m[2]);
  const parts = [];
  let idx = buf.indexOf(Buffer.from(boundary));
  while (idx !== -1) {
    const next = buf.indexOf(Buffer.from(boundary), idx + boundary.length);
    if (next === -1) break;
    const raw = buf.subarray(idx + boundary.length, next);
    // raw 以 \r\n 开头，可能以 \r\n 结尾
    const headerEnd = raw.indexOf('\r\n\r\n');
    if (headerEnd === -1) { idx = next; continue; }
    const headers = raw.subarray(2, headerEnd).toString();
    const data = raw.subarray(headerEnd + 4, raw.length - 2);
    const nameMatch = /name="([^"]+)"/.exec(headers);
    const filenameMatch = /filename="([^"]*)"/.exec(headers);
    parts.push({
      name: nameMatch ? nameMatch[1] : '',
      filename: filenameMatch ? filenameMatch[1] : '',
      data: Buffer.from(data),
    });
    idx = next;
  }
  const file = parts.find((p) => p.filename);
  if (!file) return null;
  return { name: file.filename, data: file.data };
}
