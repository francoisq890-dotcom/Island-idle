/**
 * Achievements: each one grants a small PERMANENT bonus (kept through prestige).
 * Conditions read lifetime stats so they are fair after a prestige.
 */
import { RARITY_INDEX, RUNES, type RuneStat } from './runes';
import type { GameState } from '../economy/state';

export interface AchievementDef {
  id: string;
  name: string;
  desc: string;
  stat: RuneStat;
  value: number;
  /** Progress [current, goal]. */
  progress: (s: GameState) => [number, number];
  /** Hidden until unlocked. */
  secret?: boolean;
}

const distinctRunes = (s: GameState) => Object.keys(s.runes).filter((k) => s.runes[k] > 0).length;
const m = (id: 'drill' | 'excavator' | 'refinery' | 'geyser' | 'prism', n: number) => (s: GameState): [number, number] => [s.machines[id], n];

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'firstHit', name: 'Premier coup', desc: 'Frapper le cristal une fois', stat: 'prod', value: 0.01, progress: (s) => [s.stats.allTimeHarvests, 1] },
  { id: 'hits500', name: 'Mineur assidu', desc: '500 coups de pioche', stat: 'click', value: 0.1, progress: (s) => [s.stats.allTimeHarvests, 500] },
  { id: 'hits5000', name: 'Bras de fer', desc: '5 000 coups de pioche', stat: 'click', value: 0.25, progress: (s) => [s.stats.allTimeHarvests, 5000] },
  { id: 'crits25', name: 'Coup de maître', desc: '25 coups critiques', stat: 'crit', value: 0.01, progress: (s) => [s.counters.crits, 25] },
  { id: 'drill10', name: 'Contremaître', desc: '10 foreuses en même temps', stat: 'prod', value: 0.02, progress: m('drill', 10) },
  { id: 'drill50', name: 'Forêt de foreuses', desc: '50 foreuses en même temps', stat: 'prod', value: 0.05, progress: m('drill', 50) },
  { id: 'drill100', name: 'Cent derricks', desc: '100 foreuses en même temps', stat: 'prod', value: 0.1, progress: m('drill', 100) },
  { id: 'exc25', name: 'Terrassier', desc: '25 excavatrices', stat: 'prod', value: 0.03, progress: m('excavator', 25) },
  { id: 'ref1', name: 'Alchimiste', desc: 'Première raffinerie', stat: 'lumen', value: 0.05, progress: m('refinery', 1) },
  { id: 'ref25', name: 'Maître forgeron', desc: '25 raffineries', stat: 'lumen', value: 0.1, progress: m('refinery', 25) },
  { id: 'gey10', name: 'Faiseur de sources', desc: '10 geysers d’éther', stat: 'prod', value: 0.05, progress: m('geyser', 10) },
  { id: 'pri10', name: 'Prisme parfait', desc: '10 prismes solaires', stat: 'prod', value: 0.08, progress: m('prism', 10) },
  { id: 'zones', name: 'Bâtisseur de ponts', desc: 'Relier les quatre îles', stat: 'prod', value: 0.05, progress: (s) => [Object.values(s.zones).filter(Boolean).length, 4] },
  { id: 'shard1m', name: 'Millionnaire', desc: '1M éclats récoltés au total', stat: 'prod', value: 0.02, progress: (s) => [s.stats.allTimeShards, 1e6] },
  { id: 'shard1b', name: 'Milliardaire', desc: '1B éclats récoltés au total', stat: 'prod', value: 0.05, progress: (s) => [s.stats.allTimeShards, 1e9] },
  { id: 'shard1t', name: 'Mer de cristal', desc: '1T éclats récoltés au total', stat: 'prod', value: 0.1, progress: (s) => [s.stats.allTimeShards, 1e12] },
  { id: 'roll1', name: 'Premier tirage', desc: 'Tirer une rune', stat: 'luck', value: 0.05, progress: (s) => [s.runeStats.rolls, 1] },
  { id: 'roll500', name: 'Joueur invétéré', desc: '500 tirages', stat: 'luck', value: 0.1, progress: (s) => [s.runeStats.rolls, 500] },
  { id: 'distinct10', name: 'Collectionneur', desc: '10 runes différentes', stat: 'luck', value: 0.1, progress: (s) => [distinctRunes(s), 10] },
  { id: 'gotRare', name: 'Belle trouvaille', desc: 'Obtenir une rune rare', stat: 'luck', value: 0.05, progress: (s) => [Math.max(0, s.runeStats.best - RARITY_INDEX.rare + 1), 1] },
  { id: 'gotEpic', name: 'Épopée', desc: 'Obtenir une rune épique', stat: 'luck', value: 0.1, progress: (s) => [Math.max(0, s.runeStats.best - RARITY_INDEX.epic + 1), 1] },
  { id: 'gotLeg', name: 'Légende vivante', desc: 'Obtenir une rune légendaire', stat: 'prod', value: 0.1, progress: (s) => [Math.max(0, s.runeStats.best - RARITY_INDEX.legendary + 1), 1] },
  { id: 'gotMyth', name: 'Mythe', desc: 'Obtenir une rune mythique', stat: 'prod', value: 0.25, progress: (s) => [Math.max(0, s.runeStats.best - RARITY_INDEX.mythic + 1), 1], secret: true },
  { id: 'gotCel', name: 'Touché par le ciel', desc: 'Obtenir une rune céleste', stat: 'prod', value: 1, progress: (s) => [Math.max(0, s.runeStats.best - RARITY_INDEX.celestial + 1), 1], secret: true },
  { id: 'meteor25', name: 'Chasseur d’étoiles filantes', desc: 'Ramasser 25 météores de cristal', stat: 'prod', value: 0.03, progress: (s) => [s.counters.meteors, 25] },
  { id: 'golden1', name: 'Fièvre de l’or', desc: 'Briser un cristal doré', stat: 'click', value: 0.1, progress: (s) => [s.counters.golden, 1] },
  { id: 'golden10', name: 'Orpailleur', desc: 'Briser 10 cristaux dorés', stat: 'click', value: 0.25, progress: (s) => [s.counters.golden, 10] },
  { id: 'pick6', name: 'L’Aube à la main', desc: 'Forger la Pioche de l’Aube', stat: 'speed', value: 0.1, progress: (s) => [s.upgrades.pick6 ? 1 : 0, 1] },
  { id: 'prest1', name: 'Première descente', desc: 'Faire descendre une île', stat: 'seeds', value: 0.05, progress: (s) => [s.stats.prestiges, 1] },
  { id: 'prest5', name: 'Voyageur des nuées', desc: 'Faire descendre 5 îles', stat: 'seeds', value: 0.1, progress: (s) => [s.stats.prestiges, 5] },
  { id: 'seeds100', name: 'Couronne d’étoiles', desc: 'Gagner 100 graines d’étoile au total', stat: 'prod', value: 0.25, progress: (s) => [s.lifetimeSeeds, 100] },
  { id: 'index', name: 'Le Grand Index', desc: 'Trouver les 28 runes', stat: 'prod', value: 2, progress: (s) => [distinctRunes(s), RUNES.length], secret: true },
];
