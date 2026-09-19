// The landing's motion, carried over from the hand-written public/hero.js.
//
// Every rule below was a deliberate choice there, and the reasoning is kept
// with it — this is a port, not a rewrite. What changed is only the lifecycle:
// a render-blocking IIFE became hooks that mount and, crucially, CLEAN UP.
// React 19 StrictMode double-invokes effects in dev and tools/dev-smoke.mjs
// checks exactly that, so every listener, observer and timer here is undone on
// unmount and every DOM mutation is idempotent.
//
// One thing the port genuinely loses: hero.js "failed visible" — if the script
// died, `.lp-js` never landed, nothing was ever hidden, and the page rendered
// whole. In a SPA the markup itself comes from JS, so that guarantee is gone by
// construction. The weaker version is kept: if IntersectionObserver is missing
// or the reader asked for reduced motion, the hidden state is never armed at
// all and everything renders revealed.

import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';

/** `?motion=on` forces animation even where the OS asks for reduced motion.
 *  A media query cannot be overridden from script, so without this there is no
 *  way to SEE the page move on a machine with Reduce Motion set system-wide.
 *  Opt-in per URL: no real visitor reaches it by accident. */
const forcedMotion = () =>
  new URLSearchParams(window.location.search).get('motion') === 'on';

const prefersReduced = () =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches && !forcedMotion();

/**
 * The nav's ONE bit of state: has the page left the top?
 *
 * Runs unconditionally — not behind the motion gate — because `is-stuck` is not
 * an animation, it is the nav's material. With Reduce Motion on, both states
 * still apply; hero.css's kill switch just cuts the transition between them.
 *
 * rAF-throttled and only written when the answer changes, so a fling down the
 * page costs one class write rather than one per scroll event.
 */
export function useStickyNav(barRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const bar = barRef.current;
    if (!bar) return;

    let frame = 0;
    let stuck: boolean | null = null;

    const sync = () => {
      frame = 0;
      const next = window.scrollY > 6;
      if (next === stuck) return;
      stuck = next;
      bar.classList.toggle('is-stuck', next);
    };

    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(sync);
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    sync(); // landing mid-page must arrive in the right state, not animate into it

    return () => {
      window.removeEventListener('scroll', onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [barRef]);
}

/**
 * Pointer parallax on the ticket stack.
 *
 * Feeds --lp-mx / --lp-my rather than transforming a wrapper, and that is
 * load-bearing: a transformed ANCESTOR becomes the backdrop root, so the
 * tickets' own backdrop-filter would sample nothing and render empty. Same trap
 * as the desk's masked cards — see tuneay/00-DURUM.md §4.
 */
export function useParallax(dealRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const deal = dealRef.current;
    if (!deal || prefersReduced()) return;
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;

    let frame = 0;

    const track = (event: PointerEvent) => {
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

    return () => {
      window.removeEventListener('pointermove', track);
      window.removeEventListener('pointerleave', rest);
      window.removeEventListener('blur', rest);
      if (frame) window.cancelAnimationFrame(frame);
      rest();
    };
  }, [dealRef]);
}

/**
 * THE TYPEWRITER. Text in the problem section is not faded in, it is typed.
 *
 * Two things keep it safe rather than clever:
 *
 * · It never invents the schedule. The delays live in CSS (--lp-lead-in,
 *   --lp-row); a duplicate copy here would drift the first time either moved.
 *   So nothing is scheduled — each element types when ITS OWN reveal begins,
 *   caught via animationstart / transitionstart. CSS stays the single clock.
 * · It fails visible. The full text is rendered by React and only lifted out at
 *   the moment typing starts, so a broken observer leaves the words whole.
 *
 * min-width/height are pinned from the real box before the element is emptied,
 * or the pill collapses and the two-line headline reflows under the reader.
 */
function typeOut(el: HTMLElement, timers: Set<number>) {
  if (el.dataset.lpTyped) return; // idempotent: StrictMode may arm this twice
  el.dataset.lpTyped = '1';

  const text = el.textContent ?? '';
  if (!text.trim()) return;

  const box = el.getBoundingClientRect();
  el.style.minWidth = `${Math.ceil(box.width)}px`;
  el.style.minHeight = `${Math.ceil(box.height)}px`;
  el.textContent = '';
  el.classList.add('is-typing');

  // ms per character. The default lets long strings type faster, so a headline
  // does not outstay a two-word eyebrow — but data-lp-speed overrides it where
  // the pace is a deliberate choice rather than a fallout of length.
  const speed = Number(el.dataset.lpSpeed) || Math.max(16, Math.min(48, 1100 / text.length));
  let i = 0;

  const tick = () => {
    el.textContent = text.slice(0, ++i);
    if (i < text.length) {
      timers.add(window.setTimeout(tick, speed));
      return;
    }
    el.classList.remove('is-typing');
    el.style.minWidth = '';
    el.style.minHeight = '';
  };
  timers.add(window.setTimeout(tick, 40));
}

