// 后台界面截图：登录 → 列表 → 编辑表单(Web/App) → 修改密码
import puppeteer from '/Users/MX/.workbuddy/binaries/node/workspace/node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js';

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new',
  args: ['--no-sandbox', '--disable-gpu'],
});

async function shot(page, path) {
  await page.screenshot({ path, fullPage: true });
  console.log('saved', path);
}

async function runDesktop() {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto('http://localhost:3000/admin.html', { waitUntil: 'networkidle0' });
  await new Promise((r) => setTimeout(r, 1500));
  await shot(page, '/tmp/admin-login.png');

  // 登录
  await page.type('#pwd', 'admin123');
  await page.click('#loginBtn');
  await new Promise((r) => setTimeout(r, 2000));
  await shot(page, '/tmp/admin-list.png');

  // 新建（Web 表单）
  await page.click('#newBtn');
  await new Promise((r) => setTimeout(r, 1000));
  await shot(page, '/tmp/admin-form-web.png');

  // 切到 App 表单
  await page.select('#f-type', 'app');
  await new Promise((r) => setTimeout(r, 800));
  await shot(page, '/tmp/admin-form-app.png');

  // 修改密码
  await page.click('[data-tab="password"]');
  await new Promise((r) => setTimeout(r, 1000));
  await shot(page, '/tmp/admin-password.png');

  await page.close();
}

async function runMobile() {
  const ctx = await browser.createBrowserContext(); // 无痕，无登录态
  const page = await ctx.newPage();
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await page.goto('http://localhost:3000/admin.html', { waitUntil: 'networkidle0' });
  await new Promise((r) => setTimeout(r, 1500));
  await page.type('#pwd', 'admin123');
  await page.click('#loginBtn');
  await new Promise((r) => setTimeout(r, 2000));
  await shot(page, '/tmp/admin-m-list.png');

  await page.click('#newBtn');
  await new Promise((r) => setTimeout(r, 1000));
  await shot(page, '/tmp/admin-m-form.png');
  await ctx.close();
}

await runDesktop();
await runMobile();
await browser.close();
console.log('ALL DONE');