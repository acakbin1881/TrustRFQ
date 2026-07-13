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

  /* PREVIEW FLAG. `?motion=on` forces the page to animate even where the OS asks for
     reduced motion. It exists because there is otherwise no way to SEE this page move
     on a machine with Reduce Motion enabled system-wide — a media query cannot be
     overridden from script, so the choice would be "change your OS settings" or
     "never look at it". Opt-in, per URL: nobody reaches it by accident, and the
     default behaviour for every real visitor is untouched. */
  const forced = new URLSearchParams(window.location.search).get('motion') === 'on';
  if (forced) root.classList.add('lp-motion');   // exempts the CSS kill switch

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches && !forced;
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

  /* Watch a set, add `is-in` once, stop watching. */
  const watch = (nodes, options) => {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-in');
        io.unobserve(entry.target);
      });
    }, options);
    nodes.forEach((el) => io.observe(el));
  };

  const start = () => {
    const revealables = document.querySelectorAll('.lp-reveal, .lp-deal');
    /* The ladder has NO hidden state of its own — the card is already on the page.
       `is-in` only starts its rows dealing (see the ladder block in hero.css §12).
       It gets its own, much higher threshold because the sequence runs ~3s and the
       card is tall: at the 5% the others use, the last rows would deal themselves
       out below the fold, where nobody is looking. */
    const ladders = document.querySelectorAll('.lp-ladder');

    const showAll = () => {
      revealables.forEach((el) => el.classList.add('is-in'));
      ladders.forEach((el) => el.classList.add('is-in'));
    };

    if (!root.classList.contains('lp-js')) {
      showAll();
      return;
    }

    watch(revealables, { rootMargin: '0px 0px -12% 0px', threshold: 0.05 });
    watch(ladders, { threshold: 0.45 });

    /* Failsafe, if the observer never fires. It must NOT blanket-reveal the ladder:
       a reader still on the hero at 3s would have the whole sequence play out below
       the fold and arrive to a table that has already finished dealing. So the timer
       asks first whether the observer is alive — by 3s the hero's own revealables are
       long past their threshold, and if not one of them carries `is-in`, nothing is
       listening and the ladder must show its numbers or show nothing at all. */
    window.setTimeout(() => {
      const observerAlive = [...revealables].some((el) => el.classList.contains('is-in'));
      revealables.forEach((el) => el.classList.add('is-in'));
      if (!observerAlive) ladders.forEach((el) => el.classList.add('is-in'));
    }, 3000);

    parallax();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
