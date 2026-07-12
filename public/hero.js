/* TrustRFQ landing — reveal on scroll + pointer parallax on the ticket stack.
   Plain external script: the CSP has no 'unsafe-inline' in script-src.

   FAIL VISIBLE. The hidden state in hero.css is gated on `.lp-js`, which this
   file puts on <html>. If the script 404s, throws, or is blocked, the class is
   never set, nothing is ever hidden, and the page renders in full. A landing
   page that fails visible is a page; one that fails invisible is an outage.
   That is also why this runs render-blocking in <head> rather than deferred —
   deferred, the browser can paint the content before the class lands, and you
   see a flash of the page hiding itself. */
(() => {
  'use strict';

  const root = document.documentElement;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const canObserve = 'IntersectionObserver' in window;

  // Only arm the hidden state if we can actually un-hide it again.
  if (!reduced && canObserve) root.classList.add('lp-js');

  /* The tickets each carry their own transform, and the parallax feeds in
     through --lp-mx / --lp-my rather than a wrapper transform. That is
     deliberate: a transformed *ancestor* becomes the backdrop root, so the
     tickets' backdrop-filter would sample nothing and render empty. */
  const parallax = () => {
    const deal = document.querySelector('.lp-deal');
    if (!deal || reduced) return;
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;

    let frame = 0;

    const track = (event) => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        const box = deal.getBoundingClientRect();
        const x = (event.clientX - (box.left + box.width / 2)) / box.width;
        const y = (event.clientY - (box.top + box.height / 2)) / box.height;
        deal.style.setProperty('--lp-mx', (x * 14).toFixed(2));
        deal.style.setProperty('--lp-my', (y * 10).toFixed(2));
      });
    };

    const rest = () => {
      deal.style.setProperty('--lp-mx', '0');
      deal.style.setProperty('--lp-my', '0');
    };

    window.addEventListener('pointermove', track, { passive: true });
    window.addEventListener('pointerleave', rest);
    window.addEventListener('blur', rest);
  };

  const start = () => {
    const revealables = document.querySelectorAll('.lp-reveal, .lp-deal');
    const revealAll = () => revealables.forEach((el) => el.classList.add('is-in'));

    if (!root.classList.contains('lp-js')) {
      revealAll();
      return;
    }

    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-in');
        io.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -12% 0px', threshold: 0.05 });

    revealables.forEach((el) => io.observe(el));

    // Failsafe: if the observer somehow never fires, show everything anyway.
    window.setTimeout(revealAll, 3000);

    parallax();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
