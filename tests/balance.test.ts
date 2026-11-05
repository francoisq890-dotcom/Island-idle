/**
 * Balance targets as automated tests (see BALANCE.md and src/economy/balanceTargets.ts).
 * Five player profiles play a whole Ascension cycle; any economy change that
 * breaks a target fails here (and blocks the deployment in CI).
 */
import { describe, expect, it } from 'vitest';
import { BALANCE_TARGETS, checkCampaign, runesSpeedup } from '../src/economy/balanceTargets';
import { PROFILES, runCampaign } from '../src/economy/campaign';
import { bonusTotals, softCap } from '../src/economy/bonuses';
import { createInitialState } from '../src/economy/state';
import { RUNES, SOFT_CAP } from '../src/config/runes';

describe('global balance: five profiles, whole Ascension cycle', () => {
  for (const p of PROFILES) {
    it(`${p.name}`, () => {
      const c = runCampaign(p, { maxHours: BALANCE_TARGETS.budgetHours });
      const failed = checkCampaign(c).filter((x) => !x.ok).map((x) => x.label);
      expect(failed).toEqual([]);
    }, 240_000);
  }
  it('runes matter without breaking the curve', () => {
    const sp = runesSpeedup();
    expect(sp).toBeGreaterThan(BALANCE_TARGETS.runesSpeedup[0]);
    expect(sp).toBeLessThan(BALANCE_TARGETS.runesSpeedup[1]);
  }, 120_000);
});

describe('runaway guards', () => {
  it('owning every rune ×1000 stays under the soft caps', () => {
    const s = createInitialState(0);
    s.zones = { home: true, forge: true, geyser: true, sky: true };
    for (const r of RUNES) s.runes[r.id] = 1000;
    const b = bonusTotals(s);
    expect(b.prod).toBeLessThanOrEqual(SOFT_CAP.prod!);
    expect(b.bulk).toBeLessThanOrEqual(2);
    expect(b.cost).toBeLessThanOrEqual(0.6);
  });
  it('soft caps slow growth without ever decreasing', () => {
    let prev = 0;
    for (let x = 0; x < 200; x += 0.5) {
      const y = softCap(x, 4);
      expect(y).toBeGreaterThanOrEqual(prev);
      prev = y;
    }
    expect(softCap(100, 4)).toBeLessThan(15);
  });
  it('runes are capped by the connected islands early on', () => {
    const s = createInitialState(0);
    s.runes = { st7: 50, st5: 50 };
    const early = bonusTotals(s).prod;
    s.zones = { home: true, forge: true, geyser: true, sky: true };
    const late = bonusTotals(s).prod;
    expect(early).toBeLessThan(late / 5);
  });
});
