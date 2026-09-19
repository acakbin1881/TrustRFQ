// The landing, in the carbon/lime language (tuneay/01-KARARLAR.md K-05).
//
// The structure follows Uniswap's: the hero does not describe the product, it
// SHOWS it — a filled ticket sits at the centre of the page, under one
// sentence, over a field of blurred orbs. Everything below is a card grid on
// carbon, and lime appears only where something acts or is live.
//
// Built with Tailwind against the carbon/lime tokens in src/styles/theme.css.
// The old hand-written hero.css is gone; nothing here uses .lp- classes.

import { useRef } from 'react';
import { Link } from 'react-router';
import { deskPath } from '../routes/sections';
import {
  CTA, FOOTER, GUARANTEES, HEADINGS, HERO, HERO_TICKET, LADDER, NAV_LINKS,
  SOLUTION, STEPS, type Rung, type TwoToneHeading,
} from './content';
import { useCarbonCanvas, useCountUp, usePointerDrift, useReveal, useScrolled } from './motion';

const DESK = deskPath('create');

/** Stagger helper: every reveal reads its own delay off --tr-delay. */
const delay = (ms: number) => ({ '--tr-delay': `${ms}ms` }) as React.CSSProperties;

/* ------------------------------------------------------------------ atoms */

function Mark({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden="true">
      <path d="M20 21 C26 13.5, 38 13.5, 44 21" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
      <path d="M44 43 C38 50.5, 26 50.5, 20 43" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
      <circle cx="15" cy="32" r="8" fill="currentColor" />
      <circle cx="49" cy="32" r="8" stroke="currentColor" strokeWidth="5" />
    </svg>
  );
}

/** The one loud control. Lime is a background here, never text on carbon. */
function LimeButton({ to, children, className = '' }: { to: string; children: React.ReactNode; className?: string }) {
  return (
    <Link
      to={to}
      className={`group inline-flex items-center gap-2 rounded-pill bg-lime px-6 py-3 font-grotesk
        text-[15px] font-semibold text-carbon transition-all duration-500 ease-glide
        hover:bg-lime-soft hover:shadow-[0_0_40px_-8px_var(--color-lime)] ${className}`}
    >
      {children}
      <span className="transition-transform duration-500 ease-glide group-hover:translate-x-1" aria-hidden="true">→</span>
    </Link>
  );
}

function GhostButton({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      className="inline-flex items-center gap-2 rounded-pill border border-carbon-line bg-carbon-card/60
        px-6 py-3 font-grotesk text-[15px] font-medium text-snow backdrop-blur-xl
        transition-colors duration-500 ease-glide hover:border-lime/40 hover:bg-carbon-hi"
    >
      {children}
    </a>
  );
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 font-grotesk text-[13px] font-medium uppercase tracking-[0.14em] text-slate">
      <span className="size-1.5 rounded-full bg-lime" aria-hidden="true" />
      {children}
    </span>
  );
}

function TwoTone({ heading }: { heading: TwoToneHeading }) {
  return (
    <>
      <span className="block text-snow">{heading.lead}</span>
      {heading.rest.map((line) => <span key={line} className="block text-ash">{line}</span>)}
    </>
  );
}

/* ----------------------------------------------------------------- chrome */

/** Blurred colour fields behind the hero. They drift with the pointer through
 *  --tr-mx/--tr-my rather than a wrapper transform — a transformed ancestor
 *  would become the backdrop root and flatten the frosted card's blur. */
function Orbs() {
  const orbs = [
    'left-[8%] top-[18%] size-72 bg-lime/18',
    'right-[10%] top-[12%] size-64 bg-[#3AFFD2]/12',
    'left-[22%] bottom-[8%] size-80 bg-lime/10',
    'right-[18%] bottom-[14%] size-56 bg-[#7A5CFF]/14',
  ];
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      {orbs.map((o, i) => (
        <div
          key={o}
          className={`absolute rounded-full blur-[90px] ${o}`}
          style={{
            transform: 'translate3d(calc(var(--tr-mx, 0) * 1px), calc(var(--tr-my, 0) * 1px), 0)',
            transition: 'transform 1200ms var(--ease-glide)',
            animation: `tr-float ${18 + i * 4}s ease-in-out ${i * 1.5}s infinite`,
          }}
        />
      ))}
    </div>
  );
}

