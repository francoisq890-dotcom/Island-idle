/**
 * Achievements v2 (iteration 3): 62 achievements in 6 categories, most with
 * three tiers (bronze, silver, gold). Every tier grants a small PERMANENT bonus
 * (kept through prestige and Ascension). Progress reads lifetime counters so it
 * is fair after a prestige. Hidden achievements show "???" until unlocked.
 */
import { MACHINE_ORDER, MILESTONES, UPGRADES, type MachineId } from './economy';
import { RARITY_INDEX, RUNES, type RuneStat } from './runes';
import type { GameState } from '../economy/state';

export type AchCategory = 'harvest' | 'machines' | 'runes' | 'prestige' | 'explore' | 'secret';

export const ACH_CATEGORIES: { id: AchCategory; name: string }[] = [
  { id: 'harvest', name: 'Récolte' },
  { id: 'machines', name: 'Machines' },
  { id: 'runes', name: 'Runes' },
  { id: 'prestige', name: 'Prestige' },
  { id: 'explore', name: 'Exploration' },
  { id: 'secret', name: 'Secrets' },
];

export const TIER_NAMES = ['Bronze', 'Argent', 'Or'];

/** How a goal is written in the UI. */
export type GoalFormat = 'num' | 'time' | 'dist' | 'rarity' | 'plain';

export interface AchievementDef {
  id: string;
  cat: AchCategory;
  name: string;
  /** Description; `{n}` is replaced by the goal of the next tier. */
  desc: string;
  stat: RuneStat;
  /** Reward of each tier (cumulative: tier 2 adds values[1] on top of values[0]). */
  values: number[];
  /** Goal of each tier (1 to 3 tiers). */
  goals: number[];
  /** Current measure. */
  value: (s: GameState) => number;
  /** Lower is better (records like "fastest island"); 0 = no record yet. */
  lower?: boolean;
  /** Hidden until the first tier is unlocked. */
  secret?: boolean;
  fmt?: GoalFormat;
}

const machines = (id: MachineId) => (s: GameState) => s.machines[id];
const c = (k: keyof GameState['counters']) => (s: GameState) => s.counters[k];
const flag = (k: string) => (s: GameState) => (s.flags[k] ? 1 : 0);
const totalMachines = (s: GameState) => MACHINE_ORDER.reduce((a, id) => a + s.machines[id], 0);
const milestones = (s: GameState) => MACHINE_ORDER.reduce((a, id) => a + MILESTONES.filter((m) => s.machines[id] >= m).length, 0);
const pickTier = (s: GameState) => ['pick1', 'pick2', 'pick3', 'pick4', 'pick5', 'pick6'].filter((id) => s.upgrades[id]).length;
const synergies = (s: GameState) => UPGRADES.filter((u) => s.upgrades[u.id] && u.effects.some((e) => e.type === 'synergy')).length;
export const distinctRunes = (s: GameState) => RUNES.filter((r) => s.runeIndex[r.id]).length;

type Opt = Partial<Pick<AchievementDef, 'lower' | 'secret' | 'fmt'>>;
const a = (cat: AchCategory, id: string, name: string, desc: string, stat: RuneStat, values: number[], goals: number[], value: (s: GameState) => number, o: Opt = {}): AchievementDef => ({ id, cat, name, desc, stat, values, goals, value, ...o });

const P = [0.01, 0.02, 0.03];
const P2 = [0.02, 0.03, 0.05];

