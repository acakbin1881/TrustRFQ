// The landing's motion.
//
// Everything here follows one rule: the page must be WHOLE without it. React
// adds `.tr-motion` to <html>, and that class is the only thing that arms the
// hidden state in src/styles/theme.css. If the effect never runs — reduced
// motion, no IntersectionObserver, a crash in a sibling — nothing was ever
// hidden and the reader sees the full page. This is the half of hero.js's
// "fail visible" that a SPA can still honour.

import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';

const forcedMotion = () =>
  new URLSearchParams(window.location.search).get('motion') === 'on';

/** `?motion=on` overrides the OS setting — a media query cannot be overridden
 *  from script, so without it there is no way to review the page on a machine
 *  with Reduce Motion set system-wide. */
const prefersReduced = () =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches && !forcedMotion();

const REVEAL_IN = { rootMargin: '0px 0px -10% 0px', threshold: 0.08 };

/**
 * Hands the document body to the carbon canvas while the landing is mounted.
 *
 * public/styles.css is linked from the HTML and always loaded, so <body> always
 * carries the desk's pale canvas. The landing is dark, and a container's
 * background does not cover scroll bounce or the area past the last section —
 * the body's does. Taken off on unmount, or the desk inherits a black page.
 */
export function useCarbonCanvas() {
  useLayoutEffect(() => {
    document.body.classList.add('tr-dark');
    return () => { document.body.classList.remove('tr-dark'); };
  }, []);
}

/**
 * Reveals `.tr-reveal` elements inside `scopeRef` as they come into view, once
 * each, then stops watching them.
 *
 * useLayoutEffect for the gate class: it has to land before the browser paints,
 * or the page renders in full and then hides itself — a visible flinch.
 */
export function useReveal(scopeRef: RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    if (prefersReduced() || !('IntersectionObserver' in window)) return;
    const root = document.documentElement;
    root.classList.add('tr-motion');
    return () => { root.classList.remove('tr-motion'); };
  }, []);

  useEffect(() => {
    const scope = scopeRef.current;
    if (!scope) return;

    const targets = [...scope.querySelectorAll<HTMLElement>('.tr-reveal')];
    if (prefersReduced() || !('IntersectionObserver' in window)) {
      for (const el of targets) el.classList.add('is-in');
      return;
    }

    const io = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('is-in');
        io.unobserve(entry.target);
      }
    }, REVEAL_IN);
    for (const el of targets) io.observe(el);

    // Failsafe: if the observer never fires, show everything rather than leave
    // a blank page behind an arming class that did its job too well.
    const timer = window.setTimeout(() => {
      for (const el of targets) el.classList.add('is-in');
    }, 3000);

    return () => { io.disconnect(); window.clearTimeout(timer); };
  }, [scopeRef]);
}

/**
 * Feeds pointer position into --tr-mx / --tr-my on the element.
 *
 * Custom properties rather than a transform on a wrapper, and that is
 * load-bearing: a transformed ANCESTOR becomes the backdrop root, so any
 * descendant's backdrop-filter would sample nothing and render flat. The hero's
 * blurred orbs and its frosted card are both downstream of this element.
 */
export function usePointerDrift(ref: RefObject<HTMLElement | null>, strength = 12) {
  useEffect(() => {
    const el = ref.current;
    if (!el || prefersReduced()) return;
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;

    let frame = 0;
    const track = (event: PointerEvent) => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        const box = el.getBoundingClientRect();
        const x = (event.clientX - (box.left + box.width / 2)) / box.width;
        const y = (event.clientY - (box.top + box.height / 2)) / box.height;
        el.style.setProperty('--tr-mx', (x * strength).toFixed(2));
        el.style.setProperty('--tr-my', (y * strength * 0.7).toFixed(2));
      });
    };
    const rest = () => {
      el.style.setProperty('--tr-mx', '0');
      el.style.setProperty('--tr-my', '0');
    };

    window.addEventListener('pointermove', track, { passive: true });
    window.addEventListener('pointerleave', rest);
    window.addEventListener('blur', rest);
    return () => {
      window.removeEventListener('pointermove', track);
      window.removeEventListener('pointerleave', rest);
      window.removeEventListener('blur', rest);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [ref, strength]);
}

/**
 * Counts a number up once the element is in view.
 *
 * Eased on the same curve as the reveals, so a figure arriving and a card
 * arriving read as one gesture. Returns the live value plus the ref to attach.
 * Honours reduced motion by jumping straight to the final value — the number is
 * information, and information does not wait for an animation.
 */
export function useCountUp(to: number, durationMs = 1600) {
  const ref = useRef<HTMLElement>(null);
  const [value, setValue] = useState(() => (typeof window === 'undefined' ? to : 0));

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (prefersReduced() || !('IntersectionObserver' in window)) {
      setValue(to);
      return;
    }

    let raf = 0;
    let start = 0;
    const easeOut = (t: number) => 1 - (1 - t) ** 3;

    const step = (now: number) => {
      if (!start) start = now;
      const t = Math.min(1, (now - start) / durationMs);
      setValue(to * easeOut(t));
      if (t < 1) raf = window.requestAnimationFrame(step);
    };

    const io = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        io.unobserve(entry.target);
        raf = window.requestAnimationFrame(step);
      }
    }, REVEAL_IN);
    io.observe(el);

    return () => { io.disconnect(); if (raf) window.cancelAnimationFrame(raf); };
  }, [to, durationMs]);

  return { ref, value };
}

/**
 * True once the page has scrolled past `offset`. Drives the nav's glass.
 *
 * rAF-throttled and only re-rendered when the answer changes, so a fling down
 * the page costs one state write, not one per scroll event.
 */
export function useScrolled(offset = 8) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    let frame = 0;
    let last: boolean | null = null;

    const sync = () => {
      frame = 0;
      const next = window.scrollY > offset;
      if (next === last) return;
      last = next;
      setScrolled(next);
    };
    const onScroll = () => { if (!frame) frame = window.requestAnimationFrame(sync); };

    window.addEventListener('scroll', onScroll, { passive: true });
    sync(); // arriving mid-page must land in the right state, not animate into it
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [offset]);

  return scrolled;
}
