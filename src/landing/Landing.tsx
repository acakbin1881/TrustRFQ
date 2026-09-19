// The landing.
//
// The background is FLAT. A grid, a grain layer and a cursor-tracking light
// were all tried and all removed — they decorated the page instead of
// distinguishing it, and a glow that follows the mouse is the single most
// template-looking move a dark landing can make. What separates this page is
// the layout, the sequencing, and what the sections actually say:
//
//   hero        the product itself, filled in, at the centre
//   ticker      a rhythm beat between two dense sections
//   problem     the cost of the status quo, counted up as you arrive
//   difference  order book vs desk, claim by claim, no straw man
//   mechanism   three steps, driven by the reader, not by a scroll position
//   evidence    a recorded on-chain run with resolvable hashes
//   security    the guarantees, as a spec grid
//   questions   what a counterparty asks before sending size
//
// The evidence section is the one no template can carry: the figures come from
// docs/evidence/live-rfq-run.json, a real two-direction run on Testnet.

import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import {
  Anchor, ArrowDown, ArrowRight, ArrowLeftRight, CheckCheck, Cpu, ExternalLink,
  EyeOff, Fingerprint, FlaskConical, Minus, PenLine, Plus, Wallet, Zap,
  type LucideIcon,
} from 'lucide-react';
import { deskPath } from '../routes/sections';
import {
  COMPARISON, CTA, FAQ, FOOTER, GUARANTEES, HEADINGS, HERO, HERO_TICKET, LADDER,
  NAV_LINKS, PROOF, SOLUTION, STEPS, TICKER,
  type IconKey, type ProofRun, type Rung, type TwoToneHeading,
} from './content';
import { useCarbonCanvas, useCountUp, useReveal, useScrolled } from './motion';

const DESK = deskPath('create');
const EXPLORER = 'https://stellar.expert/explorer/testnet/tx/';

/** Stagger helper: every reveal reads its own delay off --tr-delay. */
const delay = (ms: number) => ({ '--tr-delay': `${ms}ms` }) as React.CSSProperties;

/** Icon keys live in content.ts as plain strings; this is where they become
 *  components. Lucide at 1.5 stroke — thinner than the default, so they sit
 *  beside Space Grotesk rather than shouting over it. */
