/**
 * 前台作品集：Hash 路由 + 按需 iframe 预览
 * - #/            首页网格
 * - #/project/:id 详情页
 */
const app = document.getElementById('app');
let filter = 'all';
let projects = [];

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const typeName = (t) => ({ web: 'Web 网站', app: 'App 应用', mac: 'Mac 应用', exe: 'Windows 应用' }[t] || t);
const typeEmoji = (t) => ({ web: '🌐', app: '📱', mac: '🖥️', exe: '💻' }[t] || '📦');
const typeShort = { web: '网站', app: 'App', mac: 'Mac', exe: 'Windows' };
const FILTERS = [['all', '全部'], ['web', '网站'], ['app', 'App'], ['mac', 'Mac'], ['exe', 'EXE']];
const FILTER_LABEL = { all: '全部项目', web: 'Web 网站', app: 'App 应用', mac: 'Mac 应用', exe: 'Windows 应用' };
const statusName = { online: '已上线', wip: '开发中', archived: '已归档' };

// SVG 图标
const ICONS = {
  globe: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>',
  phone: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><path d="M12 18h.01"/></svg>',
  arrowUpRight: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17 17 7"/><path d="M7 7h10v10"/></svg>',
  arrowLeft: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></svg>',
  calendar: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h18"/></svg>',
  link: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>',
  mac: '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/></svg>',
  exe: '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M3 5.5v6h8v-8l-8 2zm8 12v-8H3v6l8 2zm1-8v8l9 2v-10h-9zm9-1v-6.5l-9 2v4.5h9z"/></svg>',
};

const typeIcon = (t) => ({ web: ICONS.globe, app: ICONS.phone, mac: ICONS.mac, exe: ICONS.exe }[t] || ICONS.globe);

async function loadProjects() {
  const r = await fetch('/api/projects');
  if (!r.ok) throw new Error('加载项目失败');
  projects = await r.json();
}

function parseHash() {
  const h = location.hash.replace(/^#/, '') || '/';
  const m = h.match(/^\/project\/([\w-]+)$/);
  return m ? { view: 'detail', id: m[1] } : { view: 'home' };
}

/* ---------- 骨架屏 ---------- */
function skeletonHome() {
  const cards = Array.from({ length: 6 }).map(() => `
    <div class="sk-card">
      <div class="skeleton cover"></div>
      <div class="skeleton line short"></div>
      <div class="skeleton line mid"></div>
      <div class="skeleton line"></div>
      <div class="sk-tags"><div class="skeleton"></div><div class="skeleton"></div></div>
    </div>`).join('');
  return `
    <div class="container sk-home">
      <div class="sk-filter">
        <div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div>
      </div>
      <div class="sk-grid">${cards}</div>
    </div>`;
}

function skeletonDetail() {
  return `
    <div class="container sk-detail">
      <div class="head">
        <div class="skeleton icon"></div>
        <div>
          <div class="skeleton title"></div>
          <div class="skeleton sub"></div>
        </div>
      </div>
      <div class="skeleton text"></div>
      <div class="skeleton text"></div>
      <div class="skeleton text" style="width:72%"></div>
      <div class="skeleton block"></div>
    </div>`;
}

/* ---------- 首页 ---------- */
async function renderHome() {
  app.innerHTML = skeletonHome();
  try { await loadProjects(); } catch { /* 网络异常时沿用旧缓存 */ }
  const list = projects.filter((p) => filter === 'all' || p.type === filter);

  // 热门技术标签（取全站出现次数最多的 4 个）
  const techCount = {};
  projects.forEach((p) => (p.tech || []).forEach((t) => { techCount[t] = (techCount[t] || 0) + 1; }));
  const topTech = Object.entries(techCount).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([t]) => t);

  // 统计条：全部 + 计数大于 0 的类型
  const typeStats = Object.entries(typeShort)
    .map(([k, label]) => ({ label, n: projects.filter((p) => p.type === k).length }))
    .filter((s) => s.n > 0);

  const filterLabel = FILTER_LABEL[filter];

  app.innerHTML = `
    <div class="container home-wrap">
      <div class="home-topbar">
        <div class="filter-bar">
          ${FILTERS.map(([f, lbl]) => `<button class="filter-btn ${f === filter ? 'active' : ''}" data-f="${f}">${lbl}</button>`).join('')}
        </div>
        <div class="datetime-wrap">
          <span class="dt-date" id="dtDate">—</span>
          <span class="dt-time" id="dtTime">--:--:--</span>
        </div>
      </div>

      <!-- 统计 + 热门技术条 -->
      <div class="home-stats">
        <span class="stat-chip"><span class="stat-num">${projects.length}</span> 全部项目</span>
        ${typeStats.map((s) => `<span class="stat-chip"><span class="stat-num">${s.n}</span> ${s.label}</span>`).join('')}
        <span class="stat-sep"></span>
        ${topTech.length ? `<span class="stat-label">热门技术</span>${topTech.map((t) => `<span class="tag-chip">${esc(t)}</span>`).join('')}` : ''}
      </div>

      <!-- 区块标题 -->
      <div class="section-head">
        <h2 class="section-head-title"><span class="label">${filterLabel}</span><span class="count">${list.length}</span></h2>
      </div>

      <div class="grid">
        ${list.map((p, i) => cardHTML(p, i)).join('') || '<p style="color:var(--text-dim);text-align:center;padding:40px 0">该分类下暂无项目</p>'}
      </div>
    </div>`;

  app.querySelectorAll('.filter-btn').forEach((b) => b.addEventListener('click', () => { filter = b.dataset.f; renderGrid(); }));
  bindCards();
  startClock();
}

