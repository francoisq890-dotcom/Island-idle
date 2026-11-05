/**
 * Balancing report: `npm run simulate` (add `-- --verbose` for every island).
 * The bot plays a whole Ascension cycle with five player profiles and checks the
 * targets of BALANCE.md. The same checks run in tests/balance.test.ts and in CI:
 * if a target is missed, the deployment is blocked.
 */
import { formatDuration } from '../src/economy/format';
import { BALANCE_TARGETS, checkCampaign, runesSpeedup } from '../src/economy/balanceTargets';
import { PROFILES, runCampaign } from '../src/economy/campaign';

let failed = false;
const verbose = process.argv.includes('--verbose');
const rows: string[] = [];

for (const p of PROFILES) {
  const c = runCampaign(p, { maxHours: BALANCE_TARGETS.budgetHours });
  console.log(`\n=== ${p.name} ===`);
  if (verbose)
    for (const i of c.islands)
      console.log(`  île ${String(i.index).padStart(2)} : Phare à ${formatDuration(i.ready).padStart(12)} · +${i.gain} graines (cycle ${i.cycleSeeds}) · bonus prod +${Math.round(i.bonusProd * 100)} % · chance +${Math.round(i.luck * 100)} % · blocage max ${formatDuration(i.maxBlocked)}`);
  for (const r of checkCampaign(c)) {
    console.log(`  ${r.ok ? '✅' : '❌'} ${r.label}`);
    if (!r.ok) failed = true;
  }
  const i1 = c.islands[0];
  rows.push(`| ${p.name} | ${i1 ? formatDuration(i1.ready) : '—'} | ${c.islands[1] ? formatDuration(c.islands[1].ready) : '—'} | ${c.islands.length ? formatDuration(Math.min(...c.islands.map((x) => x.ready))) : '—'} | ${c.ascensionAt ? (c.ascensionAt / 3600).toFixed(2).replace('.', ',') + ' h' : 'non atteinte'} (${c.islands.length} îles) | ${formatDuration(Math.max(0, ...c.islands.map((x) => x.maxBlocked)))} |`);
}

const sp = runesSpeedup();
const okRunes = sp > BALANCE_TARGETS.runesSpeedup[0] && sp < BALANCE_TARGETS.runesSpeedup[1];
console.log(`\n${okRunes ? '✅' : '❌'} les runes comptent sans tout casser (1re île ×${sp.toFixed(2)} plus vite)`);
if (!okRunes) failed = true;

console.log('\nTableau pour BALANCE.md :');
console.log('| Profil | 1er prestige | 2e île | Île la plus courte | Ascension | Blocage max |');
console.log('|---|---|---|---|---|---|');
for (const r of rows) console.log(r);
process.exit(failed ? 1 : 0);
