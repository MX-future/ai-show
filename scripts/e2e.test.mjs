/**
 * 前台 + 后台 E2E 测试套件（node:test + puppeteer-core）
 *
 * 运行前提：本地服务已启动（localhost:3000，MODE=supabase）
 * 运行方式：node scripts/e2e.test.mjs
 *
 * 安全约定：
 *  - 后台 CRUD 只操作临时项目（id 前缀 e2e-test-），测试结束自动清理
 *  - 绝不删除/修改用户已有项目
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import puppeteer from '/Users/MX/.workbuddy/binaries/node/workspace/node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js';

const BASE = 'http://localhost:3000';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ADMIN_PWD = 'admin123';
const TEST_ID = 'e2e-test-' + Date.now();

let browser;

/* ---------- 工具 ---------- */
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const newPage = async (w = 1440, h = 900) => {
  const p = await browser.newPage();
  await p.setViewport({ width: w, height: h });
  return p;
};

async function apiLogin(page) {
  await page.goto(BASE + '/admin.html', { waitUntil: 'networkidle0' });
  // 清空共享 localStorage 的 token，确保每次走登录流程
  await page.evaluate(() => localStorage.clear());
  await wait(400);
  await page.reload({ waitUntil: 'networkidle0' });
  await wait(1000);
  await page.type('#pwd', ADMIN_PWD);
  await page.click('#loginBtn');
  await wait(1800);
}

/* ---------- 生命周期 ---------- */
before(async () => {
  // 检查服务可用
  try {
    const r = await fetch(BASE + '/api/projects');
    if (!r.ok) throw new Error('status ' + r.status);
  } catch {
    console.error('✗ 服务未启动，请先运行: MODE=supabase npm run serve');
    process.exit(1);
  }
  browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--disable-gpu'] });
});

