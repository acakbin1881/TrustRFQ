// The landing, in the carbon/lime language (tuneay/01-KARARLAR.md K-05).
//
// Structure follows Uniswap's: the hero does not describe the product, it SHOWS
// it — a filled ticket at the centre of the page under one sentence. What is
// not theirs is the restraint: one accent, and it only marks what acts.
//
// Three things here are reactions to the page looking generic on first pass:
// · The ground is a measured grid with grain, not blurred colour blobs. Blobs
//   are the default look of every template; a grid says "instrument".
// · Nothing glows on hover. Buttons answer by exchanging their label for the
//   next one and easing the icon forward — movement, not light.
// · The Testnet badge rides ON the primary button instead of sitting beside it
//   as a third pill in the bar. It is a qualifier on the action, not a
//   navigation item, so it belongs on the thing it qualifies.

import { useEffect, useRef } from 'react';
import { Link } from 'react-router';
import {
  Anchor, ArrowDown, ArrowRight, ArrowLeftRight, CheckCheck, Cpu, EyeOff,
  Fingerprint, FlaskConical, PenLine, Wallet, Zap, type LucideIcon,
} from 'lucide-react';
import { deskPath } from '../routes/sections';
import {
  CTA, FOOTER, GUARANTEES, HEADINGS, HERO, HERO_TICKET, LADDER, NAV_LINKS,
  SOLUTION, STEPS, type IconKey, type Rung, type TwoToneHeading,
} from './content';
import {
  useCarbonCanvas, useCountUp, usePointerSpot, useReveal, useScrolled,
} from './motion';

const DESK = deskPath('create');

/** Stagger helper: every reveal reads its own delay off --tr-delay. */
const delay = (ms: number) => ({ '--tr-delay': `${ms}ms` }) as React.CSSProperties;

/** Icon keys live in content.ts as plain strings; this is where they become
 *  components. Lucide throughout, drawn at 1.5 stroke with round caps — thinner
 *  than the default so they sit beside Space Grotesk rather than shouting over it. */
const ICONS: Record<IconKey, LucideIcon> = {
  anchor: Anchor,
  hidden: EyeOff,
  atomic: Zap,
  sign: PenLine,
  countersign: CheckCheck,
  fill: ArrowLeftRight,
  wallet: Wallet,
  contract: Cpu,
  signature: Fingerprint,
  testnet: FlaskConical,
};

function Icon({ name, className = 'size-5' }: { name: IconKey; className?: string }) {
  const Glyph = ICONS[name];
  return <Glyph className={className} strokeWidth={1.5} aria-hidden="true" />;
}

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

/**
 * A label that swaps for a second one on hover: the first slides up and out,
 * the second arrives from below, both on the glide curve.
 *
 * Both labels are always in the DOM, stacked in a clipped box sized by the
 * first — so the button never changes width mid-hover, which would shove the
 * layout around under the cursor.
 */
function SwapLabel({ idle, hover }: { idle: string; hover: string }) {
  return (
    <span className="relative grid overflow-hidden">
      <span className="col-start-1 row-start-1 transition-transform duration-500 ease-glide
        group-hover:-translate-y-[130%]">
        {idle}
      </span>
      <span aria-hidden="true"
        className="col-start-1 row-start-1 translate-y-[130%] transition-transform duration-500
          ease-glide group-hover:translate-y-0">
        {hover}
      </span>
    </span>
  );
}

/** The one loud control. Lime is a background here, never text on carbon.
 *  No glow: it answers with the label swap and the arrow easing forward. */
function LimeButton({
  to, idle, hover, className = '',
}: { to: string; idle: string; hover: string; className?: string }) {
  return (
    <Link
      to={to}
      className={`group inline-flex items-center gap-2.5 rounded-pill bg-lime px-6 py-3
        font-grotesk text-[15px] font-semibold text-carbon transition-colors duration-500
        ease-glide hover:bg-lime-soft ${className}`}
    >
      <SwapLabel idle={idle} hover={hover} />
      <ArrowRight className="size-4 transition-transform duration-500 ease-glide group-hover:translate-x-1"
        strokeWidth={2} aria-hidden="true" />
    </Link>
  );
}

