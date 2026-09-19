// Guards the two places a section name can rot silently.
//
// public/intent.css keys spacing off [data-panel="..."], and public/*.css is
// NOT part of the bundle — nothing type-checks those selectors against the
// JSX. Rename a panel id and nothing throws; the layout just quietly loses its
// spacing. CLAUDE.md calls this out as a "do not rediscover" trap, so it gets a
// test instead of a grep somebody has to remember to run.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { DEFAULT_SECTION, SECTIONS, deskPath, sectionById, sectionBySlug } from './sections';

const read = (rel: string) =>
  readFileSync(fileURLToPath(new URL(`../../${rel}`, import.meta.url)), 'utf8');

const panelsIn = (css: string) =>
  [...css.matchAll(/\[data-panel="([^"]+)"\]/g)].map((m) => m[1]);

describe('desk sections', () => {
  it('has unique ids and slugs', () => {
    const ids = SECTIONS.map((s) => s.id);
    const slugs = SECTIONS.map((s) => s.slug);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('round-trips slug -> section -> path', () => {
    for (const s of SECTIONS) {
      expect(sectionBySlug(s.slug)).toEqual(s);
      expect(sectionById(s.id)).toEqual(s);
      expect(deskPath(s.id)).toBe(`/desk/${s.slug}`);
    }
  });

  it('falls back to the default section for an unknown slug', () => {
    expect(sectionBySlug('nope')).toBeUndefined();
    expect(sectionBySlug(undefined)).toBeUndefined();
    expect(DEFAULT_SECTION.id).toBe('create');
  });

  // The real point of this file: every [data-panel] selector shipped in the
  // stylesheets must name a section that still exists. intent.css styles a
  // subset (create has no rules of its own today), so this is one-directional.
  it('every [data-panel] selector in the stylesheets names a real section', () => {
    const ids = new Set<string>(SECTIONS.map((s) => s.id));
    for (const file of ['public/intent.css', 'public/styles.css']) {
      for (const panel of panelsIn(read(file))) {
        expect(ids, `${file} styles [data-panel="${panel}"], which is not a section`).toContain(panel);
      }
    }
  });
});