/**
 * Arms the whole reveal sequence inside `scopeRef`.
 *
 * Mirrors hero.js's `start()`: reveal-on-scroll, the ladder's clock, the
 * failsafe, and the typewriter — in that order, because the typewriter must be
 * listening BEFORE anything reveals or it misses the first beat.
 */
export function useLandingMotion(scopeRef: RefObject<HTMLElement | null>) {
  // useLayoutEffect, not useEffect: the gate class has to land before the
  // browser paints, or the page flashes in and then hides itself.
  useLayoutEffect(() => {
    const root = document.documentElement;
    const forced = forcedMotion();
    const reduced = prefersReduced();
    const canObserve = 'IntersectionObserver' in window;

    if (forced) root.classList.add('lp-motion'); // exempts the CSS kill switch
    // Only arm the hidden state if we can actually un-hide it again.
    const armed = !reduced && canObserve;
    if (armed) root.classList.add('lp-js');

    // hero.css's base block is scoped to :where(.lp-body) because the landing
    // now shares a document with the desk. Without this class the landing has
    // no background, no type scale and no margin reset; leave it on after
    // unmount and the desk inherits the landing's canvas instead of its own.
    document.body.classList.add('lp-body');

    return () => {
      root.classList.remove('lp-js', 'lp-motion');
      document.body.classList.remove('lp-body');
    };
  }, []);

  useEffect(() => {
    const scope = scopeRef.current;
    if (!scope) return;

    const reduced = prefersReduced();
    const armed = !reduced && 'IntersectionObserver' in window;

    const revealables = [...scope.querySelectorAll<HTMLElement>('.lp-reveal, .lp-deal')];
    // The ladder has no hidden state of its own — the card is already on the
    // page. `is-in` only starts its rows dealing (hero.css §12).
    const ladders = [...scope.querySelectorAll<HTMLElement>('.lp-ladder')];
    const firstBeat = scope.querySelector<HTMLElement>('#why .lp-eyebrow');

    const showAll = () => {
      for (const el of revealables) el.classList.add('is-in');
      for (const el of ladders) el.classList.add('is-in');
    };

    if (!armed) {
      showAll();
      return;
    }

    const observers: IntersectionObserver[] = [];
    const timers = new Set<number>();

    const io = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('is-in');
        io.unobserve(entry.target);
      }
    }, { rootMargin: '0px 0px -12% 0px', threshold: 0.05 });
    for (const el of revealables) io.observe(el);
    observers.push(io);

    // THE FILM'S CLOCK IS THE EYEBROW'S CLOCK. Every delay in this section —
    // the eyebrow's 200ms, the headline's 900ms, the table's --lp-lead-in — is
    // measured from one instant, so all three must count from the SAME zero:
    // the eyebrow's reveal. Two other anchors were tried and both are wrong.
    // The CARD appears seconds after the headline when you scroll by hand, so
    // the table would count its lead-in from a zero in the future. The SECTION
    // starts intersecting while the eyebrow and headline are still off-screen,
    // starting the clock BEFORE the first beat — measured at rows arriving
    // 1.45s ahead of the headline.
    if (firstBeat && ladders.length) {
      const ladderIo = new IntersectionObserver((entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          for (const el of ladders) el.classList.add('is-in');
          ladderIo.unobserve(entry.target);
        }
      }, { rootMargin: '0px 0px -12% 0px', threshold: 0.05 });
      ladderIo.observe(firstBeat);
      observers.push(ladderIo);
    }

    // Failsafe, if the observer never fires. It must NOT blanket-reveal the
    // ladder: a reader still on the hero at 3s would have the whole sequence
    // play out below the fold. So the timer asks first whether the observer is
    // alive — by 3s the hero's revealables are long past their threshold, and
    // if none carries `is-in`, nothing is listening.
    timers.add(window.setTimeout(() => {
      const observerAlive = revealables.some((el) => el.classList.contains('is-in'));
      for (const el of revealables) el.classList.add('is-in');
      if (!observerAlive) for (const el of ladders) el.classList.add('is-in');
    }, 3000));

    // The reveal that fires is on the CELL; the text to type may be a span inside it.
    const target = (node: EventTarget | null): HTMLElement | null => {
      if (!(node instanceof Element)) return null;
      if (node.classList.contains('lp-type')) return node as HTMLElement;
      return node.querySelector(':scope > .lp-type');
    };
    const onBegin = (event: Event) => {
      const el = target(event.target);
      if (el) typeOut(el, timers);
    };
    // the ladder's values reveal via animation; the eyebrow and headline via transition
    document.addEventListener('animationstart', onBegin);
    document.addEventListener('transitionstart', onBegin);

    return () => {
      document.removeEventListener('animationstart', onBegin);
      document.removeEventListener('transitionstart', onBegin);
      for (const o of observers) o.disconnect();
      for (const t of timers) window.clearTimeout(t);
    };
  }, [scopeRef]);
}

/** Convenience for a section that needs its own ref without a named variable. */
export const useElementRef = <T extends HTMLElement>() => useRef<T>(null);