/**
 * The primary action with its network badge riding on it.
 *
 * The badge used to be a third pill in the nav bar, where it read as a
 * navigation item and made the bar look assembled from parts. It qualifies the
 * ACTION — this desk trades on Testnet — so it sits on the button it qualifies.
 */
function DeskAction({ idle = 'Open the desk', hover = 'Start trading', className = '' }) {
  return (
    <span className={`relative inline-block ${className}`}>
      <span className="pointer-events-none absolute -top-2 right-3 z-10 flex items-center gap-1
        rounded-pill border border-carbon-line bg-carbon px-2 py-[3px] font-grotesk
        text-[10px] font-medium uppercase tracking-[0.12em] text-lime">
        <span className="size-1 rounded-full bg-lime" aria-hidden="true" />
        Testnet
      </span>
      <LimeButton to={DESK} idle={idle} hover={hover} />
    </span>
  );
}

function GhostButton({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      className="group inline-flex items-center gap-2 rounded-pill border border-carbon-line
        bg-carbon-card/50 px-6 py-3 font-grotesk text-[15px] font-medium text-snow
        backdrop-blur-xl transition-colors duration-500 ease-glide
        hover:border-carbon-line hover:bg-carbon-hi"
    >
      {children}
      <ArrowDown className="size-4 text-slate transition-all duration-500 ease-glide
        group-hover:translate-y-0.5 group-hover:text-lime" strokeWidth={1.5} aria-hidden="true" />
    </a>
  );
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 font-grotesk text-[13px] font-medium
      uppercase tracking-[0.14em] text-slate">
      <span className="h-px w-6 bg-lime/60" aria-hidden="true" />
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

/** A card that answers a hover by lifting its border and surface, nothing more.
 *  The earlier version threw a lime glow, which read as a notification rather
 *  than a response. */
function Card({ className = '', children, style }: {
  className?: string; children: React.ReactNode; style?: React.CSSProperties;
}) {
  return (
    <div style={style}
      className={`rounded-card border border-carbon-line bg-carbon-card/50 transition-colors
        duration-700 ease-glide hover:border-carbon-line/0 hover:bg-carbon-hi/70 ${className}`}>
      {children}
    </div>
  );
}

/* ----------------------------------------------------------------- chrome */

/** The ground: a masked grid, film grain and one soft light that trails the
 *  pointer. Deliberately not blurred colour blobs — see the file header. */
function Ground() {
  return (
    <>
      <div className="tr-grid pointer-events-none absolute inset-0" aria-hidden="true" />
      <div className="tr-spot pointer-events-none absolute inset-0" aria-hidden="true" />
      {/* the grid has to stop before the next section starts, or it reads as
          wallpaper running under the content */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40
        bg-gradient-to-b from-transparent to-carbon" aria-hidden="true" />
    </>
  );
}

function Nav() {
  const scrolled = useScrolled();
  return (
    <div className="fixed inset-x-0 top-0 z-50 flex justify-center px-4 pt-3">
      <header
        className={`flex w-full items-center gap-6 rounded-pill px-4 py-2.5 transition-all
          duration-700 ease-glide
          ${scrolled
            ? 'max-w-5xl border border-carbon-line bg-carbon/75 backdrop-blur-2xl'
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
                transition-colors duration-500 ease-glide hover:bg-carbon-hi hover:text-snow">
              {l.label}
            </a>
          ))}
        </nav>

        <div className="ml-auto">
          <DeskAction />
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
    <div className="rounded-well bg-carbon-deep/70 p-5 text-left">
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
      <div className="rounded-card border border-carbon-line bg-carbon-card/60 p-2.5 backdrop-blur-2xl">
        {leg(HERO_TICKET.send, 'text-snow')}

        {/* the seam: the swap glyph centred on the join between the two legs */}
        <div className="relative h-0">
          <div className="absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2">
            <span className="flex size-9 items-center justify-center rounded-xl border
              border-carbon-line bg-carbon-hi text-lime">
              <ArrowDown className="size-4" strokeWidth={1.75} aria-hidden="true" />
            </span>
          </div>
        </div>

        <div className="mt-1.5">{leg(HERO_TICKET.receive, 'text-lime')}</div>

        <Link to={DESK}
          className="group mt-1.5 flex items-center justify-center gap-2.5 rounded-well bg-lime
            py-4 font-grotesk text-[15px] font-semibold text-carbon transition-colors
            duration-500 ease-glide hover:bg-lime-soft">
          <SwapLabel idle="Open the desk" hover="Sign and send" />
          <ArrowRight className="size-4 transition-transform duration-500 ease-glide
            group-hover:translate-x-1" strokeWidth={2} aria-hidden="true" />
        </Link>
      </div>

      <p className="mt-4 text-center font-grotesk text-[13px] text-slate">{HERO_TICKET.footnote}</p>
    </div>
  );
}

function Hero() {
  const groundRef = useRef<HTMLElement>(null);
  usePointerSpot(groundRef);

  return (
    <section ref={groundRef} className="tr-grain relative overflow-hidden px-6 pb-24 pt-36 md:pt-44">
      <Ground />

      <div className="relative mx-auto max-w-3xl text-center">
        <div className="tr-reveal inline-block" style={delay(0)}>
          <span className="inline-flex items-center gap-2.5 rounded-pill border border-carbon-line
            bg-carbon-card/50 px-4 py-2 font-grotesk text-[13px] text-ash backdrop-blur-xl">
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

        <div className="tr-reveal mt-9 flex justify-center" style={delay(240)}>
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
    <div className="tr-reveal grid grid-cols-[auto_1fr_auto] items-center gap-5 border-t
      border-carbon-line py-5 first:border-t-0" style={delay(index * 90)}>
      <span className="w-16 font-grotesk text-[15px] font-medium text-snow">{rung.size}</span>

      <span className="relative h-1.5 overflow-hidden rounded-pill bg-carbon-deep">
        <span className="absolute inset-y-0 left-0 rounded-pill bg-lime/70"
          style={{ width: rung.width, transition: 'width 1400ms var(--ease-glide)' }} />
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
          <p className="tr-reveal mt-6 max-w-md font-grotesk text-[16px] leading-relaxed text-ash"
            style={delay(120)}>
            Those are pool prices, and the pools are <span className="text-snow">structurally
            shallow</span>. At block size an order moves the very price it is quoted against, so the
            slippage is not a fee you pay once. It is a price change you cause. Past a certain size,
            clearing a block on a DEX is not expensive — it is{' '}
            <span className="text-snow">arithmetically impossible</span>.
          </p>
        </div>

        <figure className="tr-reveal rounded-card border border-carbon-line bg-carbon-card/50 p-7
          backdrop-blur-xl" style={delay(100)}>
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
          <Card key={c.num} className="tr-reveal group p-7" style={delay(120 + i * 90)}>
            <div className="flex items-center justify-between">
              <span className="flex size-11 items-center justify-center rounded-well border
                border-carbon-line bg-carbon-deep/60 text-lime transition-colors duration-700
                ease-glide group-hover:bg-carbon-deep">
                <Icon name={c.icon} />
              </span>
              <span className="font-grotesk text-[13px] tabular-nums text-slate">{c.num}</span>
            </div>
            <h3 className="mt-6 font-grotesk text-[19px] font-medium tracking-[-0.01em] text-snow">
              {c.title}
            </h3>
            <p className="mt-3 font-grotesk text-[15px] leading-relaxed text-ash">{c.body}</p>
          </Card>
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
      <h2 className="tr-reveal mt-6 max-w-3xl font-grotesk text-[clamp(1.9rem,3.6vw,2.9rem)]
        font-medium leading-[1.1] tracking-[-0.025em]" style={delay(60)}>
        <TwoTone heading={h.title} />
      </h2>

      <ol className="mt-14 grid gap-px overflow-hidden rounded-card border border-carbon-line
        bg-carbon-line md:grid-cols-3">
        {STEPS.map((s, i) => (
          <li key={s.num} className="tr-reveal group bg-carbon-card/60 p-8 transition-colors
            duration-700 ease-glide hover:bg-carbon-hi/70" style={delay(120 + i * 90)}>
            <div className="flex items-center gap-4">
              <span className="flex size-11 items-center justify-center rounded-well border
                border-carbon-line bg-carbon-deep/60 text-lime">
                <Icon name={s.icon} />
              </span>
              <span className="h-px flex-1 bg-carbon-line" aria-hidden="true" />
              <span className="font-grotesk text-[13px] tabular-nums text-slate">{s.num}</span>
            </div>
            <h3 className="mt-6 font-grotesk text-[18px] font-medium tracking-[-0.01em] text-snow">
              {s.title}
            </h3>
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
            <Card key={g.name} className="tr-reveal p-6" style={delay(100 + i * 70)}>
              <div className="flex items-start gap-3.5">
                <span className="mt-0.5 text-lime"><Icon name={g.icon} className="size-[18px]" /></span>
                <div>
                  <h3 className="font-grotesk text-[16px] font-medium text-snow">{g.name}</h3>
                  <p className="mt-2 font-grotesk text-[14px] leading-relaxed text-ash">{g.desc}</p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </Section>
  );
}

function CallToAction() {
  return (
    <Section>
      <div className="tr-reveal tr-grain relative overflow-hidden rounded-card border
        border-carbon-line bg-carbon-card/50 px-8 py-16 text-center md:px-14">
        <div className="tr-grid pointer-events-none absolute inset-0 opacity-60" aria-hidden="true" />
        <div className="relative">
          <h3 className="font-grotesk text-[clamp(1.7rem,3vw,2.4rem)] font-medium
            tracking-[-0.025em] text-snow">
            {CTA.title}
          </h3>
          <p className="mx-auto mt-4 max-w-md font-grotesk text-[16px] leading-relaxed text-ash">
            {CTA.sub}
          </p>
          <div className="mt-10 flex justify-center">
            {/* no Testnet badge here: the nav already carries it, and the line
                above this button says "Connect a Testnet wallet" */}
            <LimeButton to={DESK} idle={CTA.button} hover="Connect a wallet" />
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
          <Link to={DESK} className="group inline-flex items-center gap-1.5 text-ash
            transition-colors duration-500 ease-glide hover:text-lime">
            Open the desk
            <ArrowRight className="size-3.5 transition-transform duration-500 ease-glide
              group-hover:translate-x-0.5" strokeWidth={1.5} aria-hidden="true" />
          </Link>
          {NAV_LINKS.map((l) => (
            <a key={l.href} href={l.href}
              className="text-ash transition-colors duration-500 ease-glide hover:text-lime">
              {l.label}
            </a>
          ))}
        </nav>
      </div>

      <div className="mx-auto mt-12 max-w-6xl border-t border-carbon-line pt-7 font-grotesk
        text-[13px] text-slate">
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

  // A cold load of /#how cannot scroll itself: the browser looks for #how
  // before React has rendered it, finds nothing, and stays at the top. Once
  // mounted, do it here. Same-page clicks are left to the browser.
  useEffect(() => {
    const id = window.location.hash.slice(1);
    if (!id) return;
    const target = document.getElementById(id);
    if (target) target.scrollIntoView({ behavior: 'instant', block: 'start' });
  }, []);

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
