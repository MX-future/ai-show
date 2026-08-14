/**
 * 管理后台：登录 → Tabs（项目管理 / 修改密码）
 * - 项目管理：列表 → 新建/编辑（App: 截图+下载；Web: url + dist 上传）
 * - 修改密码：旧密码 + 新密码 → 存数据库（scrypt）
 * - 交互：Toast 提示、保存按钮 loading 置灰、表单居中
 */
const app = document.getElementById('app');
const logoutBtn = document.getElementById('logoutBtn');
const TOKEN_KEY = 'portfolio_admin_token_v2';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const token = () => localStorage.getItem(TOKEN_KEY) || '';

async function api(path, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  if (!(opts.body instanceof FormData)) headers['Content-Type'] = 'application/json';
  if (token()) headers['Authorization'] = 'Bearer ' + token();
  const r = await fetch(path, { ...opts, headers });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const err = new Error(j.error || '请求失败');
    err.status = r.status;
    throw err;
  }
  return j;
}

/* ---------- Toast 提示框 ---------- */
function toast(msg, type = 'success') {
  let box = document.querySelector('.toast-box');
  if (!box) { box = document.createElement('div'); box.className = 'toast-box'; document.body.appendChild(box); }
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = (type === 'success' ? '✓ ' : type === 'error' ? '✕ ' : 'ℹ ') + msg;
  box.appendChild(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 300); }, 2600);
}

