/**
 * Ascension: the second prestige layer. Once enough star seeds have been earned
 * during the current cycle, the whole archipelago can rise above the clouds:
 * seeds, talents, constellations and most runes reset; Couronnes d'éther are
 * gained. Ascension unlocks two new mechanics: Relics (bought with crowns) and
 * Challenges (islands with a constraint, permanent rewards).
 */
import type { RuneStat } from './runes';

export const ASCENSION = {
  /** Seeds earned during the current cycle needed to ascend. */
  seeds: 1000,
  /** Crowns = floor(crownFactor × √(cycle seeds / seeds)). */
  crownFactor: 3,
  /** Each crown (owned, spent or not): +10 % production and +10 % rune luck. */
  crownProd: 0.1,
  crownLuck: 0.1,
};

export type RelicId = 'bridges' | 'autoPrestige' | 'perch' | 'heritage' | 'bell' | 'keepAltar';

export interface RelicDef {
  id: RelicId;
  name: string;
  desc: string;
  cost: number;
}

export const RELICS: RelicDef[] = [
  { id: 'bridges', name: 'Mémoire des ponts', desc: 'Les trois ponts sont déjà construits sur chaque nouvelle île.', cost: 2 },
  { id: 'autoPrestige', name: 'Phare automatique', desc: 'Le Phare fait descendre l’île tout seul dès que la descente doublerait tes graines (activable).', cost: 3 },
  { id: 'perch', name: 'Perchoir d’or', desc: 'Un perchoir de familier en plus.', cost: 2 },
  { id: 'heritage', name: 'Héritage', desc: 'Chaque nouvelle île démarre avec 10 % des machines de la précédente.', cost: 3 },
  { id: 'bell', name: 'Carillon du marchand', desc: 'Le marchand ambulant passe deux fois plus souvent.', cost: 1 },
  { id: 'keepAltar', name: 'Autel fidèle', desc: 'Les améliorations des autels sont conservées à la descente.', cost: 2 },
];

export type ChallengeId = 'noDrill' | 'tenth' | 'sealed' | 'moonless' | 'dear';

export interface ChallengeDef {
  id: ChallengeId;
  name: string;
  rule: string;
  reward: string;
  /** Permanent reward once completed. */
  stat?: RuneStat;
  value?: number;
}

export const CHALLENGES: ChallengeDef[] = [
  { id: 'noDrill', name: 'Sans foreuses', rule: 'Les foreuses ne peuvent pas être construites.', reward: 'Foreuses ×3 pour toujours', },
  { id: 'tenth', name: 'Disette', rule: 'Toute la production est divisée par 10.', reward: '+25 % de production pour toujours', stat: 'prod', value: 0.25 },
  { id: 'sealed', name: 'Autels scellés', rule: 'Aucun tirage, et tes runes dorment.', reward: '+50 % de chance de rune pour toujours', stat: 'luck', value: 0.5 },
  { id: 'moonless', name: 'Nuit sans lune', rule: 'Il fait nuit en permanence et le Lumen est divisé par 4.', reward: '+100 % de fragments pour toujours', stat: 'frag', value: 1 },
  { id: 'dear', name: 'Vie chère', rule: 'Les machines coûtent 3 fois plus cher.', reward: '−10 % sur le prix des machines pour toujours', stat: 'cost', value: 0.1 },
];
