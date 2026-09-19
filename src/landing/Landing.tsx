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
  Anchor, ArrowDown, ArrowRight, ArrowLeftRight, BadgeCheck, CheckCheck, Cpu,
  ExternalLink, EyeOff, Fingerprint, FlaskConical, Minus, MousePointer2, PenLine,
  Plus, ShieldCheck, TrendingDown, Wallet, Zap,
  type LucideIcon,
} from 'lucide-react';
// The real marks — Stellar's and Circle's own SVGs (@web3icons/react, MIT).
// Never redraw these: a desk that approximates the asset it settles in reads
// as a mockup of itself.
import { NetworkStellar, TokenUSDC, TokenXLM } from '@web3icons/react';
import { BrandMark } from '../brand/mark';
import { deskPath } from '../routes/sections';
import {
  COMPARISON, CTA, FAQ, FOOTER, GUARANTEES, HEADINGS, HERO, HERO_TICKET, LADDER,
  NAV_LINKS, PROOF, SOLUTION, STEPS,
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
  slippage: TrendingDown, shield: ShieldCheck,
};

function Icon({ name, className = 'size-5' }: { name: IconKey; className?: string }) {
  const Glyph = ICONS[name];
  return <Glyph className={className} strokeWidth={1.5} aria-hidden="true" />;
}

/* ------------------------------------------------------------------ atoms */

/** A label that swaps for a second one on hover: the first leaves upward, the
 *  second arrives from below. Both stay in the DOM inside a clipped box sized
 *  by the first, so the button never changes width under the cursor. */
function SwapLabel({ idle, hover }: { idle: string; hover: string }) {
  return (
    <span className="relative grid overflow-hidden whitespace-nowrap">
      <span className="col-start-1 row-start-1 transition-transform duration-500 ease-glide
        group-hover:-translate-y-[130%]">{idle}</span>
      <span aria-hidden="true" className="col-start-1 row-start-1 translate-y-[130%]
        transition-transform duration-500 ease-glide group-hover:translate-y-0">{hover}</span>
    </span>
  );
}

/** SwapLabel's glyph twin. The section's own icon leaves upward and an arrow
 *  arrives from below, so a nav item says WHAT at rest and WHERE under the
 *  cursor. The word itself never moves: swapping the LABEL the way the button
 *  does would take the link's name away at the exact moment you are pointing
 *  at it. The box is sized and clipped, so neither glyph can reflow the row.
 *
 *  GATED AT lg, AND IT HAS TO BE. The glyph costs ~20px a link, and the bar has
 *  no such room at md: the three labels and the button all wrapped to two lines
 *  and the pill doubled in height. Between md and lg the nav is text-only,
 *  exactly as it was before the glyph existed. */
function SwapGlyph({ name }: { name: IconKey }) {
  return (
    <span className="relative hidden size-4 overflow-hidden lg:grid">
      <Icon name={name} className="col-start-1 row-start-1 size-4 transition-transform
        duration-500 ease-glide group-hover:-translate-y-[130%]" />
      <ArrowDown className="col-start-1 row-start-1 size-4 translate-y-[130%] transition-transform
        duration-500 ease-glide group-hover:translate-y-0" strokeWidth={1.5} aria-hidden="true" />
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
          <BrandMark className="text-lime" />
          TrustRFQ
        </Link>

        <nav className="ml-4 hidden items-center gap-1 md:flex">
          {NAV_LINKS.map((l) => (
            <a key={l.href} href={l.href}
              className="group flex items-center gap-2 whitespace-nowrap rounded-pill px-3.5
                py-2 font-grotesk text-[14px] text-ash transition-colors duration-500
                ease-glide hover:bg-carbon-hi hover:text-snow">
              <SwapGlyph name={l.icon} />
              {l.label}
            </a>
          ))}
        </nav>

        <div className="ml-auto"><LimeButton to={DESK} idle="Open the desk" hover="Start trading" /></div>
      </header>
    </div>
  );
}

/* ------------------------------------------------------------------- hero */

/**
 * The objects around the hero, on three depth planes.
 *
 * Depth is the whole trick. Four discs at one size, evenly spaced around the
 * headline, read as decoration stuck to the corners. Give them distance —
 * near ones large, sharp and opaque; far ones small, blurred and dim, drifting
 * more slowly — and they read as a field the headline sits inside. That is
 * lens behaviour, so the eye accepts it without being told.
 *
 * `near` also drifts fastest. Parallax: things close to you move more.
 */