/* 仅更新网格与区块标题（点击筛选时不重新加载整页） */
function renderGrid() {
  const grid = $('.grid');
  if (!grid) return;
  const list = projects.filter((p) => filter === 'all' || p.type === filter);
  grid.innerHTML = list.map((p, i) => cardHTML(p, i)).join('') || '<p style="color:var(--text-dim);text-align:center;padding:40px 0">该分类下暂无项目</p>';
  bindCards();

  const label = $('.section-head-title .label');
  const count = $('.section-head-title .count');
  if (label) label.textContent = FILTER_LABEL[filter];
  if (count) count.textContent = list.length;

  app.querySelectorAll('.filter-btn').forEach((b) => b.classList.toggle('active', b.dataset.f === filter));
}

function bindCards() {
  app.querySelectorAll('.card').forEach((c) => c.addEventListener('click', () => { location.hash = '#/project/' + c.dataset.id; }));
}

/* 日期时间显示（秒级更新，移动端紧凑格式） */
function startClock() {
  const dateEl = $('#dtDate');
  const timeEl = $('#dtTime');
  if (!dateEl || !timeEl) return;
  const week = ['日', '一', '二', '三', '四', '五', '六'];
  const pad = (n) => String(n).padStart(2, '0');
  const update = () => {
    const n = new Date();
    const compact = window.innerWidth < 640;
    dateEl.textContent = compact
      ? `${n.getMonth() + 1}月${n.getDate()}日 周${week[n.getDay()]}`
      : `${n.getFullYear()}年${n.getMonth() + 1}月${n.getDate()}日 星期${week[n.getDay()]}`;
    timeEl.textContent = `${pad(n.getHours())}:${pad(n.getMinutes())}:${pad(n.getSeconds())}`;
  };
  update();
  setInterval(update, 1000);
}

function cardHTML(p, i) {
  const typeSvg = typeIcon(p.type);
  return `
    <article class="card" data-id="${esc(p.id)}" title="${esc(p.name)}" style="animation-delay:${(i % 12) * 50}ms">
      <div class="card-cover ${p.cover_image ? 'has-cover' : 'default-deco'}" style="background:linear-gradient(135deg,${esc(p.cover_from)},${esc(p.cover_to)})">
        ${p.cover_image ? `<img class="cover-img" src="${esc(p.cover_image)}" alt="${esc(p.name)}" loading="lazy" />` : ''}
        <span class="cover-shade"></span>
        ${p.cover_image ? '' : `<span class="type-icon">${typeEmoji(p.type)}</span>`}
        <span class="card-status ${esc(p.status)}">${statusName[p.status] || p.status}</span>
      </div>
      <div class="card-body">
        <div class="card-meta-row">
          <span class="card-type">${typeSvg} ${typeName(p.type)}</span>
          <span class="card-date">${ICONS.calendar} ${esc(p.date)}</span>
        </div>
        <h3>${esc(p.name)}</h3>
        <p class="tagline">${esc(p.tagline)}</p>
        <div class="card-footer-row">
          <div class="card-tags">${(p.tech || []).slice(0, 3).map((t) => `<span>${esc(t)}</span>`).join('')}</div>
          <span class="card-arrow" aria-hidden="true">${ICONS.arrowUpRight}</span>
        </div>
      </div>
    </article>`;
}

