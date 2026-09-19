// The landing, ported from the hand-written public/hero.html.
//
// The markup is carried over structurally intact — every .lp- class, every
// wrapper, every aria-hidden — because hero.css is a self-contained design
// system keyed to exactly these selectors and the port is meant to be
// invisible. What changed: the repeated blocks (tickets, ladder rungs, slab
// columns, rail steps, guarantee cells) are now rendered from content.ts, so a
// row is data rather than cloned markup.
//
// Structural notes worth keeping (they were comments in hero.html):
// · The nav sits OUTSIDE the panel. It has to survive the whole scroll, and a
//   sticky child is confined to its containing block — inside .lp-surface it
//   would be released the moment the panel scrolled past. So the bar is fixed
//   and .lp-nav__gap holds its seat in the panel's flow.
// · .lp-surface__wrap keeps the nav and hero on the same --lp-col line as every
//   section below; without it the headline runs to the window's edge.
// · The ladder card carries no .lp-reveal: it is ALREADY there when you arrive.
//   What animates is what it says.

import { useRef } from 'react';
import { Link } from 'react-router';
import { deskPath } from '../routes/sections';
import {
  CTA, DEAL_CHIPS, DEAL_TICKETS, FOOTER, GUARANTEES, HEADINGS, HERO, LADDER,
  NAV_LINKS, SOLUTION, STEPS, type DealChip, type DealTicket, type TwoToneHeading,
} from './content';
import { useLandingMotion, useParallax, useStickyNav } from './motion';
import './hero.css';

/** --lp-delay and friends are custom properties; React needs the cast. */
const vars = (v: Record<string, string | number>) => v as React.CSSProperties;

const DESK = deskPath('create');

function BrandMark() {
  return (
    <span className="lp-brand__mark">
      <svg width="20" height="20" viewBox="0 0 64 64" fill="none" aria-hidden="true">
        <path d="M20 21 C26 13.5, 38 13.5, 44 21" stroke="#fff" strokeWidth="5" strokeLinecap="round" />
        <path d="M44 43 C38 50.5, 26 50.5, 20 43" stroke="#fff" strokeWidth="5" strokeLinecap="round" />
        <circle cx="15" cy="32" r="8" fill="#fff" />
        <circle cx="49" cy="32" r="8" stroke="#fff" strokeWidth="5" />
      </svg>
    </span>
  );
}

/** <b> reads in full ink, each <span> in the mist tone on its own line. */
function TwoTone({ heading }: { heading: TwoToneHeading }) {
  return (
    <>
      <b>{heading.lead}</b>
      {heading.rest.map((line) => <span key={line}>{line}</span>)}
    </>
  );
}

function Nav() {
  const barRef = useRef<HTMLDivElement>(null);
  useStickyNav(barRef);

  return (
    <div className="lp-topbar" ref={barRef}>
      <header className="lp-nav">
        <Link className="lp-brand" to="/">
          <BrandMark />
          <span className="lp-brand__name">TrustRFQ</span>
        </Link>

        <nav className="lp-nav__links">
          {NAV_LINKS.map((l) => (
            <a key={l.href} className="lp-nav__link" href={l.href}>{l.label}</a>
          ))}
        </nav>

        <div className="lp-nav__actions">
          <Link className="lp-btn lp-btn--solid lp-btn--sm" to={DESK}>Open the desk</Link>
        </div>
      </header>
    </div>
  );
}