type Depth = 'near' | 'mid' | 'far';

const DEPTH: Record<Depth, {
  box: string; px: number; glyph: number; skin: string; dur: string;
}> = {
  near: { box: 'size-20', px: 80, glyph: 38, skin: 'opacity-100', dur: '15s' },
  mid: { box: 'size-14', px: 56, glyph: 26, skin: 'opacity-70 blur-[2px]', dur: '19s' },
  far: { box: 'size-11', px: 44, glyph: 20, skin: 'opacity-45 blur-[5px]', dur: '26s' },
};

/** A real mark on a carbon disc. The mark is Stellar's or Circle's own SVG and
 *  is never modified — the disc is ours, and it only frames. */
function TokenDisc({ mark, depth, accent = false }: {
  mark: 'xlm' | 'usdc' | 'stellar'; depth: Depth; accent?: boolean;
}) {
  const d = DEPTH[depth];
  const M = { xlm: TokenXLM, usdc: TokenUSDC, stellar: NetworkStellar }[mark];

  return (
    <span className={`flex ${d.box} items-center justify-center rounded-full border
      ${accent ? 'border-lime/25' : 'border-carbon-line'} bg-carbon-card/80 backdrop-blur-xl
      ${d.skin}`}>
      <M size={d.glyph} variant="mono" className={accent ? 'text-lime' : 'text-snow'} />
    </span>
  );
}

/** Our own mark among the assets — the one object here that is not a token.
 *  It gets NO disc: the mark is already a seal (src/brand/mark.tsx), and a seal
 *  inside a disc is a frame around a frame. Drawn at the disc diameter instead,
 *  so it sits on the same size rhythm as everything around it. */
function BrandDisc({ depth }: { depth: Depth }) {
  const d = DEPTH[depth];
  return <BrandMark size={d.px} className={`text-lime ${d.skin}`} />;
}

/**
 * The swap disc: XLM turns away, USDC arrives, on a real Y axis.
 *
 * A cross-fade would say "two pictures". A rotation says "the same coin, the
 * other side" — which is exactly the trade this desk settles. Each face rests
 * long enough to be read before it turns (the holds in tr-flip), so it reads
 * as an exchange rather than a spinner.
 */
function SwapDisc() {
  const face = `absolute inset-0 flex items-center justify-center rounded-full
    bg-carbon-card/80 backdrop-blur-xl tr-flip-face`;
  return (
    <span className="tr-flip-stage" aria-hidden="true">
      <span className="tr-flip-coin relative block size-24">
        <span className={`${face} border border-carbon-line`}>
          <TokenXLM size={44} variant="mono" className="text-snow" />
        </span>
        <span className={`${face} tr-flip-face--back border border-lime/30`}>
          <TokenUSDC size={44} variant="mono" className="text-lime" />
        </span>
      </span>
    </span>
  );
}

/**
 * Placement.
 *
 * Not four corners. The marks cluster in the two side margins the headline
 * leaves free (it is capped at max-w-3xl), each side holding one near object
 * and its smaller, blurrier companions — so the eye reads a group at a
 * distance rather than a ring of evenly spaced icons. Every x sits outside
 * ~23% on a 1440 viewport, which is where the text column starts.
 *
 * Hidden below lg: at that width these would either crowd the headline or sit
 * in a margin that no longer exists.
 */
const OBJECTS: { pos: string; depth: Depth; node: React.ReactNode; drift: React.CSSProperties }[] = [
  // left cluster — the near XLM anchors it, two quieter marks fall away behind
  { pos: 'left-[6%] top-[20%]', depth: 'near', node: <TokenDisc mark="xlm" depth="near" />,
    drift: { '--tr-dx': '12px', '--tr-dy': '-20px', '--tr-tilt': '-7deg' } as React.CSSProperties },
  { pos: 'left-[17%] top-[49%]', depth: 'mid', node: <TokenDisc mark="stellar" depth="mid" />,
    drift: { '--tr-dx': '-9px', '--tr-dy': '14px', '--tr-tilt': '9deg' } as React.CSSProperties },
  { pos: 'left-[3%] top-[68%]', depth: 'far', node: <BrandDisc depth="far" />,
    drift: { '--tr-dx': '10px', '--tr-dy': '10px', '--tr-tilt': '-4deg' } as React.CSSProperties },

  // right cluster — the turning coin is the loudest object on the page, so it
  // sits opposite the headline's first line rather than beside the ticket
  { pos: 'right-[7%] top-[15%]', depth: 'near', node: <SwapDisc />,
    drift: { '--tr-dx': '-14px', '--tr-dy': '18px', '--tr-tilt': '5deg' } as React.CSSProperties },
  { pos: 'right-[18%] top-[45%]', depth: 'mid', node: <TokenDisc mark="usdc" depth="mid" accent />,
    drift: { '--tr-dx': '11px', '--tr-dy': '-13px', '--tr-tilt': '-8deg' } as React.CSSProperties },
  { pos: 'right-[4%] top-[71%]', depth: 'far', node: <TokenDisc mark="xlm" depth="far" />,
    drift: { '--tr-dx': '-8px', '--tr-dy': '-11px', '--tr-tilt': '6deg' } as React.CSSProperties },
];