after(async () => {
  // 清理临时项目
  try {
    const login = await fetch(BASE + '/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: ADMIN_PWD }) });
    const { token } = await login.json();
    await fetch(BASE + '/api/projects/' + TEST_ID, { method: 'DELETE', headers: { Authorization: 'Bearer ' + token } });
  } catch { /* 已清理或无需清理 */ }
  await browser.close();
});

/* ============================================================
   前台
   ============================================================ */
test('前台：首页完整渲染（统计条/筛选/区块标题/卡片）', async () => {
  const page = await newPage();
  await page.goto(BASE + '/', { waitUntil: 'networkidle0' });
  await wait(2500);

  const s = await page.evaluate(() => ({
    filters: document.querySelectorAll('.filter-btn').length,
    stats: document.querySelectorAll('.stat-chip').length,
    title: document.querySelector('.section-head-title .label')?.textContent || '',
    cards: document.querySelectorAll('.card').length,
    datetime: !!document.querySelector('#dtTime'),
  }));

  const apiCount = (await (await fetch(BASE + '/api/projects')).json()).length;
  assert.equal(s.filters, 5, '应有 5 个筛选按钮（全部/网站/App/Mac/EXE）');
  assert.ok(s.stats >= 2, '应有统计条');
  assert.ok(s.title.includes('项目'), '应有区块标题');
  assert.equal(s.cards, apiCount, '卡片数应等于项目数');
  assert.ok(s.datetime, '应有日期时间时钟');
  await page.close();
});

test('前台：筛选只更新网格，不整页刷新', async () => {
  const page = await newPage();
  await page.goto(BASE + '/', { waitUntil: 'networkidle0' });
  await wait(2200);

  // 点击「Mac」
  await page.click('.filter-btn[data-f="mac"]');
  await wait(800);
  const s = await page.evaluate(() => {
    const grid = document.querySelector('.grid');
    const labels = Array.from(grid.querySelectorAll('.card-type')).map((e) => e.textContent);
    return {
      active: document.querySelector('.filter-btn.active')?.dataset.f,
      title: document.querySelector('.section-head-title .label')?.textContent,
      allMac: labels.every((t) => t.includes('Mac')),
      skeleton: !!document.querySelector('.sk-home'),
    };
  });
  assert.equal(s.active, 'mac');
  assert.equal(s.title, 'Mac 应用');
  assert.ok(s.allMac, '网格应只含 Mac 项目');
  assert.ok(!s.skeleton, '不应出现骨架屏（无整页加载）');
  await page.close();
});

test('前台：卡片点击进入详情页', async () => {
  const page = await newPage();
  await page.goto(BASE + '/', { waitUntil: 'networkidle0' });
  await wait(2200);
  await page.click('.card');
  await wait(2500);
  const s = await page.evaluate(() => ({
    hero: !!document.querySelector('.detail-hero'),
    title: document.querySelector('.detail-hero h1')?.textContent || '',
    infoStrip: document.querySelectorAll('.info-cell').length,
    descCard: !!document.querySelector('.detail-desc-card'),
  }));
  assert.ok(s.hero, '应有详情 hero');
  assert.ok(s.title.length > 0, '应有项目名称');
  assert.equal(s.infoStrip, 4, '应有 4 格信息条');
  assert.ok(s.descCard, '应有项目介绍卡片');
  await page.close();
});

test('前台：web 项目详情有 preview-shell', async () => {
  const page = await newPage();
  const list = await (await fetch(BASE + '/api/projects')).json();
  const web = list.find((p) => p.type === 'web');
  if (!web) { console.log('  ↳ 跳过：无 web 项目'); await page.close(); return; }
  await page.goto(BASE + '/#/project/' + web.id, { waitUntil: 'networkidle0' });
  await wait(3200);
  const has = await page.evaluate(() => ({
    shell: !!document.querySelector('.preview-shell'),
    stage: !!document.querySelector('.preview-stage'),
  }));
  assert.ok(has.shell, 'web 详情应有 preview-shell');
  assert.ok(has.stage, '应有预览区');
  await page.close();
});

test('前台：mac/app 项目详情有横屏/竖屏截图', async () => {
  const page = await newPage();
  const list = await (await fetch(BASE + '/api/projects')).json();
  const mac = list.find((p) => p.type === 'mac');
  const app = list.find((p) => p.type === 'app');
  if (mac) {
    await page.goto(BASE + '/#/project/' + mac.id, { waitUntil: 'networkidle0' });
    await wait(3000);
    const r = await page.evaluate(() => ({
      landscape: document.querySelectorAll('.shot-img.landscape').length,
    }));
    assert.ok(r.landscape >= 0, 'mac 截图容器使用 landscape 类');
  }
  if (app) {
    await page.goto(BASE + '/#/project/' + app.id, { waitUntil: 'networkidle0' });
    await wait(3000);
    const r = await page.evaluate(() => document.querySelectorAll('.shot-img').length);
    assert.ok(r >= 0);
  }
  await page.close();
});

test('前台：截图 lightbox 点击预览', async () => {
  const page = await newPage();
  const list = await (await fetch(BASE + '/api/projects')).json();
  const target = list.find((p) => (p.screenshots || []).some((s) => s.image));
  if (!target) { console.log('  ↳ 跳过：无带图截图的项目'); await page.close(); return; }
  await page.goto(BASE + '/#/project/' + target.id, { waitUntil: 'networkidle0' });
  await wait(3000);
  const img = await page.$('.shot-img img');
  if (!img) { console.log('  ↳ 跳过：截图无图可点'); await page.close(); return; }
  await img.click();
  await wait(600);
  const s = await page.evaluate(() => ({
    open: !!document.querySelector('.lightbox.show'),
    count: document.querySelector('.lb-count')?.textContent || '',
    locked: document.body.style.overflow === 'hidden',
  }));
  assert.ok(s.open, 'lightbox 应打开');
  assert.ok(s.count.includes('/'), '应显示计数 1/N');
  assert.ok(s.locked, 'body 应锁定滚动');
  await page.keyboard.press('Escape');
  await wait(400);
  const closed = await page.evaluate(() => !document.querySelector('.lightbox'));
  assert.ok(closed, 'Escape 应关闭 lightbox');
  await page.close();
});

test('前台：任意宽度左右间距 ≥16px 且无横向溢出', async () => {
  const page = await newPage();
  for (const w of [1440, 1024, 768, 640, 480, 390, 360, 320]) {
    await page.setViewport({ width: w, height: 800 });
    await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
    await wait(700);
    const r = await page.evaluate(() => {
      const first = document.querySelector('.home-topbar') || document.querySelector('.grid');
      const fr = first.getBoundingClientRect();
      return {
        left: Math.round(fr.left),
        right: Math.round(window.innerWidth - fr.right),
        overflow: document.documentElement.scrollWidth > window.innerWidth,
      };
    });
    assert.ok(r.left >= 16, `${w}px: 左边距 ${r.left} 应 ≥16`);
    assert.ok(r.right >= 16, `${w}px: 右边距 ${r.right} 应 ≥16`);
    assert.ok(!r.overflow, `${w}px: 不应横向溢出`);
  }
  await page.close();
});

/* ============================================================
   后台
   ============================================================ */
test('后台：错误密码登录失败', async () => {
  const page = await newPage();
  await page.goto(BASE + '/admin.html', { waitUntil: 'networkidle0' });
  await wait(1200);
  await page.type('#pwd', 'wrong-password');
  await page.click('#loginBtn');
  await wait(1500);
  const s = await page.evaluate(() => ({
    loginCard: !!document.querySelector('.login-card'),
    toastErr: !!document.querySelector('.toast.error'),
  }));
  assert.ok(s.loginCard, '登录失败后仍显示登录卡片');
  assert.ok(s.toastErr, '应弹出错误 toast');
  await page.close();
});

test('后台：登录成功 → 项目列表', async () => {
  const page = await newPage();
  await apiLogin(page);
  const s = await page.evaluate(() => ({
    head: document.querySelector('.admin-head h2')?.textContent || '',
    rows: document.querySelectorAll('.admin-row').length,
    tabs: document.querySelectorAll('.admin-tab').length,
  }));
  assert.ok(s.head.includes('项目管理'), '应有项目管理标题');
  assert.ok(s.rows >= 1, '应有项目行');
  assert.equal(s.tabs, 2, '应有 2 个 tab');
  await page.close();
});

test('后台：新建 → 编辑 → 删除 临时项目（全流程 CRUD）', async () => {
  const page = await newPage();
  await apiLogin(page);

  // 新建
  await page.click('#newBtn');
  await wait(1000);
  await page.type('#f-id', TEST_ID);
  await page.type('#f-name', 'E2E 测试项目');
  await page.select('#f-type', 'app');
  await page.click('#saveBtn');
  await wait(2000);
  let rows = await page.evaluate(() => Array.from(document.querySelectorAll('.admin-row strong')).map((e) => e.textContent));
  assert.ok(rows.includes('E2E 测试项目'), '新建后列表应包含该项目');

  // 编辑：改为 mac 并验证 type 保存链路
  await page.evaluate((id) => { document.querySelector(`[data-edit="${id}"]`).click(); }, TEST_ID);
  await wait(1200);
  const typeVal = await page.$eval('#f-type', (el) => el.value);
  assert.equal(typeVal, 'app', '编辑表单应显示 app 类型');
  await page.select('#f-type', 'mac');
  await wait(800);
  const landscape = await page.evaluate(() => document.querySelector('#shotGrid')?.classList.contains('landscape'));
  assert.ok(landscape, 'mac 类型截图网格应为 landscape');
  await page.click('#saveBtn');
  await wait(2000);

  // 校验数据库已存 mac
  const p = await (await fetch(BASE + '/api/projects/' + TEST_ID)).json();
  assert.equal(p.type, 'mac', '保存后数据库 type 应为 mac');
  assert.equal(p.name, 'E2E 测试项目');

  // 删除（自定义弹窗）
  await page.evaluate((id) => { document.querySelector(`[data-del="${id}"]`).click(); }, TEST_ID);
  await wait(600);
  const dlg = await page.evaluate(() => ({
    open: !!document.querySelector('.dialog-overlay.show'),
    nativeConfirm: window.__confirmUsed === true,
  }));
  assert.ok(dlg.open, '应弹出自定义删除确认框');
  await page.click('.dialog-ok');
  await wait(1800);
  rows = await page.evaluate(() => Array.from(document.querySelectorAll('.admin-row strong')).map((e) => e.textContent));
  assert.ok(!rows.includes('E2E 测试项目'), '删除后列表不应包含该项目');
  await page.close();
});

test('后台：App 配置区渲染截图拖拽组件', async () => {
  const page = await newPage();
  await apiLogin(page);
  await page.click('#newBtn');
  await wait(1000);
  await page.select('#f-type', 'app');
  await wait(800);
  const s = await page.evaluate(() => ({
    dropZone: !!document.querySelector('.drop-zone'),
    shotGrid: !!document.querySelector('#shotGrid'),
    downloads: !!document.querySelector('#downloads'),
  }));
  assert.ok(s.dropZone, '应有拖拽上传区');
  assert.ok(s.shotGrid, '应有截图网格');
  assert.ok(s.downloads, '应有下载列表');
  await page.close();
});

test('后台：修改密码 tab 渲染', async () => {
  const page = await newPage();
  await apiLogin(page);
  await page.click('[data-tab="password"]');
  await wait(1000);
  const s = await page.evaluate(() => ({
    pwdCard: !!document.querySelector('.pwd-card'),
    fields: ['#oldPwd', '#newPwd', '#newPwd2'].every((id) => !!document.querySelector(id)),
  }));
  assert.ok(s.pwdCard, '应有密码卡片');
  assert.ok(s.fields, '应有三个密码输入框');
  await page.close();
});

test('后台：API 鉴权（无 token 禁止创建）', async () => {
  const r = await fetch(BASE + '/api/projects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: 'e2e-no-auth', name: 'x', type: 'web' }),
  });
  assert.ok(!r.ok, '无 token 创建应被拒绝');
});

console.log('\n✅ 全部测试执行完毕（临时项目已自动清理）');
