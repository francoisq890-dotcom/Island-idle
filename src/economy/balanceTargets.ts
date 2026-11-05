/**
 * Balance targets as code (see BALANCE.md). Shared by `npm run simulate` and
 * tests/balance.test.ts: any change to the economy that breaks one of them
 * fails the tests and blocks the deployment.
 */
import type { CampaignReport } from './campaign';
import { simulateRun } from './simulation';

export const BALANCE_TARGETS = {
  /** Simulated hours per profile. */
  budgetHours: 9,
  /** First prestige: never before 25 min, any profile. */
  firstPrestigeMin: 25 * 60,
  /** …and 30–45 min for the "average" and "idle" players. */
  firstPrestigeTypical: [30 * 60, 45 * 60] as [number, number],
  /** A player who reads nothing must still get there. */
  firstPrestigeMax: 2 * 3600,
  /** Ascension: never before 2 h (even the optimal bot); within a few hours for the typical players. */
  ascensionMin: 2 * 3600,
  ascensionTypicalMax: 6 * 3600,
  /** No island is ever skipped through: each one takes at least this long. */
  islandMin: 3 * 60,
  /** Never more than ~2 min with nothing to buy (rune rolls excluded). Not checked for the random buyer. */
  maxBlocked: 130,
  /** Runaway guards at the end of the cycle (after soft caps). */
  maxBonusProd: 12,
  /** Island-to-island growth of the prestige multiplier stays bounded. */
  maxPrestigeMultStep: 6.5,
  /** Runes speed up the first island by this factor (with / without). */
  runesSpeedup: [1.1, 2.2] as [number, number],
};

export interface Check {
  ok: boolean;
  label: string;
}

const m = (s: number) => `${Math.round(s / 60)} min`;
const h = (s: number) => `${(s / 3600).toFixed(2)} h`;

export function checkCampaign(c: CampaignReport): Check[] {
  const T = BALANCE_TARGETS;
  const id = c.profile.id;
  const out: Check[] = [];
  const i1 = c.islands[0];
  if (!i1) return [{ ok: false, label: 'le Phare ne s’est jamais éveillé' }];
  out.push({ ok: i1.ready >= T.firstPrestigeMin, label: `1er prestige pas avant 25 min (${m(i1.ready)})` });
  if (id === 'average' || id === 'idle') out.push({ ok: i1.ready >= T.firstPrestigeTypical[0] && i1.ready <= T.firstPrestigeTypical[1], label: `1er prestige entre 30 et 45 min (${m(i1.ready)})` });
  if (id === 'random') out.push({ ok: i1.ready <= T.firstPrestigeMax, label: `même sans rien lire, 1er prestige en moins de 2 h (${m(i1.ready)})` });
  if (id !== 'random') out.push({ ok: c.ascensionAt !== null, label: `Ascension atteinte en ${T.budgetHours} h de jeu (${c.ascensionAt ? h(c.ascensionAt) : 'non'})` });
  if (c.ascensionAt !== null) out.push({ ok: c.ascensionAt >= T.ascensionMin, label: `Ascension jamais avant 2 h (${h(c.ascensionAt)})` });
  if ((id === 'average' || id === 'idle') && c.ascensionAt !== null) out.push({ ok: c.ascensionAt <= T.ascensionTypicalMax, label: `Ascension en quelques heures, ≤ 6 h (${h(c.ascensionAt)})` });
  const shortest = Math.min(...c.islands.map((x) => x.ready));
  out.push({ ok: shortest >= T.islandMin, label: `aucune île bâclée : la plus courte prend ${m(shortest)} (≥ 3 min)` });
  if (id !== 'random') {
    const blocked = Math.max(...c.islands.map((x) => x.maxBlocked));
    out.push({ ok: blocked <= T.maxBlocked, label: `jamais plus de ~2 min sans achat possible (${Math.round(blocked)} s)` });
  }
  const last = c.islands[c.islands.length - 1];
  out.push({ ok: last.bonusProd <= T.maxBonusProd, label: `pas d’emballement des bonus : production +${Math.round(last.bonusProd * 100)} % en fin de cycle (≤ +${T.maxBonusProd * 100} %)` });
  let worst = 1;
  for (let i = 1; i < c.islands.length; i++) worst = Math.max(worst, c.islands[i].prestigeMult / c.islands[i - 1].prestigeMult);
  out.push({ ok: worst <= T.maxPrestigeMultStep, label: `multiplicateur de prestige : au plus ×${worst.toFixed(1)} d’une île à l’autre (≤ ×${T.maxPrestigeMultStep})` });
  if (id === 'average' && c.islands[1]) out.push({ ok: c.islands[1].ready < i1.ready * 0.7, label: `2e île nettement plus rapide (${m(c.islands[1].ready)} < 70 % de ${m(i1.ready)})` });
  return out;
}

/** First island with / without runes for the average player (time ratio). */
export function runesSpeedup(): number {
  const o = { clicksPerSecond: 2, clickUntil: 600, eventCatch: 0.75 };
  const a = simulateRun(o).prestigeReadyAt ?? Infinity;
  const b = simulateRun({ ...o, noRunes: true }).prestigeReadyAt ?? Infinity;
  return b / a;
}
