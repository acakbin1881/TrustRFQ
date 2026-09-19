// The brand mark.
//
// It lives outside src/landing/ because public/favicon.svg has to be drawn from
// the same numbers. A mark that gets redrawn per surface stops being a mark —
// that is exactly how the old favicon ended up still in the retired gold palette
// while the page had already moved to lime.
//
// WHAT IT SAYS. The glyph is a quotation mark over a firm line, which is the
// name read literally: Trust is the seal, RFQ is the quote, and the bar beneath
// is the price that does not move. README's first line already wrote it — "a
// signed-quote RFQ protocol" — so the mark had to be found, not invented.
//
// THE SEAL IS A SUPERELLIPSE, NOT A ROUNDED RECT. |x/32|^5 + |y/32|^5 = 1,
// fitted to one cubic per corner at r=22.6 with a handle of k=19.1, so
// k/r = 0.846 where a circular corner wants 0.5523. Replacing this path with
// rx="22.6" is not a simplification: curvature would jump from zero to its
// maximum at the instant the straight edge ends, and that 1.15px break is the
// whole difference between an icon that looks drawn and one that looks cut.
//
// TERMINALS ARE FLAT. Space Grotesk's are, and the wordmark sits 8px away — a
// round cap there makes the mark speak a different language from its own
// lettering. It also blobbed the glyph shut below 20px.
//
// COUNTERS COME OFF THE STEM (8), never off the eye:
//   slab to slab      7   (0.875 stem — at a full stem the counter reads open)
//   quote to bar      8   (exactly one stem)
//   side margin      18
//   optical centre   31   (one unit high: the bar is the heavy element and it
//                          drags the geometric centre visibly downward)
// The bar's two ends land on the quote block's outermost points — the lower-left
// of the first slab, the upper-right of the second. Nobody notices that; it is
// the reason the mark reads as constructed rather than arranged.

/** The seal. Superellipse n=5 — read the note above before touching it. */
export const SEAL =
  'M22.6 0H41.4C60.5 0 64 3.5 64 22.6V41.4C64 60.5 60.5 64 41.4 64H22.6C3.5 64 0 60.5 0 41.4V22.6C0 3.5 3.5 0 22.6 0Z';

/** Display cut — stem 8. Used at 24px and above. */
export const GLYPH = 'M23 14H31L26 32H18ZM38 14H46L41 32H33ZM18 40H46V48H18Z';

/** Micro cut — stem 9, margins one unit tighter. Below 24px the display cut
 *  goes thin; at 16px that single unit is the whole legibility margin. */
export const GLYPH_MICRO = 'M22 14H31L26 31H17ZM38 14H47L42 31H33ZM17 39H47V48H17Z';

/** The cut is chosen by size, not by a prop: an optical correction a caller can
 *  forget to pass is an optical correction that silently stops happening. */
export const glyphFor = (size: number) => (size < 24 ? GLYPH_MICRO : GLYPH);

/**
 * The mark as it sits beside the wordmark.
 *
 * The seal takes `currentColor` so lime stays a Tailwind concern (`text-lime`),
 * and the glyph is knocked out in carbon rather than in the page background:
 * this direction of the mark is only ever lime-on-carbon. The inverse polarity
 * — carbon seal on a lime surface — is a different lockup, not a prop.
 */
export function BrandMark({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={className} aria-hidden="true">
      <path d={SEAL} fill="currentColor" />
      <path d={glyphFor(size)} fill="var(--color-carbon)" />
    </svg>
  );
}
