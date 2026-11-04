/**
 * Diegetic tutorial + goal chain. Each objective is a short sentence shown at the
 * top of the screen with a progress bar, and a world marker pointing to where
 * the player should go.
 */
import { prestigeThreshold, type MachineId, type ZoneId } from '../config/economy';
import type { Rates } from './economy';
import type { GameState } from './state';

/** Where the world beacon should point. */
export type ObjectiveTarget =
  | { kind: 'crystal' }
  | { kind: 'site'; machine: MachineId }
  | { kind: 'bridge'; zone: ZoneId }
  | { kind: 'lighthouse' }
  | { kind: 'altar'; family: 'stone' | 'ember' | 'mist' | 'star' }
  | { kind: 'ui'; panel: 'workshop' }
  | { kind: 'none' };

export interface Objective {
  id: string;
  text: string;
  /** Optional variant for touch devices. */
  touchText?: string;
  /** Small helper line shown under the objective. */
  hint?: string;
  touchHint?: string;
  target: ObjectiveTarget;
  progress: (s: GameState, r: Rates) => [current: number, goal: number];
  /** Shards (and lumen) granted on completion. */
  reward?: { shards?: number; lumen?: number };
}

const m = (id: MachineId, n: number) => (s: GameState): [number, number] => [s.machines[id], n];

export const OBJECTIVES: Objective[] = [
  {
    id: 'walk',
    text: 'Marche jusqu’au grand cristal lumineux',
    touchText: 'Utilise le joystick pour marcher jusqu’au grand cristal',
    hint: 'ZQSD / WASD pour marcher · glisser la souris pour tourner la caméra',
    touchHint: 'Glisse à gauche de l’écran pour marcher, à droite pour tourner la caméra',
    target: { kind: 'crystal' },
    progress: (s) => [s.flags.nearCrystal ? 1 : 0, 1],
  },
  {
    id: 'harvest',
    text: 'Récolte 10 éclats sur le cristal',
    touchText: 'Touche le cristal pour récolter 10 éclats',
    hint: 'Clic gauche sur le cristal, ou touche E quand tu es à côté',
    touchHint: 'Touche le cristal ou le bouton Action (garde-le appuyé pour enchaîner)',
    target: { kind: 'crystal' },
    progress: (s) => [Math.min(s.stats.harvests, 10), 10],
  },
  {
    id: 'drill1',
    text: 'Construis ta première foreuse sur la veine de cristal',
    hint: 'Approche-toi du chantier balisé et appuie sur E',
    touchHint: 'Approche-toi du chantier balisé et appuie sur Action',
    target: { kind: 'site', machine: 'drill' },
    progress: m('drill', 1),
    reward: { shards: 5 },
  },
  {
    id: 'drill3',
    text: 'Possède 3 foreuses',
    hint: 'Elles travaillent même quand tu ne joues pas. Regarde les éclats rouler vers le Nexus !',
    target: { kind: 'site', machine: 'drill' },
    progress: m('drill', 3),
    reward: { shards: 15 },
  },
  {
    id: 'pick1',
    text: 'Achète la « Pioche renforcée » dans l’Atelier',
    touchText: 'Ouvre l’Atelier (bouton marteau) et achète la « Pioche renforcée »',
    hint: 'Touche B ou le bouton Atelier en bas à droite',
    touchHint: 'Le bouton marteau, en haut à droite',
    target: { kind: 'ui', panel: 'workshop' },
    progress: (s) => [s.upgrades.pick1 ? 1 : 0, 1],
  },
  {
    id: 'excavator1',
    text: 'Construis une excavatrice',
    hint: 'Plus chère, mais 6× plus productive qu’une foreuse',
    target: { kind: 'site', machine: 'excavator' },
    progress: m('excavator', 1),
    reward: { shards: 40 },
  },
  {
    id: 'rune1',
    text: 'Tire une rune à l’Autel de Pierre',
    hint: 'Les runes donnent des bonus permanents qui s’additionnent. Plus rares = plus puissantes.',
    target: { kind: 'altar', family: 'stone' },
    progress: (s) => [s.runeStats.rolls > 0 ? 1 : 0, 1],
    reward: { shards: 60 },
  },
  {
    id: 'rate10',
    text: 'Atteins une production de 10 éclats / seconde',
    hint: 'Les améliorations de l’Atelier multiplient tes machines',
    target: { kind: 'none' },
    progress: (_s, r) => [Math.min(r.shards, 10), 10],
  },
  {
    id: 'bridgeForge',
    text: 'Construis le Pont des Forges',
    hint: 'Il mène à un nouvel îlot, à l’est',
    target: { kind: 'bridge', zone: 'forge' },
    progress: (s) => [s.zones.forge ? 1 : 0, 1],
  },
  {
    id: 'refinery1',
    text: 'Construis une raffinerie sur l’Îlot des Forges',
    hint: 'Elle transforme une partie de tes éclats en Lumen doré',
    target: { kind: 'site', machine: 'refinery' },
    progress: m('refinery', 1),
    reward: { shards: 200 },
  },
  {
    id: 'lumen50',
    text: 'Accumule 50 Lumen',
    hint: 'Plus de raffineries = plus de Lumen (tant que tes foreuses suivent)',
    target: { kind: 'site', machine: 'refinery' },
    progress: (s) => [Math.min(s.lumen, 50), 50],
  },
  {
    id: 'bridgeGeyser',
    text: 'Construis le Pont des Brumes',
    hint: 'Il mène à l’Îlot des Geysers, à l’ouest',
    target: { kind: 'bridge', zone: 'geyser' },
    progress: (s) => [s.zones.geyser ? 1 : 0, 1],
  },
  {
    id: 'geyser1',
    text: 'Construis un geyser d’éther',
    target: { kind: 'site', machine: 'geyser' },
    progress: m('geyser', 1),
    reward: { lumen: 20 },
  },
  {
    id: 'geyser5',
    text: 'Possède 5 geysers d’éther',
    hint: 'Pense aux paliers : 10 machines d’un même type doublent leur production',
    target: { kind: 'site', machine: 'geyser' },
    progress: m('geyser', 5),
  },
  {
    id: 'bridgeSky',
    text: 'Construis l’Escalier céleste',
    hint: 'Il monte vers l’Île Céleste, au nord',
    target: { kind: 'bridge', zone: 'sky' },
    progress: (s) => [s.zones.sky ? 1 : 0, 1],
  },
  {
    id: 'prism1',
    text: 'Construis un prisme solaire',
    target: { kind: 'site', machine: 'prism' },
    progress: m('prism', 1),
  },
  {
    id: 'wake',
    text: 'Éveille le Phare : récolte assez d’éclats sur cette île',
    hint: 'Compte tout ce que tu as récolté depuis que l’île est née',
    target: { kind: 'lighthouse' },
    progress: (s) => [Math.min(s.stats.runShards, prestigeThreshold(s.stats.prestiges)), prestigeThreshold(s.stats.prestiges)],
  },
  {
    id: 'prestige',
    text: 'Active le Phare pour faire descendre l’île',
    hint: 'Tu gagneras des Graines d’étoile : un bonus permanent de production',
    target: { kind: 'lighthouse' },
    progress: (s) => [s.stats.prestiges > 0 ? 1 : 0, 1],
  },
];

export function currentObjective(state: GameState): Objective | null {
  return OBJECTIVES[state.objective] ?? null;
}

/** Objectives already achieved after a prestige are skipped instantly. */
export function isObjectiveDone(o: Objective, s: GameState, r: Rates): boolean {
  const [c, g] = o.progress(s, r);
  return c >= g;
}