const ICONS: Record<IconKey, LucideIcon> = {
  anchor: Anchor, hidden: EyeOff, atomic: Zap,
  sign: PenLine, countersign: CheckCheck, fill: ArrowLeftRight,
  wallet: Wallet, contract: Cpu, signature: Fingerprint, testnet: FlaskConical,
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

/** A label that swaps for a second one on hover: the first leaves upward, the
 *  second arrives from below. Both stay in the DOM inside a clipped box sized
 *  by the first, so the button never changes width under the cursor. */
function SwapLabel({ idle, hover }: { idle: string; hover: string }) {
  return (
    <span className="relative grid overflow-hidden">
      <span className="col-start-1 row-start-1 transition-transform duration-500 ease-glide
        group-hover:-translate-y-[130%]">{idle}</span>
      <span aria-hidden="true" className="col-start-1 row-start-1 translate-y-[130%]
        transition-transform duration-500 ease-glide group-hover:translate-y-0">{hover}</span>
    </span>
  );
}

function LimeButton({ to, idle, hover, className = '' }: {
  to: string; idle: string; hover: string; className?: string;
}) {
  return (
    <Link to={to}
      className={`group inline-flex items-center gap-2.5 rounded-pill bg-lime px-6 py-3
        font-grotesk text-[15px] font-semibold text-carbon transition-colors duration-500
        ease-glide hover:bg-lime-soft ${className}`}>
      <SwapLabel idle={idle} hover={hover} />
      <ArrowRight className="size-4 transition-transform duration-500 ease-glide
        group-hover:translate-x-1" strokeWidth={2} aria-hidden="true" />
    </Link>
  );
}

/** The primary action with its network badge riding on it. Testnet qualifies
 *  the ACTION, so it belongs on the button rather than beside the nav links,
 *  where it read as a third navigation item. */
function DeskAction() {
  return (
    <span className="relative inline-block">
      <span className="pointer-events-none absolute -top-2 right-3 z-10 flex items-center gap-1
        rounded-pill border border-carbon-line bg-carbon px-2 py-[3px] font-grotesk text-[10px]
        font-medium uppercase tracking-[0.12em] text-lime">
        <span className="size-1 rounded-full bg-lime" aria-hidden="true" />
        Testnet
      </span>
      <LimeButton to={DESK} idle="Open the desk" hover="Start trading" />
    </span>
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

function Section({ id, children, className = '' }: {
  id?: string; children: React.ReactNode; className?: string;
}) {
  return (
    <section id={id} className={`px-6 py-24 md:py-32 ${className}`}>
      <div className="mx-auto max-w-6xl">{children}</div>
    </section>
  );
}

const headingClass =
  'font-grotesk text-[clamp(1.9rem,3.6vw,2.9rem)] font-medium leading-[1.1] tracking-[-0.025em]';

/* ----------------------------------------------------------------- chrome */

function Nav() {
  const scrolled = useScrolled();
  return (
    <div className="fixed inset-x-0 top-0 z-50 flex justify-center px-4 pt-3">
      <header className={`flex w-full items-center gap-6 rounded-pill px-4 py-2.5
        transition-all duration-700 ease-glide
        ${scrolled
          ? 'max-w-5xl border border-carbon-line bg-carbon/75 backdrop-blur-2xl'
          : 'max-w-6xl border border-transparent bg-transparent'}`}>
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

        <div className="ml-auto"><DeskAction /></div>
      </header>
    </div>
  );
}

/* ------------------------------------------------------------------- hero */

function TicketPreview() {
  const leg = (l: { label: string; amount: string; token: string }, tone: string) => (
    <div className="rounded-well bg-carbon-deep/70 p-5 text-left">
      <div className="font-grotesk text-[13px] text-slate">{l.label}</div>
      <div className="mt-2 flex items-baseline justify-between gap-4">
        <span className={`font-grotesk text-[30px] font-medium tabular-nums tracking-tight ${tone}`}>
          {l.amount}
        </span>
        <span className="rounded-pill border border-carbon-line bg-carbon-card px-3 py-1.5
          font-grotesk text-[14px] font-medium text-snow">{l.token}</span>
      </div>
    </div>
  );

  return (
    <div className="relative mx-auto w-full max-w-[420px]">
      <div className="rounded-card border border-carbon-line bg-carbon-card/60 p-2.5">
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

        <Link to={DESK} className="group mt-1.5 flex items-center justify-center gap-2.5
          rounded-well bg-lime py-4 font-grotesk text-[15px] font-semibold text-carbon
          transition-colors duration-500 ease-glide hover:bg-lime-soft">
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
  return (
    <section className="px-6 pb-20 pt-36 md:pt-44">
      <div className="mx-auto max-w-3xl text-center">
        <div className="tr-reveal inline-block" style={delay(0)}>
          <span className="inline-flex items-center gap-2.5 rounded-pill border border-carbon-line
            bg-carbon-card/50 px-4 py-2 font-grotesk text-[13px] text-ash">
            <span className="size-1.5 rounded-full bg-lime" aria-hidden="true" />
            <strong className="font-medium text-snow">{HERO.pill.strong}</strong>
            {HERO.pill.rest}
          </span>
        </div>

        <h1 className="tr-reveal mt-7 font-grotesk text-[clamp(2.5rem,6vw,4.25rem)] font-medium
          leading-[1.04] tracking-[-0.03em]" style={delay(80)}>
          <TwoTone heading={HERO.heading} />
        </h1>

        <div className="tr-reveal mt-10" style={delay(160)}><TicketPreview /></div>
      </div>
    </section>
  );
}

/** The claim strip. Two identical runs slide as one track; the loop closes on
 *  a seam you cannot see. Hovering pauses it — a reader who stops to read
 *  should not have the words walk away. */
function Ticker() {
  const run = (key: string) => (
    <ul key={key} className="flex shrink-0 items-center" aria-hidden={key === 'b'}>
      {TICKER.map((claim) => (
        <li key={claim} className="flex items-center gap-8 whitespace-nowrap px-8
          font-grotesk text-[14px] uppercase tracking-[0.14em] text-slate">
          {claim}
          <span className="size-1 rounded-full bg-lime/50" aria-hidden="true" />
        </li>
      ))}
    </ul>
  );

  return (
    <div className="tr-marquee relative overflow-hidden border-y border-carbon-line py-5">
      <div className="tr-marquee-track flex w-max">{run('a')}{run('b')}</div>
      {/* the strip has to dissolve at both edges, or the loop reads as a belt */}
      <div className="pointer-events-none absolute inset-y-0 left-0 w-32 bg-gradient-to-r
        from-carbon to-transparent" aria-hidden="true" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-32 bg-gradient-to-l
        from-carbon to-transparent" aria-hidden="true" />
    </div>
  );
}

/* --------------------------------------------------------------- problem */

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
          className="font-grotesk text-[15px] tabular-nums text-ash">~{Math.round(pct.value)}%</span>
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
          <h2 className={`tr-reveal mt-6 text-snow ${headingClass}`} style={delay(60)}>{h.title}</h2>
          <p className="tr-reveal mt-6 max-w-md font-grotesk text-[16px] leading-relaxed text-ash"
            style={delay(120)}>
            Those are pool prices, and the pools are <span className="text-snow">structurally
            shallow</span>. At block size an order moves the very price it is quoted against, so the
            slippage is not a fee you pay once. It is a price change you cause. Past a certain size,
            clearing a block on a DEX is not expensive — it is{' '}
            <span className="text-snow">arithmetically impossible</span>.
          </p>
        </div>

        <figure className="tr-reveal rounded-card border border-carbon-line bg-carbon-card/50 p-7"
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

/* ------------------------------------------------------------ difference */

/** Order book vs desk, claim by claim.
 *
 *  One table, two columns, a shared row label. The left column is deliberately
 *  not a straw man — every line is true of an order book working correctly,
 *  which is the argument: the mechanism is the problem, not a bad build of it.
 *  On a phone the columns stack under their row label rather than shrinking,
 *  because two 40%-width paragraphs are unreadable. */
function Difference() {
  return (
    <Section>
      <div className="tr-reveal"><Eyebrow>{COMPARISON.eyebrow}</Eyebrow></div>
      <h2 className={`tr-reveal mt-6 ${headingClass}`} style={delay(60)}>
        <TwoTone heading={COMPARISON.heading} />
      </h2>

      <div className="tr-reveal mt-12 overflow-hidden rounded-card border border-carbon-line"
        style={delay(120)}>
        {/* column heads — hidden on phones, where each cell is labelled instead */}
        <div className="hidden grid-cols-2 border-b border-carbon-line md:grid">
          {[COMPARISON.left, COMPARISON.right].map((col, i) => (
            <div key={col.label}
              className={`p-6 ${i === 1 ? 'border-l border-carbon-line bg-carbon-card/40' : ''}`}>
              <div className={`font-grotesk text-[16px] font-medium
                ${i === 1 ? 'text-lime' : 'text-ash'}`}>{col.label}</div>
              <div className="mt-1 font-grotesk text-[13px] text-slate">{col.note}</div>
            </div>
          ))}
        </div>

        {COMPARISON.rows.map((row, i) => (
          <div key={row.topic}
            className={`grid md:grid-cols-2 ${i > 0 ? 'border-t border-carbon-line' : ''}`}>
            <div className="p-6 md:pr-10">
              <div className="font-grotesk text-[12px] uppercase tracking-[0.14em] text-slate">
                {row.topic}
              </div>
              <p className="mt-3 font-grotesk text-[15px] leading-relaxed text-ash">{row.left}</p>
            </div>
            <div className="border-t border-carbon-line bg-carbon-card/40 p-6
              md:border-l md:border-t-0">
              <div className="font-grotesk text-[12px] uppercase tracking-[0.14em] text-lime
                md:invisible" aria-hidden="true">{row.topic}</div>
              <p className="mt-3 font-grotesk text-[15px] leading-relaxed text-snow md:mt-0">
                {row.right}
              </p>
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------- mechanism */

/** Three steps, advanced by the reader.
 *
 *  Deliberately not scroll-driven: a scroll-hijacked sequence takes the page
 *  away from whoever is reading it, and on a trackpad it is nearly impossible
 *  to land on the step you wanted. Tabs let someone re-read step two without
 *  scrolling back up, and they degrade to plain buttons with no JS timing.
 */
function Mechanism() {
  const h = HEADINGS.how;
  const [active, setActive] = useState(0);
  const step = STEPS[active];

  return (
    <Section id="how">
      <div className="tr-reveal"><Eyebrow>{h.eyebrow}</Eyebrow></div>
      <h2 className={`tr-reveal mt-6 max-w-3xl ${headingClass}`} style={delay(60)}>
        <TwoTone heading={h.title} />
      </h2>

      <div className="tr-reveal mt-12 grid gap-4 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]"
        style={delay(120)}>
        {/* the rail: one row per step, the active one carries the accent */}
        <div role="tablist" aria-label="How it works" className="flex flex-col gap-2">
          {STEPS.map((s, i) => {
            const on = i === active;
            return (
              <button key={s.num} type="button" role="tab" aria-selected={on}
                onClick={() => setActive(i)}
                className={`group flex items-center gap-4 rounded-card border p-5 text-left
                  transition-all duration-500 ease-glide
                  ${on
                    ? 'border-lime/30 bg-carbon-card'
                    : 'border-carbon-line bg-carbon-card/30 hover:bg-carbon-card/60'}`}>
                <span className={`flex size-11 shrink-0 items-center justify-center rounded-well
                  border transition-colors duration-500 ease-glide
                  ${on ? 'border-lime/40 text-lime' : 'border-carbon-line text-slate'}`}>
                  <Icon name={s.icon} />
                </span>
                <span className="min-w-0">
                  <span className={`block font-grotesk text-[16px] font-medium transition-colors
                    duration-500 ease-glide ${on ? 'text-snow' : 'text-ash'}`}>{s.title}</span>
                  <span className="mt-0.5 block font-grotesk text-[13px] tabular-nums text-slate">
                    Step {s.num}
                  </span>
                </span>
                <ArrowRight className={`ml-auto size-4 shrink-0 transition-all duration-500
                  ease-glide ${on ? 'text-lime' : 'text-slate/0 group-hover:text-slate'}`}
                  strokeWidth={1.5} aria-hidden="true" />
              </button>
            );
          })}
        </div>

        {/* the panel. keyed on the step so React remounts it and the copy
            fades in with the change instead of swapping in place */}
        <div className="rounded-card border border-carbon-line bg-carbon-card/50 p-8 md:p-10">
          <div key={step.num} className="animate-[tr-panel_600ms_var(--ease-glide)]">
            <div className="flex items-center gap-3">
              <span className="font-grotesk text-[13px] tabular-nums text-lime">{step.num}</span>
              <span className="h-px flex-1 bg-carbon-line" aria-hidden="true" />
              <span className="font-grotesk text-[12px] uppercase tracking-[0.14em] text-slate">
                {active + 1} / {STEPS.length}
              </span>
            </div>
            <h3 className="mt-7 font-grotesk text-[24px] font-medium tracking-[-0.015em] text-snow">
              {step.title}
            </h3>
            <p className="mt-4 max-w-lg font-grotesk text-[16px] leading-relaxed text-ash">
              {step.body}
            </p>
          </div>
        </div>
      </div>
    </Section>
  );
}

/* -------------------------------------------------------------- evidence */

function ProofStat({ stat, index }: {
  stat: (typeof PROOF)['stats'][number]; index: number;
}) {
  const n = useCountUp(stat.value);
  const decimals = stat.value % 1 === 0 ? 0 : 1;

  return (
    <div className="tr-reveal" style={delay(index * 80)}>
      <div ref={n.ref as React.Ref<HTMLDivElement>}
        className="font-grotesk text-[clamp(1.75rem,3vw,2.25rem)] font-medium tabular-nums
          tracking-tight text-lime">
        {n.value.toFixed(decimals)}{stat.unit}
      </div>
      <div className="mt-2 font-grotesk text-[14px] text-snow">{stat.label}</div>
      <div className="mt-1 font-grotesk text-[13px] text-slate">{stat.note}</div>
    </div>
  );
}

/** The transaction hash, in full on desktop and truncated on a phone.
 *  It links out to a public explorer: a hash nobody can resolve is decoration,
 *  and the whole point of this section is that these are checkable. */
function RunRow({ run }: { run: ProofRun }) {
  return (
    <div className="flex flex-col gap-3 border-t border-carbon-line py-5 sm:flex-row
      sm:items-center sm:gap-6">
      <div className="flex min-w-0 items-center gap-3">
        <span className="font-grotesk text-[15px] font-medium text-snow">{run.pair}</span>
        <span className="font-grotesk text-[13px] text-slate">{run.sold} → {run.received}</span>
      </div>

      <div className="flex items-center gap-4 sm:ml-auto">
        <span className="font-grotesk text-[13px] tabular-nums text-ash">
          {(run.ms / 1000).toFixed(2)}s
        </span>
        <a href={`${EXPLORER}${run.tx}`} target="_blank" rel="noreferrer noopener"
          className="group inline-flex items-center gap-2 rounded-pill border border-carbon-line
            px-3 py-1.5 font-mono text-[12px] text-slate transition-colors duration-500
            ease-glide hover:border-lime/30 hover:text-lime">
          <span className="hidden lg:inline">{run.tx.slice(0, 18)}…{run.tx.slice(-6)}</span>
          <span className="lg:hidden">{run.tx.slice(0, 8)}…</span>
          <ExternalLink className="size-3.5" strokeWidth={1.5} aria-hidden="true" />
        </a>
      </div>
    </div>
  );
}

function Evidence() {
  return (
    <Section id="evidence">
      <div className="grid gap-14 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-20">
        <div>
          <div className="tr-reveal"><Eyebrow>{PROOF.eyebrow}</Eyebrow></div>
          <h2 className={`tr-reveal mt-6 ${headingClass}`} style={delay(60)}>
            <TwoTone heading={PROOF.heading} />
          </h2>
          <p className="tr-reveal mt-6 max-w-md font-grotesk text-[16px] leading-relaxed text-ash"
            style={delay(120)}>
            {PROOF.body}
          </p>
          <p className="tr-reveal mt-6 font-grotesk text-[13px] text-slate" style={delay(160)}>
            Recorded {PROOF.recordedAt} · Stellar Testnet
          </p>
        </div>

        <div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-8">
            {PROOF.stats.map((s, i) => <ProofStat key={s.label} stat={s} index={i} />)}
          </div>

          <div className="tr-reveal mt-10 rounded-card border border-carbon-line
            bg-carbon-card/50 px-6 pb-1 pt-2" style={delay(200)}>
            {PROOF.runs.map((r) => <RunRow key={r.tx} run={r} />)}
          </div>
        </div>
      </div>
    </Section>
  );
}

/* --------------------------------------------------------------- the rest */

function Solution() {
  const h = HEADINGS.solution;
  return (
    <Section>
      <div className="tr-reveal"><Eyebrow>{h.eyebrow}</Eyebrow></div>
      <h2 className={`tr-reveal mt-6 text-snow ${headingClass}`} style={delay(60)}>{h.title}</h2>

      <div className="mt-12 grid gap-4 md:grid-cols-3">
        {SOLUTION.map((c, i) => (
          <div key={c.num} style={delay(120 + i * 90)}
            className="tr-reveal group rounded-card border border-carbon-line bg-carbon-card/50 p-7
              transition-colors duration-700 ease-glide hover:bg-carbon-hi/70">
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
          </div>
        ))}
      </div>
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
          <h2 className={`tr-reveal mt-6 ${headingClass}`} style={delay(60)}>
            <TwoTone heading={h.title} />
          </h2>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {GUARANTEES.map((g, i) => (
            <div key={g.name} style={delay(100 + i * 70)}
              className="tr-reveal rounded-card border border-carbon-line bg-carbon-card/50 p-6
                transition-colors duration-700 ease-glide hover:bg-carbon-hi/70">
              <div className="flex items-start gap-3.5">
                <span className="mt-0.5 text-lime"><Icon name={g.icon} className="size-[18px]" /></span>
                <div>
                  <h3 className="font-grotesk text-[16px] font-medium text-snow">{g.name}</h3>
                  <p className="mt-2 font-grotesk text-[14px] leading-relaxed text-ash">{g.desc}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Section>
  );
}

/** One open answer at a time. Height animates through grid-template-rows (see
 *  theme.css) rather than max-height, so a long answer is never clipped and a
 *  short one leaves no dead space. */
function Questions() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <Section id="faq">
      <div className="mx-auto max-w-3xl">
        <div className="tr-reveal"><Eyebrow>{FAQ.eyebrow}</Eyebrow></div>
        <h2 className={`tr-reveal mt-6 ${headingClass}`} style={delay(60)}>
          <TwoTone heading={FAQ.heading} />
        </h2>

        <div className="tr-reveal mt-10 border-t border-carbon-line" style={delay(120)}>
          {FAQ.items.map((item, i) => {
            const on = open === i;
            return (
              <div key={item.q} className="border-b border-carbon-line">
                <button type="button" aria-expanded={on}
                  onClick={() => setOpen(on ? null : i)}
                  className="group flex w-full items-start gap-5 py-6 text-left">
                  <span className={`mt-0.5 font-grotesk text-[17px] font-medium transition-colors
                    duration-500 ease-glide ${on ? 'text-lime' : 'text-snow group-hover:text-ash'}`}>
                    {item.q}
                  </span>
                  <span className={`ml-auto mt-0.5 flex size-7 shrink-0 items-center justify-center
                    rounded-full border transition-colors duration-500 ease-glide
                    ${on ? 'border-lime/40 text-lime' : 'border-carbon-line text-slate'}`}>
                    {on
                      ? <Minus className="size-3.5" strokeWidth={2} aria-hidden="true" />
                      : <Plus className="size-3.5" strokeWidth={2} aria-hidden="true" />}
                  </span>
                </button>

                <div className="tr-answer" data-open={on}>
                  <div>
                    <p className="max-w-2xl pb-7 pr-12 font-grotesk text-[15px] leading-relaxed text-ash">
                      {item.a}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Section>
  );
}

function CallToAction() {
  return (
    <Section>
      <div className="tr-reveal rounded-card border border-carbon-line bg-carbon-card/50 px-8
        py-16 text-center md:px-14">
        <h3 className="font-grotesk text-[clamp(1.7rem,3vw,2.4rem)] font-medium
          tracking-[-0.025em] text-snow">{CTA.title}</h3>
        <p className="mx-auto mt-4 max-w-md font-grotesk text-[16px] leading-relaxed text-ash">
          {CTA.sub}
        </p>
        <div className="mt-10 flex justify-center">
          {/* no Testnet badge here: the nav carries it, and the line above
              already says "Connect a Testnet wallet" */}
          <LimeButton to={DESK} idle={CTA.button} hover="Connect a wallet" />
        </div>
      </div>
    </Section>
  );
}

function Footer() {
  const links = [...NAV_LINKS, { href: '#evidence', label: 'Evidence' }, { href: '#faq', label: 'Questions' }];
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
          {links.map((l) => (
            <a key={l.href} href={l.href}
              className="text-ash transition-colors duration-500 ease-glide hover:text-lime">
              {l.label}
            </a>
          ))}
        </nav>
      </div>

      <div className="mx-auto mt-12 max-w-6xl border-t border-carbon-line pt-7 font-grotesk
        text-[13px] text-slate">{FOOTER.fine}</div>
    </footer>
  );
}

/* ------------------------------------------------------------------- page */

export default function Landing() {
  const scopeRef = useRef<HTMLDivElement>(null);
  useCarbonCanvas();
  useReveal(scopeRef);

  // A cold load of /#how cannot scroll itself: the browser looks for the
  // anchor before React has rendered it. Same-page clicks are the browser's.
  useEffect(() => {
    const id = window.location.hash.slice(1);
    if (!id) return;
    document.getElementById(id)?.scrollIntoView({ behavior: 'instant', block: 'start' });
  }, []);

  return (
    <div ref={scopeRef} className="min-h-screen bg-carbon font-grotesk antialiased">
      <Nav />
      <Hero />
      <Ticker />
      <main>
        <Problem />
        <Difference />
        <Solution />
        <Mechanism />
        <Evidence />
        <Security />
        <Questions />
        <CallToAction />
      </main>
      <Footer />
    </div>
  );
}
