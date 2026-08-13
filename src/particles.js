/**
 * 柔和光尘背景
 * - 粒子更大更透明，移动缓慢，连线极细极淡
 */
(() => {
  const canvas = document.getElementById('particles');
  if (!canvas) return;
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const ctx = canvas.getContext('2d');
  let W = 0, H = 0;
  let ps = [];
  const isMobile = () => window.innerWidth < 768;
  const COUNT = isMobile() ? 24 : 50;
  const LINK_DIST = isMobile() ? 80 : 110;

  function resize() {
    W = canvas.width = window.innerWidth;
    H = canvas.height = window.innerHeight;
  }
  resize();
  window.addEventListener('resize', resize);

  const rand = (a, b) => a + Math.random() * (b - a);
  function seed() {
    ps = [];
    for (let i = 0; i < COUNT; i++) {
      ps.push({
        x: rand(0, W), y: rand(0, H),
        vx: rand(-0.18, 0.18), vy: rand(-0.18, 0.18),
        r: rand(1.8, 3.4),
        tw: rand(0, Math.PI * 2),
      });
    }
  }
  seed();

  function tick(t) {
    ctx.clearRect(0, 0, W, H);

    for (const p of ps) {
      p.x += p.vx; p.y += p.vy;
      if (p.x < -14) p.x = W + 14; else if (p.x > W + 14) p.x = -14;
      if (p.y < -14) p.y = H + 14; else if (p.y > H + 14) p.y = -14;

      const alpha = 0.18 + 0.14 * Math.sin(t / 1100 + p.tw);
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(96, 165, 250, ${alpha.toFixed(3)})`;
      ctx.fill();
    }

    for (let i = 0; i < ps.length; i++) {
      const a = ps[i];
      for (let j = i + 1; j < ps.length; j++) {
        const b = ps[j];
        const dx = a.x - b.x, dy = a.y - b.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < LINK_DIST * LINK_DIST) {
          const o = (1 - Math.sqrt(d2) / LINK_DIST) * 0.09;
          ctx.strokeStyle = `rgba(147, 197, 253, ${o.toFixed(3)})`;
          ctx.lineWidth = 0.8;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
})();
