/**
 * Jardin d'étoiles: the talent tree, opened after the first prestige.
 * Talents are paid by PLANTING star seeds: a planted seed keeps counting for the
 * production bonus (+5 %), so seeds are a budget, not a sacrifice. The last
 * talent of each branch is a "path": only one path can be chosen.
 */
import type { RuneStat } from './runes';

export type BranchId = 'miner' | 'machinist' | 'mystic';

export interface TalentDef {
  id: string;
  branch: BranchId;
  name: string;
  /** Effect of ONE level (or of the talent for single-level ones). */
  desc: string;
  max: number;
  /** Seeds for the first level; each level costs `growth` times more. */
  cost: number;
  growth: number;
  requires?: string;
  /** Exclusive capstone. */
  path?: boolean;
  /** Minimum number of island descents. */
  prestiges?: number;
  /** Plain stat bonus per level (merged into the bonus table). */
  stat?: RuneStat;
  per?: number;
}

export const BRANCHES: { id: BranchId; name: string; blurb: string; css: string }[] = [
  { id: 'miner', name: 'Mineur', blurb: 'Pour qui aime frapper.', css: '#138aa6' },
  { id: 'machinist', name: 'Machiniste', blurb: 'Pour qui laisse tourner l’île.', css: '#a86b0c' },
  { id: 'mystic', name: 'Mystique', blurb: 'Pour qui chasse les runes.', css: '#6f45b8' },
];

export const TALENTS: TalentDef[] = [
  // Mineur
  { id: 'grip', branch: 'miner', name: 'Poigne d’acier', desc: '+25 % de valeur des coups', max: 5, cost: 3, growth: 1.6, stat: 'click', per: 0.25 },
  { id: 'streak', branch: 'miner', name: 'Série ardente', desc: 'La série de frappe augmente chaque coup de 1 % par coup enchaîné (+20 % max par niveau)', max: 3, cost: 6, growth: 2, requires: 'grip' },
  { id: 'eye', branch: 'miner', name: 'Œil du critique', desc: '+2 % de chance de coup critique', max: 5, cost: 5, growth: 1.6, requires: 'grip', stat: 'crit', per: 0.02 },
  { id: 'hunter', branch: 'miner', name: 'Chasseur de golems', desc: 'Gardiens : +10 s pour les briser et +50 % de fragments', max: 1, cost: 15, growth: 1, requires: 'eye' },
  { id: 'pathPick', branch: 'miner', name: 'Voie de la Pioche', desc: 'Coups ×2. Toutes les 25 frappes enchaînées, une onde d’éclats vaut 10 coups.', max: 1, cost: 40, growth: 1, requires: 'streak', path: true },
  // Machiniste
  { id: 'foreman', branch: 'machinist', name: 'Contremaître', desc: 'Achat automatique des machines (déjà posées une fois), activable', max: 1, cost: 8, growth: 1, prestiges: 2 },
  { id: 'dreamer', branch: 'machinist', name: 'Rêveur', desc: '+2 h de gains hors ligne au plafond', max: 2, cost: 4, growth: 2 },
  { id: 'founder', branch: 'machinist', name: 'Fondations', desc: 'Chaque nouvelle île démarre avec 10 foreuses et 5 excavatrices de plus', max: 3, cost: 5, growth: 2, requires: 'dreamer' },
  { id: 'thrift', branch: 'machinist', name: 'Économe', desc: '−4 % sur le prix des machines', max: 5, cost: 4, growth: 1.6, requires: 'dreamer', stat: 'cost', per: 0.04 },
  { id: 'pathAuto', branch: 'machinist', name: 'Voie de l’Automate', desc: 'Un perchoir de plus et des familiers 50 % plus forts', max: 1, cost: 40, growth: 1, requires: 'founder', path: true },
  // Mystique
  { id: 'clover', branch: 'mystic', name: 'Trèfle', desc: '+15 % de chance de rune', max: 5, cost: 3, growth: 1.6, stat: 'luck', per: 0.15 },
  { id: 'alchemy', branch: 'mystic', name: 'Alchimiste', desc: 'Fusions : −20 % de fragments', max: 2, cost: 6, growth: 2, requires: 'clover' },
  { id: 'patience', branch: 'mystic', name: 'Patience', desc: 'La garantie de l’autel arrive 25 % plus tôt', max: 2, cost: 6, growth: 2, requires: 'clover' },
  { id: 'generous', branch: 'mystic', name: 'Autel généreux', desc: 'Le tirage automatique peut utiliser 15 % de la production (au lieu de 10 %)', max: 1, cost: 12, growth: 1, requires: 'alchemy' },
  { id: 'pathOracle', branch: 'mystic', name: 'Voie de l’Oracle', desc: 'La nuit dure la moitié du cycle', max: 1, cost: 40, growth: 1, requires: 'patience', path: true },
];

export const TALENT_BY_ID = new Map(TALENTS.map((t) => [t.id, t]));
export const TALENT = {
  /** The tree can be re-planted for free during the first minutes of an island. */
  respecWindow: 180,
};
