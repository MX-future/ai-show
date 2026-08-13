/**
 * zip 解压工具：内存解压 + 自动剥离公共前缀目录 + 定位 index.html 站点根
 */
import AdmZip from 'adm-zip';

/**
 * @param {Buffer} buffer zip 内容
 * @returns {{ files: {path:string,data:Buffer}[], base: string }}
 *   base: '' 表示 index.html 在站点根；'/sub/' 表示在子目录
 */
export function extractDist(buffer) {
  const zip = new AdmZip(buffer);
  const entries = zip.getEntries();
  if (!entries.length) throw new Error('zip 包为空');
  if (entries.length > 2000) throw new Error('文件数量过多（>2000）');

  // 计算公共前缀目录（剥掉 dist/、build/、project-1.0.0/ 等外层包裹）
  // 忽略 __MACOSX/.DS_Store 等压缩垃圾，避免干扰前缀判断
  const IGNORED = new Set(['__macosx', '.ds_store', 'thumbs.db', 'desktop.ini']);
  const isJunk = (name) => {
    const parts = name.split('/');
    return parts.some((p) => IGNORED.has(p.toLowerCase()));
  };
  let common = null;
  for (const e of entries) {
    if (e.isDirectory) continue;
    if (isJunk(e.entryName)) continue;
    const dirs = e.entryName.split('/').slice(0, -1).filter(Boolean);
    if (!dirs.length) { common = []; break; }
    if (common === null) { common = dirs; continue; }
    let i = 0;
    while (i < common.length && i < dirs.length && common[i] === dirs[i]) i++;
    common = common.slice(0, i);
  }
  const prefix = common && common.length ? common.join('/') + '/' : '';

  const files = [];
  const seen = new Set();
  for (const e of entries) {
    if (e.isDirectory) continue;
    let rel = e.entryName;
    // 跳过 macOS/Windows 压缩垃圾（__MACOSX、.DS_Store 等）
    if (isJunk(rel)) continue;
    if (prefix) {
      if (!rel.startsWith(prefix)) continue;
      rel = rel.slice(prefix.length);
    }
    // 防路径穿越
    if (rel.includes('..') || rel.startsWith('/')) continue;
    if (seen.has(rel)) continue;
    seen.add(rel);
    files.push({ path: rel, data: e.getData() });
  }
  if (!files.length) throw new Error('解压后没有可用文件');

  // 定位 index.html：取最浅层级作为站点根
  let best = null;
  for (const f of files) {
    const lower = f.path.toLowerCase();
    if (lower === 'index.html' || lower.endsWith('/index.html')) {
      const relDir = f.path.slice(0, f.path.length - 'index.html'.length);
      if (best === null || relDir.split('/').length < best.split('/').length) best = relDir;
    }
  }
  if (best === null) throw new Error('未找到 index.html（请上传构建产物 dist 目录的 zip）');

  // 改写 HTML 中的站内绝对路径资源为相对路径（兼容 Vite 默认 base='/' 构建）
  rewriteAbsoluteAssets(files);

  return { files, base: best };
}

/**
 * 把 HTML 里 "/assets/xxx" 这类站内绝对路径改写为 "./assets/xxx"，
 * 使 iframe 在 /sites/{id}/ 下也能正确加载资源。
 * 白名单目录，避免误伤外链(//)与作品集自身路径(/api、/sites)。
 */
function rewriteAbsoluteAssets(files) {
  const RES_DIR = /^(assets|static|build|dist|img|images|css|js|fonts|media|favicon|vendor|public)(\/|\.)/i;
  for (const f of files) {
    if (!/\.html?$/i.test(f.path)) continue;
    let s = f.data.toString('utf8');
    const changed = s.replace(/(src|href|poster)=(["'])\/(?!\/|api\/|sites\/|images\/)([^"']*?)\2/gi, (m, attr, q, path) => {
      if (!RES_DIR.test(path)) return m; // 非资源目录不动
      return `${attr}=${q}./${path}${q}`;
    });
    if (changed !== s) f.data = Buffer.from(changed, 'utf8');
  }
}