/** The hero's signature element: one deal, as three signed tickets. */
function DealStack() {
  const dealRef = useRef<HTMLDivElement>(null);
  useParallax(dealRef);

  const [signed, atomic] = DEAL_CHIPS;
  const [send, recv, fill] = DEAL_TICKETS;

  const ticket = (t: DealTicket) => (
    <article className={`lp-ticket lp-ticket--${t.variant}`} style={vars({ '--lp-delay': t.delay })}>
      <div className="lp-ticket__top">
        <div>
          <div className="lp-ticket__label">{t.label}</div>
          <div className="lp-ticket__val">{t.value}</div>
        </div>
        <div className="lp-ticket__asset">{t.asset}</div>
      </div>
      <div className="lp-ticket__band">
        <div>
          <div className="lp-ticket__label">{t.bandLabel}</div>
          <div className="lp-ticket__amount">{t.bandValue}</div>
        </div>
        <div>
          <div className="lp-ticket__label">{t.maskLabel}</div>
          <div className="lp-ticket__mask">••••••••••</div>
        </div>
      </div>
    </article>
  );

  const chip = (c: DealChip) => (
    <span className={`lp-chip lp-chip--${c.variant} lp-glass`} style={vars({ '--lp-delay': c.delay })}>
      {c.label}
    </span>
  );

  // Order is the composition, not the data: a chip sits between the first two
  // tickets and the last one closes the stack.
  return (
    <div className="lp-deal" aria-hidden="true" ref={dealRef}>
      {ticket(send)}
      {chip(signed)}
      {ticket(recv)}
      {ticket(fill)}
      {chip(atomic)}
      <span className="lp-orb lp-orb--b lp-glass">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
          <path d="M4 12 H20 M14 6 L20 12 L14 18" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    </div>
  );
}

function Hero() {
  return (
    <section className="lp-hero">
      <div className="lp-hero__copy">
        <div className="lp-pill lp-glass lp-reveal">
          <span className="lp-pill__marks" aria-hidden="true">
            {HERO.pill.marks.map((m) => <span key={m} className="lp-pill__mark">{m}</span>)}
          </span>
          <span><strong>{HERO.pill.strong}</strong>{HERO.pill.rest}</span>
        </div>

        <h1 className="lp-h1 lp-reveal" style={vars({ '--lp-delay': '80ms' })}>
          <TwoTone heading={HERO.heading} />
        </h1>

        <div className="lp-hero__ctas lp-reveal" style={vars({ '--lp-delay': '160ms' })}>
          <Link className="lp-btn lp-btn--solid" to={DESK}>{HERO.ctas.primary}</Link>
          <a className="lp-btn lp-btn--white" href={HERO.ctas.secondary.href}>{HERO.ctas.secondary.label}</a>
        </div>
      </div>

      <DealStack />
    </section>
  );
}

function Problem() {
  const h = HEADINGS.problem;
  return (
    <section className="lp-section" id="why">
      <div className="lp-section__wrap">
        {/* The film's first two beats. The headline waits out the eyebrow rather
            than racing it; the ladder waits out both (--lp-lead-in in hero.css). */}
        <div className="lp-eyebrow lp-pane lp-reveal lp-type" style={vars({ '--lp-delay': '200ms' })}>
          {h.eyebrow}
        </div>
        <h2 className="lp-h2 lp-reveal lp-type" data-lp-speed={h.typeSpeed} style={vars({ '--lp-delay': '900ms' })}>
          {h.title}
        </h2>

        <figure className="lp-ladder lp-pane">
          <figcaption className="lp-ladder__head">
            <span className="lp-ladder__title">{LADDER.title}</span>
            <span className="lp-ladder__axis">{LADDER.axis.from}<i />{LADDER.axis.to}</span>
          </figcaption>

          {LADDER.rungs.map((r) => (
            <div className="lp-rung" key={r.size}>
              <div className="lp-rung__size lp-type">{r.size}</div>
              <div className="lp-rung__track"><div className="lp-rung__bar" style={vars({ '--w': r.width })} /></div>
              <div className="lp-rung__pct lp-type">{r.pct}</div>
              <div className="lp-rung__loss lp-type">{r.loss}</div>
            </div>
          ))}
        </figure>

        <p className="lp-note lp-reveal" style={vars({ '--lp-delay': '240ms' })}>Those are pool prices, and the pools are{' '}
          <strong>structurally shallow</strong>. At block size an order moves the very price it is
          quoted against, so the slippage is not a fee you pay once. It is a price change you cause.
          Past a certain size, clearing a block on a DEX is not expensive. It is{' '}
          <strong>arithmetically impossible</strong>.</p>
      </div>
    </section>
  );
}