/* ---------- 详情页 ---------- */
async function renderDetail(id) {
  app.innerHTML = skeletonDetail();
  let p = projects.find((x) => x.id === id);
  if (!p) {
    try { await loadProjects(); } catch { /* 忽略 */ }
    p = projects.find((x) => x.id === id);
  }
  if (!p) { app.innerHTML = '<div class="container" style="padding:80px 0;text-align:center"><p>项目不存在</p><br><a class="load-btn" href="#/">返回首页</a></div>'; return; }

  let distInfo = null;
  if (p.type === 'web') distInfo = await fetchDistInfo(id);

  app.innerHTML = `
    <div class="container detail">
      <button class="back-link" id="backBtn">${ICONS.arrowLeft} 返回项目列表</button>

      <div class="detail-hero">
        <div class="detail-icon" style="background:linear-gradient(135deg,${esc(p.cover_from)},${esc(p.cover_to)})">${typeEmoji(p.type)}</div>
        <div>
          <h1>${esc(p.name)}</h1>
          <p class="sub">${esc(p.tagline)}</p>
          <div class="detail-meta">
            <span class="pill">${typeIcon(p.type)} ${typeName(p.type)}</span>
            <span class="pill">${ICONS.calendar} ${esc(p.date)}</span>
            <span class="pill">${statusName[p.status] || p.status}</span>
          </div>
        </div>
      </div>

      <!-- 项目信息条 -->
      <div class="info-strip">
        <div class="info-cell"><span class="info-lbl">类型</span><span class="info-val">${typeName(p.type)}</span></div>
        <div class="info-cell"><span class="info-lbl">状态</span><span class="info-val ${esc(p.status)}">${statusName[p.status] || p.status}</span></div>
        <div class="info-cell"><span class="info-lbl">发布时间</span><span class="info-val">${esc(p.date)}</span></div>
        <div class="info-cell"><span class="info-lbl">技术栈</span><span class="info-val">${(p.tech || []).length} 项</span></div>
      </div>

      <div class="detail-desc-card">
        <h3 class="desc-title">项目介绍</h3>
        <p class="detail-desc">${esc(p.description)}</p>
      </div>

      <div class="detail-tech">${(p.tech || []).map((t) => `<span>${esc(t)}</span>`).join('')}</div>

      ${p.type === 'web' ? webHTML(p, distInfo) : appHTML(p)}
    </div>`;

  $('#backBtn').addEventListener('click', () => { location.hash = '#/'; });
  if (p.type === 'web') initWeb(p, distInfo);
  else initShots(p);
}

/* ---------- 应用截图：点击大屏预览 ---------- */
function initShots(p) {
  const imgs = (p.screenshots || []).map((s) => s.image).filter(Boolean);
  app.querySelectorAll('.shot-img img').forEach((img, i) => {
    img.addEventListener('click', (e) => {
      e.stopPropagation();
      if (imgs[i]) openLightbox(imgs, i);
    });
  });
}

let lbEl = null;
function openLightbox(imgs, index) {
  closeLightbox();
  lbEl = document.createElement('div');
  lbEl.className = 'lightbox';
  lbEl.innerHTML = `
    <button class="lb-close" aria-label="关闭">✕</button>
    ${imgs.length > 1 ? '<button class="lb-prev" aria-label="上一张">‹</button><button class="lb-next" aria-label="下一张">›</button>' : ''}
    <figure class="lb-fig">
      <img src="${esc(imgs[index])}" alt="截图预览" />
      <figcaption class="lb-count">${index + 1} / ${imgs.length}</figcaption>
    </figure>`;
  document.body.appendChild(lbEl);
  document.body.style.overflow = 'hidden';
  // 触发过渡动画
  requestAnimationFrame(() => lbEl.classList.add('show'));

  let cur = index;
  const img = lbEl.querySelector('img');
  const count = lbEl.querySelector('.lb-count');
  const set = (i) => {
    cur = (i + imgs.length) % imgs.length;
    img.src = imgs[cur];
    if (count) count.textContent = `${cur + 1} / ${imgs.length}`;
  };
  const onKey = (e) => {
    if (e.key === 'Escape') closeLightbox();
    else if (e.key === 'ArrowLeft') set(cur - 1);
    else if (e.key === 'ArrowRight') set(cur + 1);
  };
  window.addEventListener('keydown', onKey);
  lbEl.addEventListener('click', (e) => {
    if (e.target === lbEl || e.target.classList.contains('lb-close')) closeLightbox();
    else if (e.target.classList.contains('lb-prev')) set(cur - 1);
    else if (e.target.classList.contains('lb-next')) set(cur + 1);
  });
  lbEl._cleanup = () => window.removeEventListener('keydown', onKey);
}

function closeLightbox() {
  if (lbEl) {
    lbEl._cleanup && lbEl._cleanup();
    lbEl.remove();
    lbEl = null;
    document.body.style.overflow = '';
  }
}

async function fetchDistInfo(id) {
  try {
    const r = await fetch('/api/projects/' + encodeURIComponent(id) + '/dist-info');
    if (!r.ok) return null;
    const j = await r.json();
    return j.exists ? j : null;
  } catch { return null; }
}