function Nav() {
  const scrolled = useScrolled();
  return (
    <div className="fixed inset-x-0 top-0 z-50 flex justify-center px-4 pt-3 transition-all duration-700 ease-glide">
      <header
        className={`flex w-full items-center gap-6 rounded-pill px-4 py-2.5 transition-all duration-700 ease-glide
          ${scrolled
            ? 'max-w-5xl border border-carbon-line bg-carbon/70 shadow-[0_8px_40px_-12px_#000] backdrop-blur-2xl'
            : 'max-w-6xl border border-transparent bg-transparent'}`}
      >
        <Link to="/" className="flex items-center gap-2 font-grotesk text-[17px] font-semibold text-snow">
          <span className="text-lime"><Mark /></span>
          TrustRFQ
        </Link>

        <nav className="ml-4 hidden items-center gap-1 md:flex">
          {NAV_LINKS.map((l) => (
            <a key={l.href} href={l.href}
              className="rounded-pill px-3.5 py-2 font-grotesk text-[14px] text-ash
                transition-colors duration-400 ease-glide hover:bg-carbon-hi hover:text-snow">
              {l.label}
            </a>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          <span className="hidden items-center gap-2 rounded-pill border border-carbon-line px-3 py-1.5
            font-grotesk text-[12px] uppercase tracking-wider text-slate sm:inline-flex">
            <span className="size-1.5 animate-pulse rounded-full bg-lime" aria-hidden="true" />
            Testnet
          </span>
          <LimeButton to={DESK} className="!px-5 !py-2.5 !text-[14px]">Open the desk</LimeButton>
        </div>
      </header>
    </div>
  );
}

/* ------------------------------------------------------------------- hero */

/** A picture of the product, not a form. The desk is one click away, so an
 *  input here would be a second, worse version of the real ticket. */
function TicketPreview() {
  const leg = (l: { label: string; amount: string; token: string }, tone: string) => (
    <div className="rounded-well bg-carbon-deep/80 p-5 text-left">
      <div className="font-grotesk text-[13px] text-slate">{l.label}</div>
      <div className="mt-2 flex items-baseline justify-between gap-4">
        <span className={`font-grotesk text-[30px] font-medium tabular-nums tracking-tight ${tone}`}>
          {l.amount}
        </span>
        <span className="rounded-pill border border-carbon-line bg-carbon-card px-3 py-1.5
          font-grotesk text-[14px] font-medium text-snow">
          {l.token}
        </span>
      </div>
    </div>
  );

  return (
    <div className="relative mx-auto w-full max-w-[420px]">
      <div className="rounded-card border border-carbon-line bg-carbon-card/70 p-2.5 shadow-[0_40px_120px_-20px_#000] backdrop-blur-2xl">
        {leg(HERO_TICKET.send, 'text-snow')}

        {/* the seam: a swap glyph centred on the join between the two legs */}
        <div className="relative h-0">
          <div className="absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2">
            <span className="flex size-9 items-center justify-center rounded-xl border border-carbon-line
              bg-carbon-hi font-grotesk text-[15px] text-lime">↓</span>
          </div>
        </div>

        <div className="mt-1.5">{leg(HERO_TICKET.receive, 'text-lime')}</div>

        <Link to={DESK}
          className="mt-1.5 flex items-center justify-center rounded-well bg-lime py-4 font-grotesk
            text-[15px] font-semibold text-carbon transition-all duration-500 ease-glide
            hover:bg-lime-soft hover:shadow-[0_0_50px_-10px_var(--color-lime)]">
          Open the desk
        </Link>
      </div>

      <p className="mt-4 text-center font-grotesk text-[13px] text-slate">{HERO_TICKET.footnote}</p>
    </div>
  );
}

function Hero() {
  const driftRef = useRef<HTMLElement>(null);
  usePointerDrift(driftRef, 14);

  return (
    <section ref={driftRef} className="relative overflow-hidden px-6 pb-24 pt-36 md:pt-44">
      <Orbs />

      <div className="relative mx-auto max-w-3xl text-center">
        <div className="tr-reveal inline-block" style={delay(0)}>
          <span className="inline-flex items-center gap-2.5 rounded-pill border border-carbon-line
            bg-carbon-card/60 px-4 py-2 font-grotesk text-[13px] text-ash backdrop-blur-xl">
            <span className="size-1.5 rounded-full bg-lime" aria-hidden="true" />
            <strong className="font-medium text-snow">{HERO.pill.strong}</strong>
            {HERO.pill.rest}
          </span>
        </div>

        <h1 className="tr-reveal mt-7 font-grotesk text-[clamp(2.5rem,6vw,4.25rem)] font-medium
          leading-[1.04] tracking-[-0.03em]" style={delay(80)}>
          <TwoTone heading={HERO.heading} />
        </h1>

        <div className="tr-reveal mt-10" style={delay(160)}>
          <TicketPreview />
        </div>

        <div className="tr-reveal mt-9 flex flex-wrap items-center justify-center gap-3" style={delay(240)}>
          <GhostButton href={HERO.ctas.secondary.href}>{HERO.ctas.secondary.label}</GhostButton>
        </div>
      </div>
    </section>
  );
}

/* --------------------------------------------------------------- sections */

function Section({ id, children }: { id?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="px-6 py-24 md:py-32">
      <div className="mx-auto max-w-6xl">{children}</div>
    </section>
  );
}

/** One rung of the slippage ladder — the figures count up as it arrives. */
function LadderRow({ rung, index }: { rung: Rung; index: number }) {
  const pct = useCountUp(rung.pctValue);
  const loss = useCountUp(rung.lossValue);

  return (
    <div className="tr-reveal grid grid-cols-[auto_1fr_auto] items-center gap-5 border-t border-carbon-line py-5 first:border-t-0"
      style={delay(index * 90)}>
      <span className="w-16 font-grotesk text-[15px] font-medium text-snow">{rung.size}</span>

      <span className="relative h-1.5 overflow-hidden rounded-pill bg-carbon-deep">
        <span
          className="absolute inset-y-0 left-0 rounded-pill bg-lime/70"
          style={{ width: rung.width, transition: 'width 1400ms var(--ease-glide)' }}
        />
      </span>

      <span className="flex items-baseline justify-end gap-3 text-right">
        <span ref={pct.ref as React.Ref<HTMLSpanElement>}
          className="font-grotesk text-[15px] tabular-nums text-ash">
          ~{Math.round(pct.value)}%
        </span>
        <span ref={loss.ref as React.Ref<HTMLSpanElement>}
          className="w-28 font-grotesk text-[15px] font-medium tabular-nums text-lime">
          ~${Math.round(loss.value)}{rung.lossUnit} lost
        </span>
      </span>
    </div>
  );
}

function Problem() {
  const h = HEADINGS.problem;
  return (
    <Section id="why">
      <div className="grid gap-14 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-20">
        <div>
          <div className="tr-reveal"><Eyebrow>{h.eyebrow}</Eyebrow></div>
          <h2 className="tr-reveal mt-6 font-grotesk text-[clamp(1.9rem,3.6vw,2.9rem)] font-medium
            leading-[1.1] tracking-[-0.025em] text-snow" style={delay(60)}>
            {h.title}
          </h2>
          <p className="tr-reveal mt-6 max-w-md font-grotesk text-[16px] leading-relaxed text-ash" style={delay(120)}>
            Those are pool prices, and the pools are <span className="text-snow">structurally shallow</span>. At
            block size an order moves the very price it is quoted against, so the slippage is not a fee you pay
            once. It is a price change you cause. Past a certain size, clearing a block on a DEX is not
            expensive — it is <span className="text-snow">arithmetically impossible</span>.
          </p>
        </div>

        <figure className="tr-reveal rounded-card border border-carbon-line bg-carbon-card/50 p-7 backdrop-blur-xl"
          style={delay(100)}>
          <figcaption className="mb-2 flex items-baseline justify-between">
            <span className="font-grotesk text-[15px] font-medium text-snow">{LADDER.title}</span>
            <span className="font-grotesk text-[12px] uppercase tracking-wider text-slate">
              {LADDER.axis.from} — {LADDER.axis.to}
            </span>
          </figcaption>
          {LADDER.rungs.map((r, i) => <LadderRow key={r.size} rung={r} index={i} />)}
        </figure>
      </div>
    </Section>
  );
}

function Solution() {
  const h = HEADINGS.solution;
  return (
    <Section>
      <div className="tr-reveal"><Eyebrow>{h.eyebrow}</Eyebrow></div>
      <h2 className="tr-reveal mt-6 font-grotesk text-[clamp(1.9rem,3.6vw,2.9rem)] font-medium
        tracking-[-0.025em] text-snow" style={delay(60)}>
        {h.title}
      </h2>

      <div className="mt-12 grid gap-4 md:grid-cols-3">
        {SOLUTION.map((c, i) => (
          <article key={c.num}
            className="tr-reveal group rounded-card border border-carbon-line bg-carbon-card/50 p-7
              transition-all duration-700 ease-glide hover:border-lime/25 hover:bg-carbon-hi/60"
            style={delay(120 + i * 90)}>
            <span className="font-grotesk text-[13px] tabular-nums text-lime">{c.num}</span>
            <h3 className="mt-5 font-grotesk text-[19px] font-medium tracking-[-0.01em] text-snow">{c.title}</h3>
            <p className="mt-3 font-grotesk text-[15px] leading-relaxed text-ash">{c.body}</p>
          </article>
        ))}
      </div>
    </Section>
  );
}

function HowItWorks() {
  const h = HEADINGS.how;
  return (
    <Section id="how">
      <div className="tr-reveal"><Eyebrow>{h.eyebrow}</Eyebrow></div>
      <h2 className="tr-reveal mt-6 max-w-3xl font-grotesk text-[clamp(1.9rem,3.6vw,2.9rem)] font-medium
        leading-[1.1] tracking-[-0.025em]" style={delay(60)}>
        <TwoTone heading={h.title} />
      </h2>

      <ol className="mt-14 grid gap-px overflow-hidden rounded-card border border-carbon-line
        bg-carbon-line md:grid-cols-3">
        {STEPS.map((s, i) => (
          <li key={s.num} className="tr-reveal bg-carbon-card/60 p-8" style={delay(120 + i * 90)}>
            <div className="flex items-center gap-3">
              <span className="flex size-9 items-center justify-center rounded-full border border-lime/30
                font-grotesk text-[13px] tabular-nums text-lime">{s.num}</span>
              <span className="h-px flex-1 bg-carbon-line" aria-hidden="true" />
            </div>
            <h3 className="mt-6 font-grotesk text-[18px] font-medium tracking-[-0.01em] text-snow">{s.title}</h3>
            <p className="mt-3 font-grotesk text-[15px] leading-relaxed text-ash">{s.body}</p>
          </li>
        ))}
      </ol>
    </Section>
  );
}

function Security() {
  const h = HEADINGS.security;
  return (
    <Section id="security">
      <div className="grid gap-14 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-20">
        <div>
          <div className="tr-reveal"><Eyebrow>{h.eyebrow}</Eyebrow></div>
          <h2 className="tr-reveal mt-6 font-grotesk text-[clamp(1.9rem,3.6vw,2.9rem)] font-medium
            leading-[1.1] tracking-[-0.025em]" style={delay(60)}>
            <TwoTone heading={h.title} />
          </h2>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {GUARANTEES.map((g, i) => (
            <article key={g.name}
              className="tr-reveal rounded-card border border-carbon-line bg-carbon-card/50 p-6"
              style={delay(100 + i * 70)}>
              <h3 className="font-grotesk text-[16px] font-medium text-snow">{g.name}</h3>
              <p className="mt-2.5 font-grotesk text-[14px] leading-relaxed text-ash">{g.desc}</p>
            </article>
          ))}
        </div>
      </div>
    </Section>
  );
}

function CallToAction() {
  return (
    <Section>
      <div className="tr-reveal relative overflow-hidden rounded-card border border-carbon-line
        bg-carbon-card/60 px-8 py-14 text-center md:px-14">
        <div className="pointer-events-none absolute -top-24 left-1/2 size-80 -translate-x-1/2
          rounded-full bg-lime/12 blur-[100px]" aria-hidden="true" />
        <div className="relative">
          <h3 className="font-grotesk text-[clamp(1.7rem,3vw,2.4rem)] font-medium tracking-[-0.025em] text-snow">
            {CTA.title}
          </h3>
          <p className="mx-auto mt-4 max-w-md font-grotesk text-[16px] leading-relaxed text-ash">{CTA.sub}</p>
          <div className="mt-9 flex justify-center">
            <LimeButton to={DESK}>{CTA.button}</LimeButton>
          </div>
        </div>
      </div>
    </Section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-carbon-line px-6 py-14">
      <div className="mx-auto flex max-w-6xl flex-col gap-10 md:flex-row md:items-start md:justify-between">
        <div>
          <Link to="/" className="flex items-center gap-2 font-grotesk text-[17px] font-semibold text-snow">
            <span className="text-lime"><Mark /></span>
            TrustRFQ
          </Link>
          <p className="mt-3 font-grotesk text-[14px] text-slate">{FOOTER.tagline}</p>
        </div>

        <nav className="flex flex-wrap gap-x-7 gap-y-3 font-grotesk text-[14px]">
          <Link to={DESK} className="text-ash transition-colors duration-400 ease-glide hover:text-lime">
            Open the desk
          </Link>
          {NAV_LINKS.map((l) => (
            <a key={l.href} href={l.href}
              className="text-ash transition-colors duration-400 ease-glide hover:text-lime">{l.label}</a>
          ))}
        </nav>
      </div>

      <div className="mx-auto mt-12 max-w-6xl border-t border-carbon-line pt-7
        font-grotesk text-[13px] text-slate">
        {FOOTER.fine}
      </div>
    </footer>
  );
}

/* ------------------------------------------------------------------- page */

export default function Landing() {
  const scopeRef = useRef<HTMLDivElement>(null);
  useCarbonCanvas();
  useReveal(scopeRef);

  return (
    <div ref={scopeRef} className="min-h-screen bg-carbon font-grotesk antialiased">
      <Nav />
      <Hero />
      <main>
        <Problem />
        <Solution />
        <HowItWorks />
        <Security />
        <CallToAction />
      </main>
      <Footer />
    </div>
  );
}
