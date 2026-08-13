// 全页截图：桌面 + 移动端，覆盖 Hero/About/Projects/Skills/Contact
import puppeteer from '/Users/MX/.workbuddy/binaries/node/workspace/node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js';

const URL = 'http://localhost:3000/';

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new',
  args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
});

async function shoot(viewport, out, opts = {}) {
  const page = await browser.newPage();
  await page.setViewport(viewport);
  await page.goto(URL, { waitUntil: 'networkidle0' });
  // 等动画完成
  await new Promise((r) => setTimeout(r, 2500));
  // 滚动到底部触发 whileInView
  await page.evaluate(async () => {
    await new Promise((resolve) => {
      let y = 0;
      const step = 200;
      const i = setInterval(() => {
        window.scrollBy(0, step);
        y += step;
        if (y >= document.body.scrollHeight) {
          clearInterval(i);
          resolve();
        }
      }, 80);
    });
  });
  await new Promise((r) => setTimeout(r, 1500));
  await page.evaluate(() => window.scrollTo(0, 0));
  await new Promise((r) => setTimeout(r, 800));

  await page.screenshot({ path: out, fullPage: true });
  await page.close();
  console.log(`saved ${out}`);
}

await shoot({ width: 1440, height: 900, deviceScaleFactor: 1 }, '/tmp/desktop-full.png');
await shoot({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, '/tmp/mobile-full.png');

await browser.close();