export const ACHIEVEMENTS: AchievementDef[] = [
  // --- Récolte ---------------------------------------------------------------
  a('harvest', 'hits', 'Bras de fer', 'Donner {n} coups de pioche', 'click', [0.03, 0.05, 0.08], [100, 2500, 25000], (s) => s.stats.allTimeHarvests),
  a('harvest', 'crits', 'Coup de maître', 'Réussir {n} coups critiques', 'crit', [0.005, 0.01, 0.015], [10, 250, 2500], c('crits')),
  a('harvest', 'combo', 'Cadence infernale', 'Enchaîner une série de {n} coups', 'click', [0.03, 0.05, 0.08], [25, 75, 200], c('bestCombo')),
  a('harvest', 'bigHit', 'Coup de tonnerre', 'Récolter {n} éclats d’un seul coup', 'click', [0.03, 0.05, 0.08], [1e3, 1e6, 1e9], c('bestHit')),
  a('harvest', 'shards', 'Mer de cristal', 'Récolter {n} éclats au total', 'prod', P2, [1e6, 1e9, 1e12], (s) => s.stats.allTimeShards),
  a('harvest', 'lumen', 'Feuille d’or', 'Produire {n} Lumen au total', 'lumen', [0.03, 0.05, 0.08], [1e3, 1e6, 1e9], (s) => s.stats.allTimeLumen),
  a('harvest', 'rate', 'Usine volante', 'Atteindre {n} éclats par seconde', 'prod', P2, [1e3, 1e6, 1e9], c('bestRate')),
  a('harvest', 'golden', 'Orpailleur', 'Briser {n} cristaux dorés', 'click', [0.05, 0.08, 0.1], [1, 10, 50], c('golden')),
  a('harvest', 'meteors', 'Chasseur d’étoiles filantes', 'Ramasser {n} météores', 'prod', P, [10, 75, 400], c('meteors')),
  a('harvest', 'guardians', 'Tailleur de golems', 'Vaincre {n} gardiens de cristal', 'frag', [0.05, 0.1, 0.15], [1, 10, 50], c('guardians')),
  a('harvest', 'guardFast', 'Éclair de cristal', 'Vaincre un gardien en moins de {n}', 'click', [0.04, 0.06, 0.1], [20, 12, 7], c('guardFast'), { lower: true, fmt: 'time' }),

  // --- Machines --------------------------------------------------------------
  a('machines', 'drill', 'Forêt de foreuses', 'Posséder {n} foreuses en même temps', 'prod', P, [25, 100, 200], machines('drill')),
  a('machines', 'excavator', 'Terrassier', 'Posséder {n} excavatrices', 'prod', P, [25, 75, 150], machines('excavator')),
  a('machines', 'refinery', 'Maître forgeron', 'Posséder {n} raffineries', 'lumen', [0.03, 0.05, 0.08], [10, 50, 100], machines('refinery')),
  a('machines', 'geyser', 'Faiseur de sources', 'Posséder {n} geysers d’éther', 'prod', P, [10, 50, 100], machines('geyser')),
  a('machines', 'prism', 'Prisme parfait', 'Posséder {n} prismes solaires', 'prod', P, [10, 50, 100], machines('prism')),
  a('machines', 'total', 'Archipel industriel', 'Posséder {n} machines sur une île', 'prod', P2, [100, 300, 600], totalMachines),
  a('machines', 'upgrades', 'Ingénieur en chef', 'Posséder {n} améliorations sur une île', 'prod', P, [10, 18, UPGRADES.length], (s) => Object.keys(s.upgrades).length),
  a('machines', 'milestones', 'Paliers franchis', 'Atteindre {n} paliers de machines sur une île', 'prod', P, [5, 15, 30], milestones),
  a('machines', 'pick', 'Pioches de légende', 'Forger {n} améliorations de pioche', 'speed', [0.03, 0.05, 0.08], [2, 4, 6], pickTier),
  a('machines', 'synergy', 'Tout est lié', 'Posséder {n} synergies entre machines', 'prod', P, [1, 2, 4], synergies),
  a('machines', 'zones', 'Bâtisseur de ponts', 'Relier {n} îles', 'prod', P, [2, 3, 4], (s) => Object.values(s.zones).filter(Boolean).length),

  // --- Runes -----------------------------------------------------------------
  a('runes', 'rolls', 'Joueur invétéré', 'Faire {n} tirages de runes', 'luck', [0.03, 0.05, 0.08], [10, 500, 5000], (s) => s.runeStats.rolls),
  a('runes', 'runesN', 'Sac de runes', 'Obtenir {n} runes au total', 'luck', [0.03, 0.05, 0.08], [100, 5000, 50000], (s) => s.runeStats.runes),
  a('runes', 'distinct', 'Collectionneur', 'Découvrir {n} runes différentes', 'prod', P2, [10, 25, RUNES.length], distinctRunes),
  a('runes', 'best', 'Belle trouvaille', 'Obtenir une rune {n}', 'luck', [0.04, 0.06, 0.1], [RARITY_INDEX.rare, RARITY_INDEX.epic, RARITY_INDEX.legendary], (s) => s.runeStats.best, { fmt: 'rarity' }),
  a('runes', 'mythic', 'Mythe', 'Obtenir une rune mythique', 'prod', [0.25], [1], (s) => (s.runeStats.best >= RARITY_INDEX.mythic ? 1 : 0), { secret: true }),
  a('runes', 'celestial', 'Touché par le ciel', 'Obtenir une rune céleste', 'prod', [1], [1], (s) => (s.runeStats.best >= RARITY_INDEX.celestial ? 1 : 0), { secret: true }),
  a('runes', 'fusions', 'Alchimiste des runes', 'Fusionner {n} fois au Creuset', 'frag', [0.05, 0.08, 0.1], [1, 25, 250], c('fusions')),
  a('runes', 'sets', 'Assortiment', 'Activer {n} bonus de set en même temps', 'luck', [0.04, 0.06, 0.1], [1, 3, 6], c('sets')),
  a('runes', 'families', 'Lignées complètes', 'Compléter {n} familles de runes (jusqu’à légendaire)', 'prod', [0.03, 0.05, 0.1], [1, 3, 6], c('families')),
  a('runes', 'nightRolls', 'Tireur nocturne', 'Faire {n} tirages la nuit', 'luck', [0.03, 0.05, 0.08], [25, 250, 2500], c('nightRolls')),
  a('runes', 'pity', 'La patience paie', 'Déclencher {n} fois la garantie de l’autel', 'luck', [0.03, 0.05, 0.08], [1, 5, 25], c('pity')),
  a('runes', 'index', 'Le Grand Index', 'Trouver toutes les runes', 'prod', [2], [RUNES.length], distinctRunes, { secret: true }),

  // --- Prestige --------------------------------------------------------------
  a('prestige', 'prestiges', 'Voyageur des nuées', 'Faire descendre {n} îles', 'seeds', [0.03, 0.05, 0.08], [1, 5, 25], (s) => s.stats.prestiges),
  a('prestige', 'lseeds', 'Couronne d’étoiles', 'Gagner {n} graines d’étoile au total', 'prod', [0.05, 0.08, 0.12], [50, 500, 5000], (s) => s.lifetimeSeeds),
  a('prestige', 'constel', 'Ciel allumé', 'Allumer {n} constellations', 'prod', P2, [3, 5, 7], c('constellations')),
  a('prestige', 'talents', 'Jardinier des étoiles', 'Planter {n} niveaux de talents', 'seeds', [0.03, 0.05, 0.08], [5, 15, 30], c('talents')),
  a('prestige', 'fastIsland', 'Île éclair', 'Faire descendre une île en moins de {n}', 'prod', P2, [1800, 900, 300], c('bestIsland'), { lower: true, fmt: 'time' }),
  a('prestige', 'bigGain', 'Grande moisson', 'Gagner {n} graines en une seule descente', 'seeds', [0.03, 0.05, 0.08], [50, 500, 5000], c('bestGain')),
  a('prestige', 'ascend', 'Au-dessus des nuages', 'Faire {n} Ascensions', 'prod', [0.1, 0.15, 0.25], [1, 3, 10], c('ascensions')),
  a('prestige', 'challenges', 'Épreuves', 'Réussir {n} défis', 'prod', [0.05, 0.08, 0.12], [1, 3, 5], c('challenges')),
  a('prestige', 'relics', 'Gardien des reliques', 'Posséder {n} reliques', 'luck', [0.05, 0.08, 0.1], [1, 3, 5], c('relics')),

  // --- Exploration -----------------------------------------------------------
  a('explore', 'distance', 'Arpenteur', 'Parcourir {n}', 'speed', [0.02, 0.03, 0.05], [1000, 10000, 50000], c('distance'), { fmt: 'dist' }),
  a('explore', 'jumps', 'Sauteur de nuages', 'Sauter {n} fois', 'speed', [0.02, 0.03, 0.05], [50, 500, 5000], c('jumps')),
  a('explore', 'nights', 'Veilleur', 'Voir tomber {n} nuits', 'luck', [0.03, 0.05, 0.08], [1, 10, 100], c('nights')),
  a('explore', 'pets', 'Ménagerie', 'Posséder {n} familiers', 'pet', [0.05, 0.08, 0.12], [1, 3, 6], c('pets')),
  a('explore', 'petLevel', 'Dresseur', 'Monter un familier au niveau {n}', 'pet', [0.05, 0.08, 0.12], [10, 25, 50], c('petLevel')),
  a('explore', 'expeditions', 'Capitaine de dirigeable', 'Terminer {n} expéditions', 'frag', [0.05, 0.08, 0.1], [1, 25, 250], c('expeditions')),
  a('explore', 'longExp', 'Grand voyage', 'Terminer {n} expéditions de 8 h', 'offline', [0.1, 0.15, 0.25], [1, 5, 25], c('longExpeditions')),
  a('explore', 'events', 'Témoin du ciel', 'Assister à {n} événements', 'prod', P, [5, 50, 250], c('eventsSeen')),
  a('explore', 'merchant', 'Bon client', 'Acheter {n} fois au marchand ambulant', 'lumen', [0.03, 0.05, 0.08], [1, 10, 50], c('merchant')),
  a('explore', 'rifts', 'Couturier du ciel', 'Refermer {n} failles d’éther', 'prod', P, [1, 10, 50], c('rifts')),
  a('explore', 'playtime', 'Habitant des îles', 'Jouer pendant {n}', 'offline', [0.1, 0.15, 0.25], [3600, 36000, 360000], (s) => s.stats.playSeconds, { fmt: 'time' }),

  // --- Secrets (single tier, hidden) -----------------------------------------
  a('secret', 'nightDescent', 'Descente sous les étoiles', 'Faire descendre une île en pleine nuit', 'seeds', [0.05], [1], flag('sec_nightDescent'), { secret: true }),
  a('secret', 'bunny', 'Lièvre des nuages', 'Sauter 15 fois en 10 secondes', 'speed', [0.05], [1], flag('sec_bunny'), { secret: true }),
  a('secret', 'stargazer', 'Contemplatif', 'Rester immobile une minute entière, la nuit', 'luck', [0.1], [1], flag('sec_stargazer'), { secret: true }),
  a('secret', 'patient', 'Retour au bercail', 'Revenir après plus de 8 heures d’absence', 'offline', [0.25], [1], flag('sec_patient'), { secret: true }),
  a('secret', 'doubleEvent', 'Coup double', 'Briser un cristal doré pendant une pluie de météores', 'click', [0.1], [1], flag('sec_doubleEvent'), { secret: true }),
  a('secret', 'dodger', 'Danseur', 'Éviter 5 ondes de choc pendant un même combat', 'speed', [0.05], [1], flag('sec_dodger'), { secret: true }),
  a('secret', 'miser', 'Avare', 'Amasser 25K éclats sans posséder d’excavatrice', 'prod', [0.03], [1], flag('sec_miser'), { secret: true }),
];

export const ACHIEVEMENT_BY_ID = new Map(ACHIEVEMENTS.map((x) => [x.id, x]));

/** Number of tiers of an achievement. */
export function tiersOf(def: AchievementDef): number {
  return def.goals.length;
}

/** Highest tier reached by the measure `v` (0 = none). */
export function tierFor(def: AchievementDef, v: number): number {
  let t = 0;
  for (const g of def.goals) {
    const ok = def.lower ? v > 0 && v <= g : v >= g;
    if (ok) t++;
    else break;
  }
  return t;
}

/** Total number of tiers in the game (for "x / y" counters). */
export const TOTAL_TIERS = ACHIEVEMENTS.reduce((n, d) => n + d.goals.length, 0);