function siteUrl(p, distInfo) {
  if (!distInfo) return '';
  const base = (distInfo.base || '/').replace(/^\/+|\/+$/g, '');
  return `/sites/${p.id}/${base}`.replace(/\/{2,}/g, '/');
}

function webHTML(p, distInfo) {
  const src = siteUrl(p, distInfo);
  const urlShown = distInfo ? src : (p.url || '未配置地址');
  return `
    <h2 class="section-title">实时预览</h2>
    <div class="preview-shell">
      <div class="preview-toolbar">
        <span class="dots"><i></i><i></i><i></i></span>
        <span class="preview-url">${esc(urlShown)}</span>
        <div class="preview-actions">
          ${distInfo ? '<button class="tool-btn active" id="md">桌面</button><button class="tool-btn" id="mm">手机</button><a class="tool-btn" target="_blank" rel="noopener" href="' + esc(src) + '">新窗口</a>' : ''}
        </div>
      </div>
      <div class="preview-stage" id="stage">
        ${distInfo
          ? '<div class="loading-hint"><div class="spinner"></div><div>正在加载本地预览…</div></div>'
          : `<div class="preview-placeholder">
              <div class="icon">${p.url ? '🖼️' : '🚫'}</div>
              <p>${p.url ? (p.allow_embed ? '点击下方按钮加载线上实时预览。' : '该站点不允许被 iframe 嵌入，可在管理后台上传 dist 包改为站内预览。') : '该站点未配置地址，请在管理后台上传 dist 包。'}</p>
              ${p.url && p.allow_embed ? '<button class="load-btn" id="loadBtn">加载线上预览</button>' : ''}
            </div>`}
      </div>
    </div>`;
}

function initWeb(p, distInfo) {
  const stage = $('#stage');
  const localSrc = siteUrl(p, distInfo);

  const load = (src) => {
    stage.innerHTML = '<div class="loading-hint"><div class="spinner"></div><div>正在加载预览…</div></div>';
    const iframe = document.createElement('iframe');
    iframe.src = src;
    iframe.title = p.name;
    iframe.onload = () => stage.querySelector('.loading-hint')?.remove();
    stage.appendChild(iframe);
  };

  const lb = $('#loadBtn');
  if (lb) lb.addEventListener('click', () => load(p.url));
  if (localSrc) load(localSrc);

  const md = $('#md'), mm = $('#mm');
  if (md && mm) {
    md.addEventListener('click', () => { stage.classList.remove('mobile-mode'); md.classList.add('active'); mm.classList.remove('active'); });
    mm.addEventListener('click', () => { stage.classList.add('mobile-mode'); mm.classList.add('active'); md.classList.remove('active'); });
  }
}

function appHTML(p) {
  // mac / exe 为桌面应用，截图以横屏展示
  const landscape = p.type === 'mac' || p.type === 'exe';
  return `
    <h2 class="section-title">应用截图</h2>
    <div class="shots">
      ${(p.screenshots || []).map((s) => `
        <div class="shot-img ${landscape ? 'landscape' : ''}">
          ${s.image ? `<img src="${esc(s.image)}" alt="${esc(s.label || p.name)}" loading="lazy" />` : '<span class="ph-icon">🖼️</span>'}
        </div>`).join('') || '<p style="color:var(--text-dim)">暂无截图</p>'}
    </div>
    <h2 class="section-title">下载</h2>
    ${(p.downloads || []).some((d) => d.url && d.url.trim()) ? '<p class="dl-note">💡 安装包托管于 GitHub Releases，下载速度取决于你的网络环境，可能较慢；如遇下载中断可稍后重试。</p>' : ''}
    <div class="downloads">
      ${(p.downloads || []).filter((d) => d.url && d.url.trim()).map((d) => `
        <a class="dl-btn" href="${esc(d.url)}" target="_blank" rel="noopener">
          ${ICONS.link} ${esc(d.platform || '下载')}
          ${d.version ? `<span class="dl-ver">v${esc(d.version)}</span>` : ''}
          ${d.size ? `<span class="dl-size">${esc(d.size)}</span>` : ''}
        </a>`).join('') || '<p style="color:var(--text-dim)">暂无下载地址</p>'}
    </div>`;
}

/* ---------- 路由 ---------- */
async function route() {
  const { view, id } = parseHash();
  window.scrollTo(0, 0);
  app.classList.remove('view-enter');
  void app.offsetWidth;
  app.classList.add('view-enter');
  if (view === 'detail') renderDetail(id);
  else renderHome();
}

window.addEventListener('hashchange', route);
route();
