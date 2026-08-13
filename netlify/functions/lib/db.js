/**
 * 数据适配器：本地文件系统（开发/本地验证） <-> Supabase（生产）
 * 通过环境变量自动切换：
 *   SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY 存在 → 使用 Supabase
 *   否则 → 本地文件系统（DATA_DIR 下，默认 ./local-data）
 *
 * 对外统一接口：
 *   listProjects()                     -> Project[]
 *   getProject(id)                     -> Project | null
 *   saveProject(project)               -> void
 *   deleteProject(id)                  -> void
 *   saveDistFiles(id, files, base)     -> void   // files: [{path, data}] 相对站点根
 *   getDistFile(id, relPath)           -> {data, ext} | null
 *   distMeta(id)                       -> {exists, base, uploadedAt} | null
 *   uploadImage(filename, buffer)      -> publicUrl
 *   serveImage(relPath)                -> {data, ext} | null   // 仅本地模式
 *   getImagesBaseUrl()                 -> string
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

const USE_SUPABASE = !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
const LOCAL_DIR = path.resolve(process.env.DATA_DIR || '.', 'local-data');
const PROJECTS_FILE = path.join(LOCAL_DIR, 'projects.json');
const SITES_DIR = path.join(LOCAL_DIR, 'sites');
const IMAGES_DIR = path.join(LOCAL_DIR, 'images');
const META_FILE = '.wb-meta.json';

const MIME = {
  html: 'text/html; charset=utf-8', htm: 'text/html; charset=utf-8',
  js: 'text/javascript', mjs: 'text/javascript', css: 'text/css',
  json: 'application/json', map: 'application/json',
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
  svg: 'image/svg+xml', webp: 'image/webp', ico: 'image/x-icon', avif: 'image/avif',
  woff: 'font/woff', woff2: 'font/woff2', ttf: 'font/ttf', otf: 'font/otf',
  txt: 'text/plain', wasm: 'application/wasm', pdf: 'application/pdf',
  mp4: 'video/mp4', webm: 'video/webm', mp3: 'audio/mpeg', md: 'text/markdown',
};

export function useSupabase() { return USE_SUPABASE; }

/* ================= Supabase 实现 ================= */
function supabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

/** 递归删除 Storage 目录下的所有对象（含子目录） */
async function removeAllObjects(bucket, path) {
  try {
    const { data, error } = await bucket.list(path, { limit: 1000 });
    if (error || !data || !data.length) return;
    for (const item of data) {
      const full = path ? `${path}/${item.name}` : item.name;
      if (item.id) {
        // 文件：直接删除
        await bucket.remove([full]);
      } else {
        // 目录：先递归删内容，再删目录标记
        await removeAllObjects(bucket, full);
        await bucket.remove([full]);
      }
    }
  } catch { /* 忽略清理失败 */ }
}

/** 动态探测 cover_image 列是否存在（兼容未迁移的数据库；只缓存"存在"结果） */
let coverColCache = null;
async function detectCoverColumn() {
  if (coverColCache === true) return true;
  try {
    const { error } = await supabase().from('projects').select('cover_image').limit(1);
    coverColCache = !error;
    return coverColCache;
  } catch {
    coverColCache = false;
    return false;
  }
}

const supabaseImpl = {
  async listProjects() {
    const { data, error } = await supabase().from('projects')
      .select('*').order('sort', { ascending: true }).order('created_at', { ascending: true });
    if (error) throw new Error('读取项目失败: ' + error.message);
    return data || [];
  },
  async getProject(id) {
    const { data, error } = await supabase().from('projects').select('*').eq('id', id).maybeSingle();
    if (error) throw new Error('读取项目失败: ' + error.message);
    return data || null;
  },
  async saveProject(p) {
    // dist_uploaded_at 可能是空串/无效值，仅当为合法日期时转换，避免 "Invalid time value"
    let distAt = null;
    if (p.dist_uploaded_at) {
      const d = new Date(p.dist_uploaded_at);
      if (!isNaN(d.getTime())) distAt = d.toISOString();
    }
    const row = { ...p, dist_uploaded_at: distAt };
    // 兼容未执行 cover_image 迁移的数据库（动态探测列是否存在）
    if (!(await detectCoverColumn())) delete row.cover_image;
    const { error } = await supabase().from('projects').upsert(row, { onConflict: 'id' });
    if (error) throw new Error('保存项目失败: ' + error.message);
  },
  async deleteProject(id) {
    // 同时清理 storage 中的 dist 文件
    try {
      const { data } = await supabase().storage.from('sites').list(id, { limit: 1000 });
      if (data && data.length) {
        await supabase().storage.from('sites').remove(data.map((f) => `${id}/${f.name}`));
      }
    } catch { /* 忽略清理失败 */ }
    const { error } = await supabase().from('projects').delete().eq('id', id);
    if (error) throw new Error('删除项目失败: ' + error.message);
  },
  async saveDistFiles(id, files, base) {
    const bucket = supabase().storage.from('sites');
    const prefix = `${id}/`;
    // 递归清空旧文件（Storage 扁平存储，目录对象需逐层列出后删除）
    await removeAllObjects(bucket, id);
    // 逐文件上传（supabase-js upload 单文件）
    for (const f of files) {
      const { error } = await bucket.upload(prefix + f.path, new Uint8Array(f.data), { upsert: true });
      if (error) throw new Error('上传 dist 到 Storage 失败: ' + error.message);
    }
    // 记录 meta（部分更新，避免整行覆盖）
    const { error: upErr } = await supabase().from('projects')
      .update({ dist_base: base, dist_uploaded_at: new Date().toISOString() })
      .eq('id', id);
    if (upErr) throw new Error('更新 dist 状态失败: ' + upErr.message);
  },
  async getDistFile(id, relPath) {
    const { data, error } = await supabase().storage.from('sites').download(`${id}/${relPath}`);
    if (error || !data) return null;
    const buf = Buffer.from(await data.arrayBuffer());
    const ext = (path.extname(relPath) || '').replace('.', '').toLowerCase();
    return { data: buf, ext };
  },
  async distMeta(id) {
    const p = await this.getProject(id);
    // dist_base 可能为合法空串（站点根），需结合 uploaded_at 判断
    if (!p || (!p.dist_base && !p.dist_uploaded_at)) return null;
    return { exists: true, base: p.dist_base || '', uploadedAt: p.dist_uploaded_at || '' };
  },
  async getAdminPassword() {
    const { data } = await supabase().from('admin_config').select('password_hash').eq('id', 1).maybeSingle();
    return data ? data.password_hash : null;
  },
  async setAdminPassword(hash) {
    const { error } = await supabase().from('admin_config').upsert({ id: 1, password_hash: hash }, { onConflict: 'id' });
    if (error) throw new Error('保存密码失败: ' + error.message);
  },
  async uploadImage(filename, buffer) {
    const ext = (path.extname(filename) || '.png').toLowerCase();
    const name = crypto.randomUUID() + ext;
    const { error } = await supabase().storage.from('images').upload(name, new Uint8Array(buffer), {
      contentType: MIME[ext.slice(1)] || 'application/octet-stream',
      upsert: true,
    });
    if (error) throw new Error('上传图片失败: ' + error.message);
    return `${process.env.SUPABASE_URL}/storage/v1/object/public/images/${name}`;
  },
  serveImage() { return null; },
  getImagesBaseUrl() { return `${process.env.SUPABASE_URL}/storage/v1/object/public/images/`; },
};

