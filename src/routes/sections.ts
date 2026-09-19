// The desk's sections in ONE place: the URL slug, the panel id the stylesheets
// key off, and what the nav capsule shows.
//
// slug ≠ id for the compose panel on purpose. The URL reads /desk/new, but the
// panel keeps data-panel="create", because public/intent.css's
// [data-panel="create"] rules track THAT name. A stale panel id fails SILENTLY
// — no error, just lost spacing — so the two names are pinned together here and
// guarded by sections.test.ts, which reads intent.css and checks them.

export const SECTIONS = [
  { id: 'create', slug: 'new', label: 'New offer', glyph: '+' },
  { id: 'incoming', slug: 'incoming', label: 'Incoming', glyph: '↓' },
  { id: 'sent', slug: 'sent', label: 'Sent', glyph: '↑' },
  { id: 'rfq', slug: 'rfq', label: 'RFQ', glyph: '⇄' },
] as const;

export type Section = (typeof SECTIONS)[number];
export type SectionId = Section['id'];
export type SectionSlug = Section['slug'];

/** The section the desk opens on, and where an unknown slug lands. */
export const DEFAULT_SECTION: Section = SECTIONS[0];

export const sectionBySlug = (slug: string | undefined): Section | undefined =>
  SECTIONS.find((s) => s.slug === slug);

export const sectionById = (id: SectionId): Section =>
  SECTIONS.find((s) => s.id === id) ?? DEFAULT_SECTION;

/** The canonical URL for a section — the one place that spells out /desk/. */
export const deskPath = (id: SectionId): string => `/desk/${sectionById(id).slug}`;
