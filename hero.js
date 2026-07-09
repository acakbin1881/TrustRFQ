// TrustRFQ landing — hero starfield.
// Self-hosted (CSP script-src 'self'); no dependencies. Honors
// prefers-reduced-motion (single static frame) and pauses while hidden.
(() => {
  const canvas = document.getElementById('stars');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  let w = 0, h = 0, stars = [], raf = 0;

  function size() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = canvas.clientWidth;
    h = canvas.clientHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const count = Math.min(220, Math.round((w * h) / 6500));
    stars = Array.from({ length: count }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      z: 0.3 + Math.random() * 0.7,            // depth: speed, size, brightness
      r: 0.4 + Math.random() * 1.1,
      p: Math.random() * Math.PI * 2,           // twinkle phase
      gold: Math.random() < 0.12,
    }));
  }

  function draw(t) {
    ctx.clearRect(0, 0, w, h);
    for (const s of stars) {
      const tw = reduced ? 0.75 : 0.55 + 0.45 * Math.sin(s.p + t * 0.0012 * s.z);
      ctx.globalAlpha = tw * s.z;
      ctx.fillStyle = s.gold ? '#E5B567' : '#EDE8DC';
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r * s.z, 0, 6.2832);
      ctx.fill();
      if (!reduced) {
        s.x += 0.016 * s.z;                     // slow drift
        if (s.x > w + 2) s.x = -2;
      }
    }
    ctx.globalAlpha = 1;
  }

  function loop(t) {
    draw(t);
    raf = requestAnimationFrame(loop);
  }

  size();
  if (reduced) draw(0);
  else raf = requestAnimationFrame(loop);

  addEventListener('resize', () => {
    size();
    if (reduced) draw(0);
  });

  document.addEventListener('visibilitychange', () => {
    if (reduced) return;
    if (document.hidden) cancelAnimationFrame(raf);
    else raf = requestAnimationFrame(loop);
  });
})();
