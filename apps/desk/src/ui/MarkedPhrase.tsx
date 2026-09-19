// A sentence with one or two of its words marked — the landing's headline
// device, at body scale.
//
// It is a separate component from the landing's MarkedWord rather than a
// shared one, and the reason is the scale. The landing's version is tuned for
// a clamp()ed display headline: em-sized glyphs, an optical baseline offset
// found by eye at 4rem, a rule thick enough to read under 68px type. None of
// those numbers survive being dropped into an 18px line — they were measured,
// not derived. What IS shared is the grammar, and that is written down in
// tuneay/tarif-isaretli-baslik.md.
//
// RANKED, not equal, same as the landing: the loud mark takes the accent rule,
// the quiet one only answers on hover. An emphasis repeated at the same weight
// is an emphasis spent.

import type { LucideIcon } from 'lucide-react';

export interface PhraseMark {
  /** must appear verbatim in the phrase */
  word: string;
  icon: LucideIcon;
  /** the loud one gets the rule; at most one per phrase */
  rank?: 'loud' | 'quiet';
}

function Marked({ word, icon: Glyph, rank = 'quiet' }: PhraseMark) {
  const loud = rank === 'loud';
  return (
    <span tabIndex={0} className="tr-phrase group/mark relative inline-block cursor-default
      rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-lime/40">
      <span className={`tr-phrase-word inline-block ${loud ? 'text-snow' : ''}`}>{word}</span>

      <span className={`ml-[0.28em] inline-block align-[0.02em]
        ${loud ? 'tr-phrase-idle-seal' : 'tr-phrase-idle-glyph'}`}>
        <Glyph
          className={`${loud ? 'tr-phrase-seal' : 'tr-phrase-glyph'} block size-[0.8em]
            text-slate group-hover/mark:text-lime`}
          strokeWidth={1.5} aria-hidden="true" />
      </span>

      {loud ? (
        // stops at the word: the glyph is punctuation, not part of the claim
        <span className="tr-mark-rule absolute -bottom-[0.16em] left-0 block h-[1.5px]
          rounded-pill bg-lime" style={{ width: 'calc(100% - 1.1em)' }} aria-hidden="true" />
      ) : null}
    </span>
  );
}

/**
 * Splits `text` on each mark's word and renders the marks in place.
 *
 * Matching by string rather than storing the phrase pre-split keeps the copy a
 * readable sentence at its definition site. A mark whose word is not found is
 * skipped — a flourish that silently goes missing beats one that renders in
 * the wrong place.
 */
export function MarkedPhrase({ text, marks, className = '' }: {
  text: string; marks: readonly PhraseMark[]; className?: string;
}) {
  const parts: React.ReactNode[] = [];
  let rest = text;
  let key = 0;

  for (const mark of marks) {
    const at = rest.indexOf(mark.word);
    if (at === -1) continue;
    parts.push(<span key={key++}>{rest.slice(0, at)}</span>);
    parts.push(<Marked key={key++} {...mark} />);
    rest = rest.slice(at + mark.word.length);
  }
  parts.push(<span key={key++}>{rest}</span>);

  return <p className={className}>{parts}</p>;
}
