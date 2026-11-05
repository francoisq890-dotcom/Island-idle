/** Dev helper: `npx tsx scripts/make-save.ts <minutes> [prestiges]` prints a save JSON from the bot (for screenshots). */
import { simulateRun } from '../src/economy/simulation';
import { doPrestige } from '../src/economy/economy';
import { serialize } from '../src/save/save';
const minutes = Number(process.argv[2] ?? 20);
const prestiges = Number(process.argv[3] ?? 0);
let state = undefined as ReturnType<typeof simulateRun>['final'] | undefined;
for (let i = 0; i < prestiges; i++) {
  const r = simulateRun({ clicksPerSecond: 2, clickUntil: 600, startState: state });
  state = r.final;
  doPrestige(state);
}
const r = simulateRun({ clicksPerSecond: 2, clickUntil: 600, maxSeconds: minutes * 60, startState: state });
r.final.objective = Math.max(r.final.objective, 7);
r.final.lastSeen = 0;
r.final.player = { x: 0, z: 9, yaw: 0 };
console.log(serialize(r.final));
