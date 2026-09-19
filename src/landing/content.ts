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
  heading: {
    lead: 'Move institutional',
    rest: ['size. Keep the price', 'you agreed on.'],
  } satisfies TwoToneHeading,
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
    icon: 'anchor',
    title: 'Zero slippage',
    body: 'Stellar DEX pools are too shallow to absorb institutional size without punishing the price. On the desk, the number you sign is the number that settles.',
  },
  {
    num: '02',
    icon: 'hidden',
    title: 'No intent leak',
    body: 'Order books broadcast intent to the whole network. Directed orders on TrustRFQ are visible only to the counterparty you addressed. Front-running has nowhere to run.',
  },
  {
    num: '03',
    icon: 'atomic',
    title: 'Atomic settlement',
    body: 'No CEX, no off-chain escrow, no capital leaving Stellar. Both legs of the trade move in a single Soroban transaction, or neither does.',
  },
] as const;

export const STEPS = [
  {
    num: '01',
    delay: undefined,
    icon: 'sign',
    title: 'Agree & sign',
    body: 'You agree terms with your counterparty and create a directed order — amounts, tokens, expiry, their address. Your wallet signs the exact payload.',
  },
  {
    num: '02',
    delay: '90ms',
    icon: 'countersign',
    title: 'Counter-sign',
    body: 'The order appears live on their desk. They accept, and each wallet signs a Soroban authorization binding every argument of the fill — amounts included.',
  },
  {
    num: '03',
    delay: '180ms',
    icon: 'fill',
    title: 'Atomic fill',
    body: 'Anyone can submit the fill carrying both signatures. Both legs move in one transaction — or nothing moves at all.',
  },
] as const;

export const GUARANTEES = [
  { icon: 'wallet', name: 'Non-custodial', desc: "Funds never leave the signer's wallet until the atomic fill lands." },
  { icon: 'contract', name: 'Soroban-enforced', desc: 'The contract validates every argument against both signatures.' },
  { icon: 'signature', name: 'Signature-bound', desc: 'Amounts, addresses and expiry are cryptographically locked to the order.' },
  { icon: 'testnet', name: 'Testnet MVP', desc: 'Running today on Stellar Testnet. Mainnet after a full external audit.' },
] as const;

/** Icon keys are names, not components: content.ts stays free of React so it
 *  can be read, diffed and reordered as plain data. Landing.tsx maps them. */
export type IconKey =
  | 'anchor' | 'hidden' | 'atomic'
  | 'sign' | 'countersign' | 'fill'
  | 'wallet' | 'contract' | 'signature' | 'testnet';

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

/* ==========================================================================
   Sections added in the differentiation pass
   ========================================================================== */

/** Order book vs desk, claim by claim. The left column is not a straw man —
 *  every line of it is true of an on-chain order book working correctly. That
 *  is the point: the mechanism is the problem, not an implementation of it. */
export const COMPARISON = {
  eyebrow: 'The difference',
  heading: { lead: 'Same chain.', rest: ['Opposite mechanism.'] } satisfies TwoToneHeading,
  left: { label: 'On-chain order book', note: 'Working exactly as designed' },
  right: { label: 'TrustRFQ desk', note: 'Peer-to-peer, settled on Soroban' },
  rows: [
    {
      topic: 'Price',
      left: 'Your order walks the book. The deeper it goes, the worse the average fill.',
      right: 'One price, agreed before anything is signed. It is the price that settles.',
    },
    {
      topic: 'Visibility',
      left: 'The order is public the moment it lands. Anyone can read your size.',
      right: 'A directed offer is visible to one counterparty. Nobody else sees it.',
    },
    {
      topic: 'Execution',
      left: 'Partial fills across several transactions, each at a different price.',
      right: 'Both legs move in one transaction, or neither does.',
    },
    {
      topic: 'Custody',
      left: 'Funds sit in the protocol while the order rests.',
      right: 'Funds never leave your wallet until the fill lands.',
    },
    {
      topic: 'Failure',
      left: 'A reverted leg can leave you holding half a trade.',
      right: 'An invalid fill has no valid signature. It cannot execute at all.',
    },
  ],
} as const;

/**
 * A recorded Testnet run, not a claim.
 *
 * Every figure here comes from docs/evidence/live-rfq-run.json, produced by
 * `npm run e2e:rfq:live` on 2026-09-14 — two real round trips through the RFQ
 * path, both settled on-chain. Update this block from that file, never by hand.
 */
export const PROOF = {
  eyebrow: 'Evidence',
  heading: { lead: 'Not a claim.', rest: ['A recorded run.'] } satisfies TwoToneHeading,
  body: 'Two live round trips through the quote-to-settlement path on Stellar Testnet, both filled on-chain. The transaction hashes below are real and still resolvable.',
  recordedAt: '14 Sep 2026',
  stats: [
    { value: 5.7, unit: 's', label: 'Quote to settled', note: 'median of both directions' },
    { value: 10, unit: ' bps', label: 'Protocol fee', note: '0.1%, charged on fill' },
    { value: 2, unit: '', label: 'Directions settled', note: 'XLM → USDC and back' },
    { value: 1, unit: ' tx', label: 'Per trade', note: 'both legs, atomically' },
  ],
  runs: [
    {
      pair: 'XLM → USDC',
      sold: '1 XLM',
      received: '2.5 USDC',
      ms: 5692,
      tx: '257fbc16d8efca857704e86bc8b7514c4a02472075a5befd8b44bc80bf5cfb0a',
    },
    {
      pair: 'USDC → XLM',
      sold: '5 USDC',
      received: '2 XLM',
      ms: 5714,
      tx: 'b0d6b9dfe09c9b0cdd5d9943373994365dd7bef5bc23ac32ee60353c555dd0aa',
    },
  ],
} as const;

export type ProofRun = (typeof PROOF)['runs'][number];

/** Questions a counterparty actually asks before sending size to a new desk. */
export const FAQ = {
  eyebrow: 'Questions',
  heading: { lead: 'Before you send size.', rest: [] } satisfies TwoToneHeading,
  items: [
    {
      q: 'What stops the other side changing the amounts?',
      a: 'Nothing they control. Each party signs a Soroban authorization entry over the exact arguments of the fill — both addresses, both amounts, both tokens, the expiry and a nonce. Change any one of them and the signature no longer matches, so the contract rejects the transaction. The submitter cannot alter the deal, and neither can we.',
    },
    {
      q: 'Who can see my order?',
      a: 'A directed offer is addressed to one wallet and is visible to that counterparty alone. A broadcast offer goes to the takers watching that pair — you choose which of the two you are sending when you leave the counterparty field empty or fill it in.',
    },
    {
      q: 'Do I have to trust TrustRFQ with my funds?',
      a: 'No. There is no deposit, no escrow and no custody step. Funds move directly between the two wallets inside the fill transaction. Until that transaction lands, everything you signed is an off-chain authorization that moves nothing.',
    },
    {
      q: 'What happens if one leg fails?',
      a: 'Then nothing happens. Both transfers live in a single Soroban transaction: it either succeeds whole or reverts whole. There is no state in which one side has paid and the other has not.',
    },
    {
      q: 'Is this live on Mainnet?',
      a: 'Not yet. TrustRFQ runs on Stellar Testnet today, with the settlement contract deployed and a two-wallet run recorded on-chain. Mainnet follows a full external audit of the contract.',
    },
    {
      q: 'Which wallets are supported?',
      a: 'Freighter, today. The RFQ flow needs both SEP-43 message signing and Soroban auth-entry signing, and Freighter is the wallet that supports both and that counterparties can actually install.',
    },
  ],
} as const;
