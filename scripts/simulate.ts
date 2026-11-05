/**
 * Balancing report: `npm run simulate` (add `-- --verbose` for every purchase).
 * The bot plays the first island with three player profiles, then a second
 * island after the prestige, and checks the pacing targets:
 *  - no early wait between purchases longer than ~2 minutes,
 *  - first prestige between 30 and 45 minutes,
 *  - runes matter without breaking the curve,
 *  - the second island is clearly faster.
 */
import { formatDuration, formatNumber } from '../src/economy/format';
import { simulateRun } from '../src/economy/simulation';
import { computeRates, doPrestige, prestigeGain } from '../src/economy/economy';

const profiles = [
  { name: 'Actif (3 coups/s tout le long)', clicksPerSecond: 3 },
  { name: 'Moyen (2 coups/s pendant 10 min)', clicksPerSecond: 2, clickUntil: 600 },
  { name: 'Paresseux (1 coup/s pendant 3 min)', clicksPerSecond: 1, clickUntil: 180 },
];

let failed = false;
const verbose = process.argv.includes('--verbose');
const check = (ok: boolean, label: string) => {
  console.log(`  ${ok ? '✅' : '❌'} ${label}`);
  if (!ok) failed = true;
};

for (const p of profiles) {
  const r = simulateRun(p);
  console.log(`\n=== ${p.name} ===`);
  if (verbose) for (const e of r.events) if (!e.what.startsWith('Tirage')) console.log(`  ${formatDuration(e.t).padStart(14)}  ${e.what}`);
  for (const [z, t] of Object.entries(r.zoneTimes)) console.log(`  Zone ${z.padEnd(8)} ouverte à ${formatDuration(t!)}`);
  console.log(`  Achats: ${r.purchases} · tirages de runes: ${r.rolls} · gardiens: ${r.guardians} · fusions: ${r.fusions} · familiers: ${r.final.pets.map((p) => p.rarity[0] + p.level).join(" ")} · bonus runes+succès: +${Math.round(r.bonusProd * 100)} % prod`);
  console.log(`  Plus longue attente (10 premières min): ${formatDuration(r.maxEarlyGap)} (vers ${formatDuration(r.maxEarlyGapAt)})`);
  console.log(`  Plus longue attente (toute la partie):  ${formatDuration(r.maxGap)} (vers ${formatDuration(r.maxGapAt)})`);
  const rates = computeRates(r.final);
  console.log(`  Production finale: ${formatNumber(rates.shards)} éclats/s, ${formatNumber(rates.lumen)} lumen/s`);
  if (r.prestigeReadyAt === null) {
    check(false, 'Prestige jamais atteint');
    continue;
  }
  const gain = prestigeGain(r.final);
  console.log(`  Prestige disponible à ${formatDuration(r.prestigeReadyAt)} → ${gain} graines`);
  check(r.maxEarlyGap <= 130, `blocage début de partie ≤ ~2 min (${formatDuration(r.maxEarlyGap)})`);
  if (p === profiles[0]) {
    // The "active" bot strikes 3×/s non-stop with instant decisions and no walking:
    // it is a lower bound, a real player is noticeably slower.
    check(r.prestigeReadyAt >= 24 * 60, `joueur optimal : pas avant 24 min (${formatDuration(r.prestigeReadyAt)})`);
  } else check(r.prestigeReadyAt >= 30 * 60 && r.prestigeReadyAt <= 45 * 60, `premier prestige entre 30 et 45 min (${formatDuration(r.prestigeReadyAt)})`);
  if (p === profiles[1]) {
    const noRunes = simulateRun({ ...p, noRunes: true });
    console.log(`  Sans runes : prestige à ${noRunes.prestigeReadyAt ? formatDuration(noRunes.prestigeReadyAt) : 'jamais'}`);
    const speedup = noRunes.prestigeReadyAt ? noRunes.prestigeReadyAt / r.prestigeReadyAt : 9;
    check(speedup > 1.08 && speedup < 1.8, `les runes comptent sans tout casser (×${speedup.toFixed(2)} plus vite)`);
    // Second island: continue from the prestiged state.
    const s2 = r.final;
    doPrestige(s2);
    const second = simulateRun({ ...p, startState: s2 });
    console.log(`  2e île (${s2.seeds} graines, ${Object.keys(s2.runes).length} runes gardées) : prestige à ${second.prestigeReadyAt ? formatDuration(second.prestigeReadyAt) : 'jamais'} → ${prestigeGain(second.final)} graines`);
    check(!!second.prestigeReadyAt && second.prestigeReadyAt < r.prestigeReadyAt * 0.7, '2e cycle nettement plus rapide (< 70 % du premier)');
  }
}
process.exit(failed ? 1 : 0);
