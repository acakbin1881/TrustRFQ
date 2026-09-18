// Shared plumbing for the click-census E2E: config, the Tally (the census
// itself), tallied click/fill helpers, and failure artifacts.

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export { chromePath } from '../lib/chrome.mjs';

export function cfgFromEnv() {
  const role = process.env.ROLE;
  if (role !== 'maker' && role !== 'taker') throw new Error('set ROLE=maker|taker');
  const runId = process.env.RUN_ID;
  if (!runId) throw new Error('set RUN_ID (any unique digits, e.g. Date.now())');
  const pair = process.env.PAIR ?? 'xlm-xlm';
  if (pair !== 'xlm-xlm' && pair !== 'xlm-usdc') throw new Error('PAIR must be xlm-xlm or xlm-usdc');
  const scratch = process.env.SCRATCH ?? path.join(REPO_ROOT, 'tools', 'e2e', 'out');
  return {
    role, runId, pair,
    settler: process.env.SETTLER ?? 'maker',
    baseUrl: process.env.BASE_URL ?? 'http://localhost:4173/otc.html',
    keys: process.env.KEYS ?? path.join(REPO_ROOT, 'e2e-keys.json'),
    scratch,
    report: process.env.REPORT ?? path.join(scratch, `report-${role}-${runId}.json`),
    headed: !!process.env.HEADED,
    stopAfter: process.env.STOP_AFTER ?? null,
  };
}

// Unique-per-run amounts, derived identically by both drivers from RUN_ID: the
// decimal tail doubles as the run's correlation id, so THIS run's order is
// findable among the permanent Supabase rows of earlier runs.
export function uniqueAmounts(runId) {
  const tail = String(runId).replace(/\D/g, '').slice(-5).padStart(5, '0');
  return { maker: `10.${tail}`, taker: `9.${tail}` };
}

/** Mirrors src/core/tokens.ts trunc(): how the UI prints a counterparty. */
export const truncAddr = (a) => `${a.slice(0, 5)}…${a.slice(-5)}`;

export class Tally {
  constructor() {
    this.t0 = Date.now();
    this.events = [];
  }

  record(kind, label, extra = {}) {
    const ev = { t: Date.now() - this.t0, kind, label, ...extra };
    this.events.push(ev);
    const suffix = extra.promptType ? ` (${extra.promptType})` : extra.detail ? ` = ${extra.detail}` : '';
    console.log(`[census +${String(ev.t).padStart(6)}ms] ${kind.padEnd(13)} ${label}${suffix}`);
  }

  counts() {
    const uiClicks = this.events.filter((e) => e.kind === 'ui-click').length;
    const prompts = this.events.filter((e) => e.kind === 'wallet-prompt');
    const promptsByType = {};
    for (const p of prompts) promptsByType[p.promptType] = (promptsByType[p.promptType] ?? 0) + 1;
    return {
      uiClicks,
      uiFills: this.events.filter((e) => e.kind === 'ui-fill').length,
      navClicks: this.events.filter((e) => e.kind === 'ui-click-nav').length,
      walletPrompts: prompts.length,
      promptsByType,
    };
  }

  writeReport(reportPath, meta) {
    mkdirSync(path.dirname(reportPath), { recursive: true });
    const body = { ...meta, counts: this.counts(), events: this.events };
    writeFileSync(reportPath, JSON.stringify(body, null, 2));
    return body;
  }
}

/**
 * The ONLY way a driver clicks: waits for visibility, tallies one ui-click,
 * clicks. kind='ui-click-nav' marks harness-only navigation (e.g. collapsing a
 * wrong candidate row) that a human doing their own trade would not need; those
 * are reported separately and excluded from the headline click count.
 */
export async function click(tally, locator, label, { timeout = 15000, kind = 'ui-click' } = {}) {
  await locator.waitFor({ state: 'visible', timeout });
  tally.record(kind, label);
  await locator.click();
}

/** One tallied click (field focus) + typed value, logged as a separate ui-fill. */
export async function fillField(tally, locator, label, value) {
  await locator.waitFor({ state: 'visible', timeout: 15000 });
  tally.record('ui-click', label);
  await locator.click();
  await locator.fill(value);
  tally.record('ui-fill', label, { detail: value });
}
