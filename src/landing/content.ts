// The landing's copy, as data.
//
// This is the actual point of moving the page off hand-written HTML: the
// sections are lists now, so a row is added by adding an entry, not by cloning
// a block of markup and hoping every class came along. The wording is carried
// over verbatim from public/hero.html — the move is supposed to be invisible.
//
// Two-tone headings (`lead` + `rest`) are not a styling whim: hero.css renders
// <b> in full ink and <span> in the mist tone, and every one of these headings
// is written to read as a claim followed by its qualifier.

export interface TwoToneHeading {
  /** rendered as <b> — full ink */
  lead: string;
  /** rendered as <span> — mist tone, one line each */
  rest: string[];
}

export const NAV_LINKS = [
  { href: '#why', label: 'Why OTC' },
  { href: '#how', label: 'How it works' },
  { href: '#security', label: 'Security' },
] as const;

export const HERO = {
  pill: {
    marks: ['XLM', 'USDC'],
    strong: 'XLM / USDC',
    rest: ' · live on Stellar Testnet',
  },
  heading: {
    lead: 'Move institutional',
    rest: ['size. Keep the price', 'you agreed on.'],
  } satisfies TwoToneHeading,
  ctas: {
    primary: 'Open the desk',
    secondary: { label: 'See how it works', href: '#how' },
  },
} as const;

/** The hero's signature element: one deal, as three signed tickets. */
export const DEAL_TICKETS = [
  {
    variant: 'send',
    delay: '120ms',
    label: 'Send leg · maker',
    value: 'GAM3…X4F2',
    asset: 'XLM',
    bandLabel: 'Amount',
    bandValue: '250,000.0000000',
    maskLabel: 'Signature',
  },
  {
    variant: 'recv',
    delay: '200ms',
    label: 'Receive leg · taker',
    value: 'GBT7…K9Q1',
    asset: 'USDC',
    bandLabel: 'Amount',
    bandValue: '62,500.0000000',
    maskLabel: 'Signature',
  },
  {
    variant: 'fill',
    delay: '280ms',
    label: 'Settlement · expiry',
    value: '2026-07-08T18:00Z',
    asset: 'fill()',
    bandLabel: 'Both legs',
    bandValue: 'ONE TX',
    maskLabel: 'Nonce',
  },
] as const;

export type DealTicket = (typeof DEAL_TICKETS)[number];

export const DEAL_CHIPS = [
  { variant: 'signed', delay: '320ms', label: 'Both wallets signed' },
  { variant: 'atomic', delay: '400ms', label: 'Atomic settlement' },
] as const;

export type DealChip = (typeof DEAL_CHIPS)[number];

/** The problem section's ladder.
 *  `width` is the bar's share of the track, not the percentage it reports.
 *  The numeric twins (pctValue, lossValue) exist so the figures can count up
 *  on arrival — the string is what a reader sees, the number is what animates.
 */
export const LADDER = {
  title: 'What it costs to move the block',
  axis: { from: '0%', to: '60%' },
  rungs: [
    { size: '$250K', width: '17%', pct: '~10%', pctValue: 10, loss: '~$25K lost', lossValue: 25, lossUnit: 'K' },
    { size: '$1M', width: '50%', pct: '~30%', pctValue: 30, loss: '~$300K lost', lossValue: 300, lossUnit: 'K' },
    { size: '$2M', width: '67%', pct: '~40%', pctValue: 40, loss: '~$800K lost', lossValue: 800, lossUnit: 'K' },
  ],
} as const;

export type Rung = (typeof LADDER)['rungs'][number];

/** The hero's ticket, shown as the desk would fill it. Not interactive — it is
 *  a picture of the product, and the product is one click away. */
export const HERO_TICKET = {
  send: { label: 'You send', amount: '250,000', token: 'XLM' },
  receive: { label: 'You receive', amount: '62,500', token: 'USDC' },
  footnote: 'Signed by both wallets · settles in one transaction',
} as const;

export const SOLUTION = [
  {
    num: '01',
    title: 'Zero slippage',
    body: 'Stellar DEX pools are too shallow to absorb institutional size without punishing the price. On the desk, the number you sign is the number that settles.',
  },
  {
    num: '02',
    title: 'No intent leak',
    body: 'Order books broadcast intent to the whole network. Directed orders on TrustRFQ are visible only to the counterparty you addressed. Front-running has nowhere to run.',
  },
  {
    num: '03',
    title: 'Atomic settlement',
    body: 'No CEX, no off-chain escrow, no capital leaving Stellar. Both legs of the trade move in a single Soroban transaction, or neither does.',
  },
] as const;

export const STEPS = [
  {
    num: '01',
    delay: undefined,
    title: 'Agree & sign',
    body: 'You agree terms with your counterparty and create a directed order — amounts, tokens, expiry, their address. Your wallet signs the exact payload.',
  },
  {
    num: '02',
    delay: '90ms',
    title: 'Counter-sign',
    body: 'The order appears live on their desk. They accept, and each wallet signs a Soroban authorization binding every argument of the fill — amounts included.',
  },
  {
    num: '03',
    delay: '180ms',
    title: 'Atomic fill',
    body: 'Anyone can submit the fill carrying both signatures. Both legs move in one transaction — or nothing moves at all.',
  },
] as const;

export const GUARANTEES = [
  { name: 'Non-custodial', desc: "Funds never leave the signer's wallet until the atomic fill lands." },
  { name: 'Soroban-enforced', desc: 'The contract validates every argument against both signatures.' },
  { name: 'Signature-bound', desc: 'Amounts, addresses and expiry are cryptographically locked to the order.' },
  { name: 'Testnet MVP', desc: 'Running today on Stellar Testnet. Mainnet after a full external audit.' },
] as const;

export const HEADINGS = {
  problem: {
    eyebrow: 'The problem',
    // 44ms/char rather than the length-derived default: this sentence is typed
    // at reading pace on purpose, and hero.css's --lp-lead-in is set to clear it.
    title: "On-chain liquidity can't move institutional size",
    typeSpeed: 44,
  },
  solution: { eyebrow: 'The solution', title: 'OTC Desk' },
  how: {
    eyebrow: 'How it works',
    title: { lead: 'From agreement to atomic swap,', rest: ['in three steps.'] } satisfies TwoToneHeading,
  },
  security: {
    eyebrow: 'Security',
    title: { lead: 'Built for size.', rest: ['Verified by the chain.'] } satisfies TwoToneHeading,
  },
} as const;

export const CTA = {
  title: 'The desk is open.',
  sub: 'Connect a Testnet wallet and settle your first atomic block trade in minutes.',
  button: 'Open the desk',
} as const;

export const FOOTER = {
  tagline: 'Peer-to-peer OTC on Stellar.',
  fine: 'Built on Stellar · Soroban settlement · Testnet MVP — no real funds involved.',
} as const;
