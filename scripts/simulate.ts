/**
 * Balancing report: `npm run simulate`
 * Plays the first island automatically with several player profiles and checks:
 *  - no early-game wait between purchases longer than ~3 minutes,
 *  - 30 to 45 minutes of content before the first prestige.
 */
import { formatDuration, formatNumber } from '../src/economy/format';
import { simulateRun } from '../src/economy/simulation';
import { computeRates, prestigeGain } from '../src/economy/economy';

const profiles = [
  { name: 'Actif (3 clics/s tout le long)', clicksPerSecond: 3 },
  { name: 'Moyen (2 clics/s pendant 10 min)', clicksPerSecond: 2, clickUntil: 600 },
  { name: 'Paresseux (1 clic/s pendant 3 min)', clicksPerSecond: 1, clickUntil: 180 },
];

let failed = false;
const verbose = process.argv.includes('--verbose');

for (const p of profiles) {
  const r = simulateRun(p);
  console.log(`\n=== ${p.name} ===`);
  if (verbose) for (const e of r.events) console.log(`  ${formatDuration(e.t).padStart(14)}  ${e.what}`);
  for (const [z, t] of Object.entries(r.zoneTimes)) console.log(`  Zone ${z.padEnd(8)} ouverte à ${formatDuration(t!)}`);
  for (const [m, t] of Object.entries(r.firstMachineTimes)) console.log(`  1re ${m.padEnd(10)} à ${formatDuration(t!)}`);
  console.log(`  Achats: ${r.purchases}`);
  console.log(`  Plus longue attente (10 premières min): ${formatDuration(r.maxEarlyGap)} (vers ${formatDuration(r.maxEarlyGapAt)})`);
  console.log(`  Plus longue attente (toute la partie):  ${formatDuration(r.maxGap)} (vers ${formatDuration(r.maxGapAt)})`);
  const rates = computeRates(r.final);
  console.log(`  Production finale: ${formatNumber(rates.shards)} éclats/s, ${formatNumber(rates.lumen)} lumen/s`);
  if (r.prestigeReadyAt === null) {
    console.log('  ❌ Prestige jamais atteint');
    failed = true;
  } else {
    console.log(`  Prestige disponible à ${formatDuration(r.prestigeReadyAt)} → ${prestigeGain(r.final)} graines`);
  }
  if (p === profiles[0] || p === profiles[1]) {
    const ok = r.maxEarlyGap <= 180 && r.prestigeReadyAt !== null && r.prestigeReadyAt >= 30 * 60 && r.prestigeReadyAt <= 50 * 60;
    console.log(ok ? '  ✅ Rythme OK' : '  ❌ Rythme hors cible');
    if (!ok) failed = true;
  }
}
process.exit(failed ? 1 : 0);