function HeroObjects() {
  return (
    <div className="pointer-events-none absolute inset-0 hidden lg:block" aria-hidden="true">
      {OBJECTS.map((o, i) => (
        <div key={o.pos} className={`absolute ${o.pos}`}>
          {/* settle in, then drift forever — two wrappers so the arrival is not
              interrupted by the loop, and the loop does not restart the arrival */}
          <div className="tr-settle" style={{ '--tr-lag': `${260 + i * 130}ms` } as React.CSSProperties}>
            <div className="tr-drift"
              style={{ ...o.drift, '--tr-dur': DEPTH[o.depth].dur, '--tr-lag': `${i * 1.4}s` } as React.CSSProperties}>
              {o.node}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function TicketPreview() {
  const leg = (l: { label: string; amount: string; token: string }, tone: string) => (
    <div className="rounded-well bg-carbon-deep/70 p-5 text-left">
      <div className="font-grotesk text-[13px] text-slate">{l.label}</div>
      <div className="mt-2 flex items-baseline justify-between gap-4">
        <span className={`font-grotesk text-[30px] font-medium tabular-nums tracking-tight ${tone}`}>
          {l.amount}
        </span>
        <span className="flex items-center gap-2 rounded-pill border border-carbon-line
          bg-carbon-card py-1.5 pl-1.5 pr-3.5 font-grotesk text-[14px] font-medium text-snow">
          <span className="flex size-6 items-center justify-center rounded-full bg-carbon-deep">
            {l.token === 'XLM'
              ? <TokenXLM size={14} variant="mono" className="text-snow" />
              : <TokenUSDC size={14} variant="mono" className="text-lime" />}
          </span>
          {l.token}
        </span>
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

/**
 * The coin that punctuates `price`.
 *
 * Sized in em, so it scales with the headline's clamp() instead of being
 * pinned to one viewport. `align-[-0.1em]` sits it on the optical baseline —
 * a circle centred on the true baseline reads as floating above the text.
 *
 * It is the hero disc's gesture at sentence scale: XLM out, USDC in. Same
 * idea, quieter, so the page has one notion of what a swap looks like.
 */
function MarkCoin() {
  const face = `absolute inset-0 flex items-center justify-center rounded-full
    bg-carbon-card tr-flip-face`;
  return (
    <span className="relative ml-[0.2em] inline-block align-[-0.1em]"
      style={{ width: '0.72em', height: '0.72em', perspective: '400px' }} aria-hidden="true">
      {/* idle outside, hover inside: both want `transform`, and on one element
          the animation would win outright and the hover would never render */}
      <span className="tr-idle-coin block size-full">
        <span className="tr-mark-coin relative block size-full">
          <span className={`${face} border border-carbon-line`}>
            <TokenXLM size={64} variant="mono" className="size-[58%] text-snow" />
          </span>
          <span className={`${face} tr-flip-face--back border border-lime/40`}>
            <TokenUSDC size={64} variant="mono" className="size-[58%] text-lime" />
          </span>
        </span>
      </span>
    </span>
  );
}

/**
 * A marked word and its gesture.
 *
 * Three ranks, and the ranking is the point (see HERO.marks):
 *
 *   coin    `price`  — lime rule + turning coin. The promise, so the loudest.
 *   cursor  `Move`   — a pointer that leads and a word that follows it a
 *                      shorter distance. Being dragged, which is the verb.
 *   seal    `agreed` — a check that settles from tilted and dim to square and
 *                      lit, the way a stamp lands.
 *
 * The hover target is always the WORD. The glyphs are well under 1em, which is
 * a hit area nobody finds on purpose; tabIndex and focus-visible give the same
 * gestures to the keyboard.
 */
function MarkedWord({ word, kind }: { word: string; kind: 'coin' | 'cursor' | 'seal' }) {
  const shell = `tr-mark relative inline-block cursor-default rounded-sm outline-none
    focus-visible:ring-2 focus-visible:ring-lime/40`;

  if (kind === 'coin') {
    return (
      <span tabIndex={0} className={shell}>
        <span className="text-snow">{word}</span>
        <MarkCoin />
        {/* the rule marks the promise; the coin is only its punctuation, so
            the rule stops at the word and does not run under the coin */}
        <span className="tr-mark-rule absolute -bottom-[0.06em] left-0 block h-[0.055em]
          rounded-pill bg-lime" style={{ width: 'calc(100% - 0.92em)' }} aria-hidden="true" />
      </span>
    );
  }

  if (kind === 'cursor') {
    return (
      <span tabIndex={0} className={`${shell} group/mark`}>
        <span className="tr-drag inline-block text-snow">{word}</span>
        <span className="tr-idle-cursor ml-[0.12em] inline-block align-[0.34em]">
          <MousePointer2
            className="tr-mark-cursor block size-[0.42em] fill-current text-slate
              group-hover/mark:text-lime"
            strokeWidth={1.5} aria-hidden="true" />
        </span>
      </span>
    );
  }

  return (
    <span tabIndex={0} className={`${shell} group/mark`}>
      {word}
      <span className="tr-idle-seal ml-[0.16em] inline-block align-[0.02em]">
        <BadgeCheck
          className="tr-mark-seal block size-[0.52em] text-slate group-hover/mark:text-lime"
          strokeWidth={1.5} aria-hidden="true" />
      </span>
    </span>
  );
}

/**
 * A headline line, with its marked word split out of it.
 *
 * The word is found by string match rather than stored pre-split, so the copy
 * in content.ts stays a readable sentence. One mark per line is all the design
 * asks for, so the first match wins and the rest of the line is left alone.
 */
function HeadlineLine({ text, tone }: { text: string; tone: string }) {
  const mark = HERO.marks.find((m) => text.includes(m.word));
  if (!mark) return <span className={tone}>{text}</span>;

  const at = text.indexOf(mark.word);
  return (
    <span className={tone}>
      {text.slice(0, at)}
      <MarkedWord word={mark.word} kind={mark.kind} />
      {text.slice(at + mark.word.length)}
    </span>
  );
}

/**
 * The hero headline, rising line by line out of its own masks.
 *
 * Line-level rather than word-level: at this size a word stagger reads as a
 * machine typing it out, while a line is the unit the sentence is written in,
 * so the reader receives a whole clause at a time.
 *
 * The mask needs room for descenders — the y and g in "you agreed on." sit
 * below the baseline and a plain overflow:hidden slices them. The padding
 * opens that room and the negative margin takes it back out of the layout, so
 * the line spacing is exactly what it was before the mask existed. The marked
 * word's rule lives in that same padding, which is why it is not clipped.
 *
 * This is deliberately NOT .tr-reveal: that one waits for an observer, and
 * this headline is above the fold on arrival. It animates on mount.
 */
function HeroHeadline() {
  const lines = [
    { text: HERO.heading.lead, tone: 'text-snow' },
    ...HERO.heading.rest.map((text) => ({ text, tone: 'text-ash' })),
  ];

  return (
    <h1 className="font-grotesk text-[clamp(2.5rem,6vw,4.25rem)] font-medium
      leading-[1.04] tracking-[-0.03em]">
      {lines.map((l, i) => (
        <span key={l.text} className="block -mb-[0.16em] overflow-hidden pb-[0.16em]">
          <span className="tr-line block"
            style={{ '--tr-lag': `${i * 130}ms` } as React.CSSProperties}>
            <HeadlineLine text={l.text} tone={l.tone} />
          </span>
        </span>
      ))}
    </h1>
  );
}

/** A trace running down a hairline. An arrow would tell you to scroll; a thing
 *  falling past the fold shows the page continuing, which is the same
 *  instruction without the imperative. It is a link, so it also works. */
function ScrollCue() {
  return (
    <a href="#why" aria-label="Skip to why OTC"
      className="group mx-auto mt-16 flex w-10 flex-col items-center gap-3">
      <span className="relative block h-12 w-px overflow-hidden bg-carbon-line">
        <span className="tr-trickle absolute inset-x-0 top-0 block h-4 bg-lime" aria-hidden="true" />
      </span>
      <span className="font-grotesk text-[11px] uppercase tracking-[0.18em] text-slate
        transition-colors duration-500 ease-glide group-hover:text-ash">
        Scroll
      </span>
    </a>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden px-6 pb-20 pt-36 md:pt-44">
      <HeroObjects />

      <div className="relative mx-auto max-w-3xl text-center">
        <HeroHeadline />

        {/* the ticket follows the last line out rather than arriving with it */}
        <div className="tr-reveal mt-11" style={delay(420)}><TicketPreview /></div>

        <ScrollCue />
      </div>
    </section>
  );
}

/* --------------------------------------------------------------- problem */

function LadderRow({ rung, index }: { rung: Rung; index: number }) {
  const pct = useCountUp(rung.pctValue);
  const loss = useCountUp(rung.lossValue);

  return (
    <div className="tr-reveal group -mx-3 grid grid-cols-[auto_1fr_auto] items-center gap-5
      rounded-well border-t border-carbon-line px-3 py-5 transition-colors duration-500
      ease-glide first:border-t-0 hover:bg-carbon-deep/40" style={delay(index * 90)}>
      <span className="w-16 font-grotesk text-[15px] font-medium text-snow">{rung.size}</span>
      <span className="relative h-1.5 overflow-hidden rounded-pill bg-carbon-deep">
        <span className="absolute inset-y-0 left-0 rounded-pill bg-lime/70 group-hover:bg-lime"
          style={{ width: rung.width, transition: 'width 1400ms var(--ease-glide), background-color 500ms var(--ease-glide)' }} />
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
            className={`group grid md:grid-cols-2 ${i > 0 ? 'border-t border-carbon-line' : ''}`}>
            {/* Both cells light together. You are reading left against right,
                and losing the row costs you the comparison — so the hover is
                navigation here, not decoration. */}
            <div className="p-6 transition-colors duration-500 ease-glide
              group-hover:bg-carbon-card/40 md:pr-10">
              <div className="font-grotesk text-[12px] uppercase tracking-[0.14em] text-slate
                transition-colors duration-500 ease-glide group-hover:text-ash">
                {row.topic}
              </div>
              <p className="mt-3 font-grotesk text-[15px] leading-relaxed text-ash">{row.left}</p>
            </div>
            <div className="relative border-t border-carbon-line bg-carbon-card/40 p-6
              transition-colors duration-500 ease-glide group-hover:bg-carbon-hi/60
              md:border-l md:border-t-0">
              {/* an accent edge on the answering side only */}
              <span className="tr-edge absolute inset-y-0 left-0 hidden w-px origin-top bg-lime/40
                md:block" aria-hidden="true" />
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
            className="tr-reveal group relative overflow-hidden rounded-card border
              border-carbon-line bg-carbon-card/50 p-7 transition-colors duration-700 ease-glide
              hover:border-lime/20 hover:bg-carbon-hi/70">
            {/* the card's version of the headline's rule: a hairline wiping in
                from the left and fading before the right edge, so it never
                reads as a border that was simply switched on */}
            <span className="tr-edge absolute inset-x-0 top-0 block h-px bg-gradient-to-r
              from-lime/70 via-lime/20 to-transparent" aria-hidden="true" />

            <div className="flex items-center justify-between">
              <span className="flex size-11 items-center justify-center rounded-well border
                border-carbon-line bg-carbon-deep/60 text-lime transition-colors duration-700
                ease-glide group-hover:border-lime/25 group-hover:bg-carbon-deep">
                <span className="tr-breathe block transition-transform duration-700 ease-glide
                  group-hover:scale-110">
                  <Icon name={c.icon} />
                </span>
              </span>
              <span className="font-grotesk text-[13px] tabular-nums text-slate transition-colors
                duration-700 ease-glide group-hover:text-lime">{c.num}</span>
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
              className="tr-reveal group rounded-card border border-carbon-line bg-carbon-card/50
                p-6 transition-colors duration-700 ease-glide hover:border-lime/15
                hover:bg-carbon-hi/70">
              {/* quieter than the solution cards: a guarantee is a fact, and a
                  fact does not need to perform when you look at it */}
              <div className="flex items-start gap-3.5">
                <span className="tr-breathe mt-0.5 block text-lime transition-transform
                  duration-700 ease-glide group-hover:scale-110">
                  <Icon name={g.icon} className="size-[18px]" />
                </span>
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
          {/* no Testnet badge on this button: the line above it already says
              "Connect a Testnet wallet", and the hero's ticket footnote names
              the network for anyone arriving at the top */}
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
            <BrandMark className="text-lime" />
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
