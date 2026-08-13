/**
 * 鉴权：密码（scrypt 哈希，存数据库可修改）→ HMAC token（无状态）
 * - 密码哈希存 Supabase admin_config 表 / 本地 local-data/admin.json
 * - 首次未初始化时回退环境变量 ADMIN_PASSWORD（或本地默认 admin123）
 */
import crypto from 'crypto';
import { db } from './db.js';

const SECRET = process.env.TOKEN_SECRET || crypto.randomBytes(32).toString('hex');
const TTL = 7 * 24 * 3600 * 1000; // token 有效期 7 天

/* ---------- 密码 ---------- */
export function hashPassword(pwd) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(pwd), salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(pwd, stored) {
  const [salt, hash] = String(stored).split(':');
  if (!salt || !hash) return false;
  const calc = crypto.scryptSync(String(pwd), salt, 64).toString('hex');
  const a = Buffer.from(calc, 'hex');
  const b = Buffer.from(hash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function checkPassword(pwd) {
  const stored = await db.getAdminPassword();
  if (stored) return verifyPassword(pwd, stored);
  // 首次未初始化：回退环境变量密码（本地默认 admin123）
  return String(pwd) === (process.env.ADMIN_PASSWORD || 'admin123');
}

export async function changePassword(oldPwd, newPwd) {
  if (!(await checkPassword(oldPwd))) return { ok: false, error: '旧密码不正确' };
  const np = String(newPwd || '');
  if (np.length < 6) return { ok: false, error: '新密码至少 6 位' };
  await db.setAdminPassword(hashPassword(np));
  return { ok: true };
}

/* ---------- Token ---------- */
export function signToken() {
  const payload = { exp: Date.now() + TTL };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function verifyToken(token) {
  try {
    const [body, sig] = String(token || '').split('.');
    if (!body || !sig) return false;
    const expect = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
    if (sig !== expect) return false;
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (!payload.exp || payload.exp < Date.now()) return false;
    return true;
  } catch {
    return false;
  }
}

export function requireAdmin(event) {
  const auth = (event.headers && (event.headers.authorization || event.headers.Authorization)) || '';
  return verifyToken(auth.replace(/^Bearer\s+/i, ''));
}