function Solution() {
  const h = HEADINGS.solution;
  return (
    <section className="lp-section">
      <div className="lp-section__wrap">
        <div className="lp-eyebrow lp-pane lp-reveal">{h.eyebrow}</div>
        <h2 className="lp-h2 lp-reveal" style={vars({ '--lp-delay': '60ms' })}>{h.title}</h2>

        <div className="lp-slab lp-pane lp-reveal" style={vars({ '--lp-delay': '120ms' })}>
          {SOLUTION.map((c) => (
            <article className="lp-slab__col" key={c.num}>
              <span className="lp-slab__num">{c.num}</span>
              <h3 className="lp-slab__title">{c.title}</h3>
              <p className="lp-slab__body">{c.body}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function HowItWorks() {
  const h = HEADINGS.how;
  return (
    <section className="lp-section" id="how">
      <div className="lp-section__wrap">
        <div className="lp-eyebrow lp-reveal">{h.eyebrow}</div>
        <h2 className="lp-h2 lp-rail__lede lp-reveal" style={vars({ '--lp-delay': '60ms' })}>
          <TwoTone heading={h.title} />
        </h2>

        <ol className="lp-rail">
          {STEPS.map((s) => (
            <li className="lp-rail__step lp-reveal" key={s.num}
              style={s.delay ? vars({ '--lp-delay': s.delay }) : undefined}>
              <div className="lp-rail__head">
                <span className="lp-rail__num">{s.num}</span>
                <span className="lp-rail__line" />
              </div>
              <h3 className="lp-rail__title">{s.title}</h3>
              <p className="lp-rail__body">{s.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function Security() {
  const h = HEADINGS.security;
  return (
    <section className="lp-section" id="security">
      <div className="lp-section__wrap lp-shield">
        <div className="lp-shield__lede">
          <div className="lp-eyebrow lp-pane lp-reveal">{h.eyebrow}</div>
          <h2 className="lp-h2 lp-shield__title lp-reveal" style={vars({ '--lp-delay': '60ms' })}>
            <TwoTone heading={h.title} />
          </h2>
        </div>

        <div className="lp-shield__grid lp-pane lp-reveal" style={vars({ '--lp-delay': '140ms' })}>
          {GUARANTEES.map((g) => (
            <article className="lp-shield__cell" key={g.name}>
              <h3 className="lp-shield__name">{g.name}</h3>
              <p className="lp-shield__desc">{g.desc}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function CallToAction() {
  return (
    <section className="lp-section">
      <div className="lp-section__wrap">
        <div className="lp-cta lp-pane lp-reveal">
          <div>
            <h3 className="lp-cta__title">{CTA.title}</h3>
            <p className="lp-cta__sub">{CTA.sub}</p>
          </div>
          <Link className="lp-btn lp-btn--solid" to={DESK}>{CTA.button}</Link>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="lp-footer">
      <div className="lp-footer__inner">
        <div>
          <Link className="lp-brand" to="/">
            <BrandMark />
            <span className="lp-brand__name">TrustRFQ</span>
          </Link>
          <p className="lp-footer__tag">{FOOTER.tagline}</p>
        </div>
        <nav className="lp-footer__links">
          <Link to={DESK}>Open the desk</Link>
          {NAV_LINKS.map((l) => <a key={l.href} href={l.href}>{l.label}</a>)}
        </nav>
      </div>
      <div className="lp-footer__fine">{FOOTER.fine}</div>
    </footer>
  );
}

export default function Landing() {
  const scopeRef = useRef<HTMLDivElement>(null);
  useLandingMotion(scopeRef);

  return (
    <div ref={scopeRef}>
      <Nav />

      <div className="lp-canvas">
        <div className="lp-surface">
          {(['a', 'b', 'c', 'd', 'e'] as const).map((a) => (
            <div key={a} className={`lp-arc lp-arc--${a}`} aria-hidden="true" />
          ))}

          <div className="lp-surface__wrap">
            {/* the seat the fixed nav vacated: same height, so the hero starts
                exactly where it always did */}
            <div className="lp-nav__gap" aria-hidden="true" />
            <Hero />
          </div>
        </div>

        <main>
          <Problem />
          <Solution />
          <HowItWorks />
          <Security />
          <CallToAction />
        </main>

        <Footer />
      </div>
    </div>
  );
}