/* ================= 本地文件系统实现 ================= */
function ensureLocal() {
  fs.mkdirSync(LOCAL_DIR, { recursive: true });
  fs.mkdirSync(SITES_DIR, { recursive: true });
  fs.mkdirSync(IMAGES_DIR, { recursive: true });
  if (!fs.existsSync(PROJECTS_FILE)) fs.writeFileSync(PROJECTS_FILE, '[]');
}
function readLocalProjects() {
  ensureLocal();
  return JSON.parse(fs.readFileSync(PROJECTS_FILE, 'utf8'));
}
function writeLocalProjects(list) {
  ensureLocal();
  fs.writeFileSync(PROJECTS_FILE, JSON.stringify(list, null, 2));
}

const localImpl = {
  async listProjects() { return readLocalProjects(); },
  async getProject(id) { return readLocalProjects().find((p) => p.id === id) || null; },
  async saveProject(p) {
    const list = readLocalProjects();
    const i = list.findIndex((x) => x.id === p.id);
    if (i >= 0) list[i] = { ...list[i], ...p };
    else list.push(p);
    writeLocalProjects(list);
  },
  async deleteProject(id) {
    writeLocalProjects(readLocalProjects().filter((p) => p.id !== id));
    fs.rmSync(path.join(SITES_DIR, id), { recursive: true, force: true });
  },
  async saveDistFiles(id, files, base) {
    const dir = path.join(SITES_DIR, id);
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
    for (const f of files) {
      const dest = path.join(dir, f.path);
      if (!dest.startsWith(dir)) throw new Error('非法路径');
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, f.data);
    }
    fs.writeFileSync(path.join(dir, META_FILE), JSON.stringify({
      base, uploadedAt: new Date().toLocaleString('zh-CN'),
    }));
    await this.saveProject({ id, dist_base: base, dist_uploaded_at: new Date().toISOString() });
  },
  async getDistFile(id, relPath) {
    const dir = path.join(SITES_DIR, id);
    const file = path.join(dir, relPath);
    if (!file.startsWith(dir) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return null;
    const ext = (path.extname(file) || '').replace('.', '').toLowerCase();
    return { data: fs.readFileSync(file), ext };
  },
  async distMeta(id) {
    const metaPath = path.join(SITES_DIR, id, META_FILE);
    if (!fs.existsSync(metaPath)) return null;
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    return { exists: true, base: meta.base || '', uploadedAt: meta.uploadedAt || '' };
  },
  async getAdminPassword() {
    const f = path.join(LOCAL_DIR, 'admin.json');
    if (!fs.existsSync(f)) return null;
    try { return JSON.parse(fs.readFileSync(f, 'utf8')).password_hash || null; } catch { return null; }
  },
  async setAdminPassword(hash) {
    ensureLocal();
    fs.writeFileSync(path.join(LOCAL_DIR, 'admin.json'), JSON.stringify({ password_hash: hash, updated_at: new Date().toISOString() }));
  },
  async uploadImage(filename, buffer) {
    const ext = (path.extname(filename) || '.png').toLowerCase();
    const name = crypto.randomUUID() + ext;
    fs.writeFileSync(path.join(IMAGES_DIR, name), buffer);
    return `/images/${name}`;
  },
  serveImage(relPath) {
    const file = path.join(IMAGES_DIR, relPath);
    if (!file.startsWith(IMAGES_DIR) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return null;
    const ext = (path.extname(file) || '').replace('.', '').toLowerCase();
    return { data: fs.readFileSync(file), ext };
  },
  getImagesBaseUrl() { return '/images/'; },
};

export const db = USE_SUPABASE ? supabaseImpl : localImpl;
export { MIME };