/* ---------- 自定义确认弹窗（替代浏览器 confirm，支持异步操作） ---------- */
function confirmDialog({ title = '确认操作', message = '', confirmText = '确认', danger = false, onConfirm = null } = {}) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'dialog-overlay';
    overlay.innerHTML = `
      <div class="glass dialog-card" role="dialog" aria-modal="true">
        <div class="dialog-icon ${danger ? 'danger' : ''}">${danger ? '🗑️' : '⚠️'}</div>
        <h3 class="dialog-title">${esc(title)}</h3>
        <p class="dialog-msg">${esc(message)}</p>
        <div class="dialog-actions">
          <button class="tool-btn dialog-cancel">取消</button>
          <button class="load-btn dialog-ok ${danger ? 'danger' : ''}">${esc(confirmText)}</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';
    requestAnimationFrame(() => overlay.classList.add('show'));

    const okBtn = overlay.querySelector('.dialog-ok');
    const setLoading = (loading) => {
      okBtn.disabled = loading;
      okBtn.textContent = loading ? `⏳ ${confirmText}中…` : confirmText;
    };

    const onKey = (e) => { if (e.key === 'Escape') done(false); };
    const done = (val) => {
      window.removeEventListener('keydown', onKey);
      overlay.classList.remove('show');
      setTimeout(() => { overlay.remove(); document.body.style.overflow = ''; }, 240);
      resolve(val);
    };
    const onOk = async () => {
      if (!onConfirm) return done(true);
      setLoading(true);
      try {
        await onConfirm();
        done(true);
      } catch (err) {
        setLoading(false);
        toast(err.message || '操作失败', 'error');
      }
    };

    window.addEventListener('keydown', onKey);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) done(false); });
    overlay.querySelector('.dialog-cancel').addEventListener('click', () => done(false));
    okBtn.addEventListener('click', onOk);
    overlay.querySelector('.dialog-cancel').focus();
  });
}

/* ---------- 登录 ---------- */
async function renderLogin() {
  app.innerHTML = `
    <div class="glass login-card">
      <h2>管理后台登录</h2>
      <p class="login-sub">输入管理员密码</p>
      <input type="password" id="pwd" placeholder="密码" class="input" />
      <button class="load-btn" id="loginBtn">登 录</button>
    </div>`;
  const doLogin = async () => {
    try {
      const j = await api('/api/admin/login', { method: 'POST', body: JSON.stringify({ password: $('#pwd').value }) });
      localStorage.setItem(TOKEN_KEY, j.token);
      logoutBtn.style.display = 'inline';
      toast('登录成功');
      renderAdmin();
    } catch (e) { toast(e.message, 'error'); }
  };
  $('#loginBtn').addEventListener('click', doLogin);
  $('#pwd').addEventListener('keydown', (e) => { if (e.key === 'Enter') doLogin(); });
  $('#pwd').focus();
}

/* ---------- 主框架：Tabs ---------- */
let currentTab = 'projects';
function renderAdmin() {
  app.innerHTML = `
    <div class="admin-wrap">
      <div class="admin-tabs">
        <button class="admin-tab ${currentTab === 'projects' ? 'active' : ''}" data-tab="projects">📁 项目管理</button>
        <button class="admin-tab ${currentTab === 'password' ? 'active' : ''}" data-tab="password">🔒 修改密码</button>
      </div>
      <div id="tabContent"></div>
    </div>`;
  app.querySelectorAll('.admin-tab').forEach((b) => b.addEventListener('click', () => {
    currentTab = b.dataset.tab;
    renderAdmin();
  }));
  if (currentTab === 'password') renderPassword();
  else renderList();
}

/* ---------- 修改密码 ---------- */
function renderPassword() {
  $('#tabContent').innerHTML = `
    <div class="glass pwd-card">
      <h2>🔒 修改管理密码</h2>
      <label class="field-label">旧密码</label>
      <input type="password" id="oldPwd" class="input" autocomplete="current-password" />
      <label class="field-label">新密码（至少 6 位）</label>
      <input type="password" id="newPwd" class="input" autocomplete="new-password" />
      <label class="field-label">确认新密码</label>
      <input type="password" id="newPwd2" class="input" autocomplete="new-password" />
      <button class="load-btn" id="pwdSave">修改密码</button>
    </div>`;
  $('#pwdSave').addEventListener('click', async () => {
    const btn = $('#pwdSave');
    const oldPwd = $('#oldPwd').value, n1 = $('#newPwd').value, n2 = $('#newPwd2').value;
    if (n1 !== n2) { toast('两次输入的新密码不一致', 'error'); return; }
    if (n1.length < 6) { toast('新密码至少 6 位', 'error'); return; }
    btn.disabled = true; btn.textContent = '⏳ 提交中…';
    try {
      await api('/api/admin/change-password', { method: 'POST', body: JSON.stringify({ old_password: oldPwd, new_password: n1 }) });
      toast('密码修改成功，请记住新密码');
      $('#oldPwd').value = $('#newPwd').value = $('#newPwd2').value = '';
    } catch (e) { toast(e.message, 'error'); }
    finally { btn.disabled = false; btn.textContent = '修改密码'; }
  });
}

/* ---------- 项目列表 ---------- */
function skeletonRows() {
  return `<div class="sk-rows">${Array.from({ length: 4 }).map(() => `
    <div class="sk-row">
      <div class="skeleton icon"></div>
      <div class="lines">
        <div class="skeleton l1"></div>
        <div class="skeleton l2"></div>
      </div>
    </div>`).join('')}</div>`;
}

/* 类型统一图标（白色 SVG，用于列表行 icon） */
const typeSvg = (t) => ({
  web: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>',
  app: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><path d="M12 18h.01"/></svg>',
  mac: '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/></svg>',
  exe: '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M3 5.5v6h8v-8l-8 2zm8 12v-8H3v6l8 2zm1-8v8l9 2v-10h-9zm9-1v-6.5l-9 2v4.5h9z"/></svg>',
}[t] || '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="18" height="18" rx="4"/></svg>');

const typeName = (t) => ({ web: 'Web', app: 'App', mac: 'Mac', exe: 'EXE' }[t] || t);

async function renderList() {
  $('#tabContent').innerHTML = skeletonRows();
  const projects = await api('/api/projects');
  $('#tabContent').innerHTML = `
    <div class="admin-head">
      <h2>项目管理 <span class="count">（${projects.length}）</span></h2>
      <button class="load-btn btn-sm" id="newBtn">＋ 新建项目</button>
    </div>
    <div class="admin-table">
      ${projects.map((p, i) => `
        <div class="admin-row" style="animation-delay:${i * 40}ms">
          <div class="row-main">
            <span class="row-icon" style="background:linear-gradient(135deg,${esc(p.cover_from)},${esc(p.cover_to)})">${typeSvg(p.type)}</span>
            <div>
              <strong>${esc(p.name)}</strong>
              <span class="row-sub">${typeName(p.type)} · ${esc(p.date)} · ${esc(p.status)}${p.dist_uploaded_at ? ' · 📦 已上传 dist' : ''}</span>
            </div>
          </div>
          <div class="row-actions">
            <button class="tool-btn" data-edit="${esc(p.id)}">编辑</button>
            <button class="tool-btn danger" data-del="${esc(p.id)}">删除</button>
          </div>
        </div>`).join('') || '<p class="admin-empty">暂无项目，点击右上角新建</p>'}
    </div>`;

  $('#newBtn').addEventListener('click', () => renderForm());
  app.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', async () => {
    try {
      const p = await api('/api/projects/' + b.dataset.edit);
      renderForm(p);
    } catch (e) { toast('加载项目失败：' + e.message, 'error'); }
  }));
  app.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
    const row = b.closest('.admin-row');
    const name = row ? row.querySelector('strong').textContent : b.dataset.del;
    const ok = await confirmDialog({
      title: '删除项目',
      message: `确定删除「${name}」吗？其站内托管的 dist 文件将一并删除，此操作不可撤销。`,
      confirmText: '删除',
      danger: true,
      onConfirm: async () => {
        await api('/api/projects/' + b.dataset.del, { method: 'DELETE' });
      },
    });
    if (!ok) return;
    toast('项目已删除');
    renderList();
  }));
}

/* ---------- 编辑表单 ---------- */
function renderForm(p = {}, keepNew = false) {
  const isNew = keepNew || !p.id;
  window.__isNew = isNew; // 上传 dist 回调需知道当前是否新建，避免误切编辑模式
  const state = {
    id: p.id || '',
    name: p.name || '',
    type: p.type || 'web',
    tagline: p.tagline || '',
    description: p.description || '',
    tech: (p.tech || []).join(', '),
    cover_from: p.cover_from || '#2563eb',
    cover_to: p.cover_to || '#3b82f6',
    cover_image: p.cover_image || '',
    date: p.date || '',
    status: p.status || 'online',
    url: p.url || '',
    allow_embed: !!p.allow_embed,
    sort: p.sort || 0,
    screenshots: (p.screenshots || []).map((s) => ({ ...s })),
    downloads: (p.downloads || []).map((d) => ({ ...d })),
    dist: p.dist_uploaded_at ? `${p.dist_base || '/'}（${p.dist_uploaded_at}）` : '',
  };

  $('#tabContent').innerHTML = `
    <div class="glass form-card">
      <button class="back-link" id="backBtn">← 返回列表</button>
      <h2>${isNew ? '＋ 新建项目' : '编辑项目：' + esc(p.name)}</h2>

      <div class="form-grid">
        <label>项目 ID（路由标识，创建后不可改）<input class="input" id="f-id" value="${esc(state.id)}" placeholder="如 ai-chat" ${isNew ? '' : 'disabled'} /></label>
        <label>项目名称 <input class="input" id="f-name" value="${esc(state.name)}" /></label>
        <label>类型
          <select class="input" id="f-type">
            <option value="web" ${state.type === 'web' ? 'selected' : ''}>🌐 Web 网站</option>
            <option value="app" ${state.type === 'app' ? 'selected' : ''}>📱 App 应用</option>
            <option value="mac" ${state.type === 'mac' ? 'selected' : ''}>🖥️ Mac 应用</option>
            <option value="exe" ${state.type === 'exe' ? 'selected' : ''}>💻 Windows 应用（EXE）</option>
          </select>
        </label>
        <label>一句话简介 <input class="input" id="f-tagline" value="${esc(state.tagline)}" /></label>
        <label>状态
          <select class="input" id="f-status">
            <option value="online" ${state.status === 'online' ? 'selected' : ''}>已上线</option>
            <option value="wip" ${state.status === 'wip' ? 'selected' : ''}>开发中</option>
            <option value="archived" ${state.status === 'archived' ? 'selected' : ''}>已归档</option>
          </select>
        </label>
        <label>完成时间 <input class="input" id="f-date" value="${esc(state.date)}" placeholder="2026-06" /></label>
        <label>技术栈（逗号分隔）<input class="input" id="f-tech" value="${esc(state.tech)}" /></label>
        <label>封面渐变色 <span class="color-pick">
          <input type="color" id="f-c1" value="${esc(state.cover_from)}" /> <input type="color" id="f-c2" value="${esc(state.cover_to)}" />
        </span></label>
        <label>封面图（可选，优先于渐变色）<span class="cover-pick">
          <input class="input" id="f-cover" value="${esc(state.cover_image)}" placeholder="图片 URL，或点击上传" />
          <button type="button" class="tool-btn" id="coverUp">上传</button>
          <input type="file" id="coverFile" accept="image/*" hidden />
        </span>
        <div class="cover-preview" id="coverPreview" style="${state.cover_image ? '' : 'display:none'}">
          <img src="${esc(state.cover_image)}" alt="封面预览" />
        </div></label>
        <label>排序（越小越靠前）<input class="input" id="f-sort" type="number" value="${esc(state.sort)}" /></label>
      </div>
      <label class="form-field-full">详细介绍<textarea class="input" id="f-desc" rows="4">${esc(state.description)}</textarea></label>

      <div id="typeSection"></div>

      <div class="form-actions">
        <button class="load-btn" id="saveBtn">💾 保存项目</button>
      </div>
    </div>`;

  $('#backBtn').addEventListener('click', () => renderList());
  $('#f-type').addEventListener('change', () => { state.type = $('#f-type').value; renderTypeSection(state, p); });
  renderTypeSection(state, p);

  /* 封面图上传 + 即时预览 */
  const updateCoverPreview = () => {
    const pv = $('#coverPreview');
    if (!pv) return;
    const url = $('#f-cover').value.trim();
    if (url) { pv.style.display = ''; pv.querySelector('img').src = url; }
    else pv.style.display = 'none';
  };
  $('#f-cover').addEventListener('input', updateCoverPreview);
  $('#coverUp').addEventListener('click', () => $('#coverFile').click());
  $('#coverFile').addEventListener('change', async () => {
    const file = $('#coverFile').files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast('请选择图片文件', 'error'); return; }
    const btn = $('#coverUp');
    btn.disabled = true; btn.textContent = '⏳ 上传中…';
    try {
      const fd = new FormData();
      fd.append('file', file);
      const j = await api('/api/upload', { method: 'POST', body: fd });
      $('#f-cover').value = j.url;
      updateCoverPreview();
      toast('✅ 封面已上传，下方已预览（请记得保存项目）');
    } catch (e) { toast('上传失败：' + e.message, 'error'); }
    finally { btn.disabled = false; btn.textContent = '上传'; $('#coverFile').value = ''; }
  });

  $('#saveBtn').addEventListener('click', async () => {
    const btn = $('#saveBtn');
    if (btn.disabled) return; // 防重复提交
    btn.disabled = true;
    btn.textContent = '⏳ 保存中…';
    try {
      const payload = {
        id: state.id || $('#f-id').value.trim(),
        name: $('#f-name').value.trim(),
        type: $('#f-type').value,
        tagline: $('#f-tagline').value.trim(),
        description: $('#f-desc').value,
        tech: $('#f-tech').value.split(',').map((s) => s.trim()).filter(Boolean),
        cover_from: $('#f-c1').value,
        cover_to: $('#f-c2').value,
        cover_image: $('#f-cover').value.trim(),
        date: $('#f-date').value.trim(),
        status: $('#f-status').value,
        url: $('#f-url') ? $('#f-url').value.trim() : '',
        allow_embed: $('#f-embed') ? $('#f-embed').checked : false,
        sort: Number($('#f-sort').value) || 0,
        screenshots: window.__shots || [],
        downloads: (window.__downloads || []).filter((d) => d.url && d.url.trim()),
      };
      if (!payload.id) { toast('请填写项目 ID', 'error'); return; }
      if (isNew) await api('/api/projects', { method: 'POST', body: JSON.stringify(payload) });
      else await api('/api/projects/' + state.id, { method: 'PUT', body: JSON.stringify(payload) });
      toast('项目已保存');
      setTimeout(() => renderList(), 600);
    } catch (e) {
      toast('保存失败：' + e.message, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = '💾 保存项目';
    }
  });
}

/* 按类型渲染：Web=url+dist上传 / App=截图+下载 */
function renderTypeSection(state, p) {
  const sec = $('#typeSection');
  if (state.type === 'web') {
    sec.innerHTML = `
      <h2 class="form-section-title">Web 站点配置</h2>
      <label class="form-label">线上地址（外链预览，可选）<input class="input" id="f-url" value="${esc(state.url)}" placeholder="https://xxx.netlify.app" /></label>
      <label class="check-field">
        <input type="checkbox" id="f-embed" ${state.allow_embed ? 'checked' : ''} /> 允许被 iframe 嵌入（部分站点禁止嵌入，取消勾选则只用 dist 预览）
      </label>
      <div class="dist-box">
        <p class="dist-tip">
          ${state.dist ? '📦 当前已上传：<code>' + esc(state.dist) + '</code>' : '📦 尚未上传 dist 包 —— 上传构建产物 zip，即可在站内实时预览，无需单独部署'}
        </p>
        <div class="dist-actions">
          <input type="file" id="distFile" accept=".zip,application/zip" hidden />
          <button class="dl-btn btn-sm" id="upBtn">${state.dist ? '↻ 重新上传' : '⬆ 上传 dist 包（zip）'}</button>
          <span class="up-msg" id="upMsg"></span>
        </div>
      </div>`;

    $('#upBtn').addEventListener('click', () => $('#distFile').click());
    $('#distFile').addEventListener('change', async () => {
      const file = $('#distFile').files[0];
      if (!file) return;
      if (!file.name.toLowerCase().endsWith('.zip')) { toast('请选择 zip 文件', 'error'); return; }
      const fd = new FormData();
      fd.append('file', file);
      const id = state.id || $('#f-id').value.trim();
      if (!id) { toast('请先填写项目 ID', 'error'); return; }
      const upBtn = $('#upBtn');
      upBtn.disabled = true; upBtn.textContent = '⏳ 上传解压中…';
      $('#upMsg').textContent = '';
      try {
        const j = await api('/api/projects/' + encodeURIComponent(id) + '/dist', { method: 'POST', body: fd });
        toast('✅ ' + j.message);
        renderForm({ ...p, id, dist_base: j.base, dist_uploaded_at: '刚刚上传' }, window.__isNew); // 保留新建状态，保存时仍走 POST
      } catch (e) { toast(e.message, 'error'); }
      finally { upBtn.disabled = false; upBtn.textContent = '↻ 重新上传'; }
    });
  } else {
    window.__shots = state.screenshots;
    window.__downloads = state.downloads;
    sec.innerHTML = `
      <h2 class="form-section-title">App / Mac / Windows 配置</h2>
      <h3 class="sub-head">📸 应用截图（支持拖拽上传）${state.type === 'app' ? '' : ' · 桌面端截图建议横屏'}</h3>
      <div class="shot-grid ${state.type === 'app' ? '' : 'landscape'}" id="shotGrid"></div>
      <div class="drop-zone" id="dropZone">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
        <p>拖拽图片到此处上传，或 <span class="dz-link">点击选择</span></p>
        <input type="file" id="shotFiles" accept="image/*" multiple hidden />
      </div>

      <h3 class="sub-head">⬇ 下载地址</h3>
      <div id="downloads" class="list-rows"></div>
      <button class="tool-btn" id="addDl">＋ 添加下载项</button>`;

    const shotsBox = $('#shotGrid');
    const dropZone = $('#dropZone');
    const shotFiles = $('#shotFiles');
    let pendingUploadIndex = null;

    const renderShots = () => {
      shotsBox.innerHTML = window.__shots.map((s, i) => `
        <div class="shot-item">
          <div class="shot-thumb ${s.image ? '' : 'empty'}">
            ${s.image ? `<img src="${esc(s.image)}" alt="${esc(s.label)}" />` : '<span>📷</span>'}
            <button type="button" class="shot-del" data-sh-del="${i}" aria-label="删除">✕</button>
          </div>
          <input class="input shot-label" placeholder="截图说明" value="${esc(s.label)}" data-sh-label="${i}" />
          <div class="shot-url-row">
            <input class="input shot-url" placeholder="或粘贴图片 URL" value="${esc(s.image)}" data-sh-img="${i}" />
            <button type="button" class="tool-btn" data-sh-up="${i}" title="选择图片上传替换">上传</button>
          </div>
        </div>`).join('');
      shotsBox.querySelectorAll('[data-sh-label]').forEach((inp) => inp.addEventListener('input', () => { window.__shots[+inp.dataset.shLabel].label = inp.value; }));
      shotsBox.querySelectorAll('[data-sh-img]').forEach((inp) => inp.addEventListener('input', () => { window.__shots[+inp.dataset.shImg].image = inp.value; }));
      shotsBox.querySelectorAll('[data-sh-del]').forEach((b) => b.addEventListener('click', () => { window.__shots.splice(+b.dataset.shDel, 1); renderShots(); }));
      shotsBox.querySelectorAll('[data-sh-up]').forEach((b) => b.addEventListener('click', () => { pendingUploadIndex = +b.dataset.shUp; shotFiles.click(); }));
    };
    renderShots();

    /* 图片上传（拖拽 / 点击 / 单项替换） */
    let uploading = false;
    const dzLabel = () => dropZone.querySelector('p');
    const uploadFiles = async (files) => {
      if (uploading) return;
      const list = Array.from(files || []).filter((f) => f.type.startsWith('image/'));
      if (!list.length) { toast('请选择图片文件', 'error'); return; }
      uploading = true;
      dropZone.classList.add('uploading');
      dzLabel().textContent = `正在上传 ${list.length} 张图片…`;
      try {
        const urls = [];
        for (const f of list) {
          const fd = new FormData();
          fd.append('file', f);
          const j = await api('/api/upload', { method: 'POST', body: fd });
          urls.push({ url: j.url, name: f.name.replace(/\.[^.]+$/, '') });
        }
        if (pendingUploadIndex !== null) {
          const s = window.__shots[pendingUploadIndex];
          if (s) { s.image = urls[0].url; s.label = s.label || urls[0].name; }
          pendingUploadIndex = null;
        } else {
          urls.forEach((u) => window.__shots.push({ label: u.name, image: u.url }));
        }
        toast(`✅ 已上传 ${urls.length} 张截图（请记得保存项目）`);
      } catch (e) { toast('上传失败：' + e.message, 'error'); }
      finally {
        uploading = false;
        dropZone.classList.remove('uploading');
        dzLabel().innerHTML = '拖拽图片到此处上传，或 <span class="dz-link">点击选择</span>';
        shotFiles.value = '';
        renderShots();
      }
    };

    ['dragover', 'dragenter'].forEach((ev) => dropZone.addEventListener(ev, (e) => { e.preventDefault(); dropZone.classList.add('drag'); }));
    ['dragleave', 'drop'].forEach((ev) => dropZone.addEventListener(ev, (e) => { e.preventDefault(); dropZone.classList.remove('drag'); }));
    dropZone.addEventListener('drop', (e) => { const files = e.dataTransfer && e.dataTransfer.files; if (files && files.length) uploadFiles(files); });
    dropZone.addEventListener('click', () => { pendingUploadIndex = null; shotFiles.click(); });
    shotFiles.addEventListener('change', () => uploadFiles(shotFiles.files));

    const dlBox = $('#downloads');
    const formatSize = (bytes) => bytes >= 1048576 ? (bytes / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(bytes / 1024)) + ' KB';
    let activeGhIndex = null;

    /* 解析 GitHub 仓库地址 → owner/repo（兼容各种输入形式） */
    const normalizeGhRepo = (input) => {
      let s = String(input || '').trim();
      s = s.replace(/^https?:\/\/(www\.)?github\.com\//i, '');
      s = s.replace(/^git@github\.com:/, '');
      s = s.replace(/^github\.com\//i, '');
      s = s.replace(/\.git$/, '').replace(/\/+$/, '');
      const parts = s.split('/').filter(Boolean);
      return parts.length >= 2 ? parts.slice(0, 2).join('/') : parts.join('/');
    };

    const toggleGhPicker = async (i) => {
      dlBox.querySelectorAll('.gh-picker').forEach((p) => { if (p.id !== 'ghPicker' + i) p.hidden = true; });
      const picker = document.getElementById('ghPicker' + i);
      if (!picker) return;
      if (!picker.hidden) { picker.hidden = true; return; }
      picker.hidden = false;
      activeGhIndex = i;
      picker.innerHTML = `
        <div class="gh-row">
          <input class="input" id="ghRepo" placeholder="仓库地址，如 https://github.com/vuejs/vue 或直接 vuejs/vue" />
          <button class="tool-btn" id="ghFetch">获取 Release</button>
        </div>
        <div class="gh-list" id="ghList"><p class="gh-empty">输入仓库地址（完整链接或 owner/repo）后获取</p></div>`;

      const repo = picker.querySelector('#ghRepo');
      const btn = picker.querySelector('#ghFetch');
      const list = picker.querySelector('#ghList');
      repo.focus();

      const fetchReleases = async () => {
        const r = normalizeGhRepo(repo.value);
        if (!r || !r.includes('/')) { toast('请输入仓库地址（如 vuejs/vue 或完整链接）', 'error'); return; }
        // 输入完整链接时，回填规范化后的 owner/repo，便于确认
        if (repo.value !== r) repo.value = r;
        btn.disabled = true; btn.textContent = '⏳ 获取中…';
        list.innerHTML = '<p class="gh-empty">加载中…</p>';
        try {
          const res = await fetch('https://api.github.com/repos/' + r + '/releases?per_page=5');
          if (!res.ok) throw new Error('GitHub 返回 ' + res.status + '（仓库不存在或未公开）');
          const releases = await res.json();
          const assets = [];
          releases.forEach((rel) => (rel.assets || []).forEach((a) => assets.push({ name: a.name, url: a.browser_download_url, size: a.size, tag: rel.tag_name })));
          if (!assets.length) { list.innerHTML = '<p class="gh-empty">该仓库 Release 没有可下载资产（需先上传 dmg/exe/apk 等附件）</p>'; return; }
          list.innerHTML = assets.map((a, k) => `
            <button type="button" class="gh-asset" data-idx="${k}">
              <span class="gh-name">${esc(a.name)}</span>
              <span class="gh-tag">${esc(a.tag)} · ${formatSize(a.size)}</span>
            </button>`).join('');
          list.querySelectorAll('.gh-asset').forEach((b) => b.addEventListener('click', () => {
            const a = assets[+b.dataset.idx];
            const d = window.__downloads[activeGhIndex];
            if (d) { d.url = a.url; d.version = a.tag; d.size = formatSize(a.size); }
            renderDl();
            toast('✅ 已填入：' + a.name + '（记得保存项目）');
          }));
        } catch (e) { list.innerHTML = '<p class="gh-empty">' + esc(e.message) + '</p>'; }
        finally { btn.disabled = false; btn.textContent = '获取 Release'; }
      };
      btn.addEventListener('click', fetchReleases);
      repo.addEventListener('keydown', (e) => { if (e.key === 'Enter') fetchReleases(); });
    };

    const renderDl = () => {
      dlBox.innerHTML = window.__downloads.map((d, i) => `
        <div class="dl-item">
          <div class="form-row">
            <input class="input" placeholder="平台（如 macOS / Windows）" value="${esc(d.platform)}" data-dl-p="${i}" />
            <input class="input" placeholder="下载链接" value="${esc(d.url)}" data-dl-u="${i}" />
            <button type="button" class="tool-btn" data-dl-gh="${i}" title="从 GitHub Releases 导入资产">GH</button>
            <button type="button" class="tool-btn danger" data-dl-del="${i}">✕</button>
          </div>
          <div class="dl-meta">
            <input class="input" placeholder="版本（可选，如 1.0.0）" value="${esc(d.version || '')}" data-dl-v="${i}" />
            <input class="input" placeholder="大小（可选，如 48.2 MB）" value="${esc(d.size || '')}" data-dl-s="${i}" />
          </div>
          <div class="gh-picker" id="ghPicker${i}" hidden></div>
        </div>`).join('');
      dlBox.querySelectorAll('[data-dl-p]').forEach((inp) => inp.addEventListener('input', () => { window.__downloads[+inp.dataset.dlP].platform = inp.value; }));
      dlBox.querySelectorAll('[data-dl-u]').forEach((inp) => inp.addEventListener('input', () => { window.__downloads[+inp.dataset.dlU].url = inp.value; }));
      dlBox.querySelectorAll('[data-dl-v]').forEach((inp) => inp.addEventListener('input', () => { window.__downloads[+inp.dataset.dlV].version = inp.value; }));
      dlBox.querySelectorAll('[data-dl-s]').forEach((inp) => inp.addEventListener('input', () => { window.__downloads[+inp.dataset.dlS].size = inp.value; }));
      dlBox.querySelectorAll('[data-dl-del]').forEach((b) => b.addEventListener('click', () => { window.__downloads.splice(+b.dataset.dlDel, 1); renderDl(); }));
      dlBox.querySelectorAll('[data-dl-gh]').forEach((b) => b.addEventListener('click', () => toggleGhPicker(+b.dataset.dlGh)));
    };
    $('#addDl').addEventListener('click', () => { window.__downloads.push({ platform: 'iOS', url: '', version: '', size: '' }); renderDl(); });
    renderDl();
  }
}

/* ---------- 启动 ---------- */
const $ = (s) => document.querySelector(s);

(async () => {
  logoutBtn.addEventListener('click', () => { localStorage.removeItem(TOKEN_KEY); logoutBtn.style.display = 'none'; renderLogin(); });
  try {
    const j = await api('/api/admin/check');
    if (j.ok) { logoutBtn.style.display = 'inline'; renderAdmin(); }
    else renderLogin();
  } catch {
    renderLogin();
  }
})();
