// 全面诊断：console 错误 + 布局信息 + 交互功能测试
import puppeteer from '/Users/MX/.workbuddy/binaries/node/workspace/node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js';

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new',
  args: ['--no-sandbox', '--disable-gpu'],
});

const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });

const errors = [];
page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push('[console] ' + msg.text());
});
page.on('pageerror', (err) => errors.push('[pageerror] ' + err.message));
page.on('requestfailed', (req) => errors.push('[requestfailed] ' + req.url() + ' ' + (req.failure()?.errorText || '')));

await page.goto('http://localhost:3000/', { waitUntil: 'networkidle0', timeout: 30000 });
await new Promise((r) => setTimeout(r, 4000));

const diag = await page.evaluate(() => {
  const sections = ['#top', '#about', '#projects', '#skills', '#contact', 'footer'].map((sel) => {
    const el = document.querySelector(sel);
    if (!el) return { sel, found: false };
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return {
      sel,
      top: Math.round(r.top + window.scrollY),
      height: Math.round(r.height),
      padding: cs.padding,
      overflowX: cs.overflowX,
    };
  });
  // 检查是否有横向溢出
  const docW = document.documentElement.scrollWidth;
  const bodyW = document.body.scrollWidth;
  // 检查 fonts
  const fonts = {
    display: getComputedStyle(document.querySelector('h1, h2, h3') || document.body).fontFamily,
    body: getComputedStyle(document.body).fontFamily,
  };
  return {
    sections,
    scrollWidth: { doc: docW, viewport: window.innerWidth, overflow: docW > window.innerWidth },
    fonts,
    projectsCards: document.querySelectorAll('[data-hover]').length,
    filterBtns: document.querySelectorAll('#projects button').length,
  };
});

console.log('=== DIAG ===');
console.log(JSON.stringify(diag, null, 2));
console.log('=== ERRORS (' + errors.length + ') ===');
errors.slice(0, 30).forEach((e) => console.log(e));

// 功能测试
console.log('=== INTERACTION TEST ===');
// 1. 点击第一个项目卡片
const cardCount = await page.$$eval('[data-hover]', (els) => els.length);
console.log('cards:', cardCount);
if (cardCount > 0) {
  await page.click('[data-hover]', { delay: 50 }).catch(() => console.log('card click FAILED'));
  await new Promise((r) => setTimeout(r, 1200));
  const modal = await page.$('[role="dialog"]');
  console.log('modal opened:', !!modal);
  if (modal) {
    await page.keyboard.press('Escape');
    await new Promise((r) => setTimeout(r, 600));
  }
}

// 2. 筛选按钮
const filterBtnCount = await page.$$eval('#projects .rounded-full button', (els) => els.length);
console.log('filter buttons:', filterBtnCount);

// 3. 导航锚点
await page.click('header a[href="#about"]').catch(() => console.log('nav click FAILED'));
await new Promise((r) => setTimeout(r, 800));
const scrollY = await page.evaluate(() => window.scrollY);
console.log('scrolled to about, y =', Math.round(scrollY));

await browser.close();