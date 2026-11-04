/**
 * Rune system data (single source of truth, like economy.ts).
 *
 * Mechanics inspired by Roblox incrementals (pools per area, rarity table up to
 * ~1 in a million, luck that pushes rare tiers, bulk / speed / auto-roll,
 * stacking duplicates, index). Names, effects and visuals are original.
 */
import type { Cost, ZoneId } from './economy';
import type { V2 } from './world';

export type RarityId = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary' | 'mythic' | 'celestial';

export interface RarityDef {
  id: RarityId;
  name: string;
  /** Base odds: 1 in `oneIn`. The common tier takes whatever is left. */
  oneIn: number;
  color: number;
  /** CSS colour (UI). */
  css: string;
  /** 0 = no fanfare … 4 = full celebration. */
  celebrate: 0 | 1 | 2 | 3 | 4;
  /** Survives a prestige (see DECISIONS.md). */
  keptOnPrestige: boolean;
}

export const RARITIES: RarityDef[] = [
  { id: 'common', name: 'Commune', oneIn: 1, color: 0xa39a90, css: '#8c8178', celebrate: 0, keptOnPrestige: false },
  { id: 'uncommon', name: 'Peu commune', oneIn: 5, color: 0x5fae5a, css: '#3f8a43', celebrate: 0, keptOnPrestige: false },
  { id: 'rare', name: 'Rare', oneIn: 14, color: 0x3d8de0, css: '#2a6fbd', celebrate: 1, keptOnPrestige: false },
  { id: 'epic', name: 'Épique', oneIn: 90, color: 0x9a5ae6, css: '#7a3fc7', celebrate: 2, keptOnPrestige: true },
  { id: 'legendary', name: 'Légendaire', oneIn: 1_200, color: 0xf0b020, css: '#c08510', celebrate: 3, keptOnPrestige: true },
  { id: 'mythic', name: 'Mythique', oneIn: 30_000, color: 0xf04a64, css: '#c42e4a', celebrate: 4, keptOnPrestige: true },
  { id: 'celestial', name: 'Céleste', oneIn: 1_000_000, color: 0x7ff6ff, css: '#16a3b8', celebrate: 4, keptOnPrestige: true },
];

export const RARITY_INDEX: Record<RarityId, number> = Object.fromEntries(RARITIES.map((r, i) => [r.id, i])) as Record<RarityId, number>;

/** What a rune does. Values are per copy; copies stack with `stackCurve`. */
export type RuneStat = 'prod' | 'click' | 'speed' | 'luck' | 'offline' | 'cost' | 'lumen' | 'crit' | 'seeds' | 'bulk';

export const STAT_LABEL: Record<RuneStat, string> = {
  prod: 'production',
  click: 'valeur des coups',
  speed: 'vitesse de frappe',
  luck: 'chance de rune',
  offline: 'gains hors ligne',
  cost: 'coût des machines',
  lumen: 'production de Lumen',
  crit: 'chance de coup critique',
  seeds: 'graines au prestige',
  bulk: 'runes par tirage',
};

/** Hard caps so stacking never breaks the game. */
export const STAT_CAP: Partial<Record<RuneStat, number>> = {
  cost: 0.6, // at most −60 % on machine costs
  crit: 0.5, // at most 50 % critical strikes
  speed: 1.5, // at most +150 % swing speed
  offline: 2, // at most +200 % offline gains
};

/** Total bonus of `count` copies = perCopy × count^STACK_EXP (duplicates always help, with diminishing returns). */
export const STACK_EXP = 0.8;

export type FamilyId = 'stone' | 'ember' | 'mist' | 'star';

export interface RuneDef {
  id: string;
  family: FamilyId;
  rarity: RarityId;
  name: string;
  stat: RuneStat;
  /** Per-copy bonus (0.01 = +1 %; for bulk: +1 rune). */
  value: number;
  /** Optional second effect (the rarest runes). */
  stat2?: RuneStat;
  value2?: number;
}

export interface FamilyDef {
  id: FamilyId;
  zone: ZoneId;
  name: string;
  altarName: string;
  blurb: string;
  /** Cost of ONE roll (bulk multiplies the runes, not the cost). */
  rollCost: Cost;
  color: number;
  css: string;
  altar: V2;
}

export const FAMILIES: Record<FamilyId, FamilyDef> = {
  stone: { id: 'stone', zone: 'home', name: 'Runes de Pierre', altarName: 'Autel de Pierre', blurb: 'Production et coups de pioche.', rollCost: { shards: 60 }, color: 0xc99a6c, css: '#9e6d50', altar: [-9.2, 0.6] },
  ember: { id: 'ember', zone: 'forge', name: 'Runes de Braise', altarName: 'Autel de Braise', blurb: 'Lumen, coups critiques et coûts réduits.', rollCost: { lumen: 8 }, color: 0xff7a3d, css: '#c4521e', altar: [38.5, 1.6] },
  mist: { id: 'mist', zone: 'geyser', name: 'Runes de Brume', altarName: 'Autel de Brume', blurb: 'Chance, vitesse et gains hors ligne.', rollCost: { shards: 25_000 }, color: 0x6fe0d0, css: '#1d8a80', altar: [-40, -1.6] },
  star: { id: 'star', zone: 'sky', name: 'Runes d’Astre', altarName: 'Autel d’Astre', blurb: 'Production immense et graines d’étoile.', rollCost: { lumen: 400 }, color: 0xc59bff, css: '#6f45b8', altar: [-2.6, -43] },
};

export const FAMILY_ORDER: FamilyId[] = ['stone', 'ember', 'mist', 'star'];

const r = (family: FamilyId, rarity: RarityId, id: string, name: string, stat: RuneStat, value: number, stat2?: RuneStat, value2?: number): RuneDef => ({ id, family, rarity, name, stat, value, stat2, value2 });

export const RUNES: RuneDef[] = [
  // Pierre — production & coups
  r('stone', 'common', 'st1', 'Caillou', 'prod', 0.01),
  r('stone', 'uncommon', 'st2', 'Pic', 'click', 0.04),
  r('stone', 'rare', 'st3', 'Veine', 'prod', 0.04),
  r('stone', 'epic', 'st4', 'Géode', 'speed', 0.05),
  r('stone', 'legendary', 'st5', 'Cœur de pierre', 'prod', 0.3),
  r('stone', 'mythic', 'st6', 'Montagne endormie', 'click', 3, 'prod', 0.5),
  r('stone', 'celestial', 'st7', 'Titan de l’aube', 'prod', 4),
  // Braise — Lumen, critiques, coûts
  r('ember', 'common', 'em1', 'Étincelle', 'lumen', 0.015),
  r('ember', 'uncommon', 'em2', 'Tison', 'crit', 0.004),
  r('ember', 'rare', 'em3', 'Creuset', 'lumen', 0.06),
  r('ember', 'epic', 'em4', 'Forge vive', 'cost', 0.02),
  r('ember', 'legendary', 'em5', 'Salamandre', 'crit', 0.04, 'lumen', 0.3),
  r('ember', 'mythic', 'em6', 'Phénix', 'lumen', 3, 'prod', 0.6),
  r('ember', 'celestial', 'em7', 'Soleil captif', 'prod', 6),
  // Brume — chance, vitesse, hors ligne
  r('mist', 'common', 'mi1', 'Rosée', 'offline', 0.02),
  r('mist', 'uncommon', 'mi2', 'Vapeur', 'speed', 0.02),
  r('mist', 'rare', 'mi3', 'Source', 'luck', 0.04),
  r('mist', 'epic', 'mi4', 'Geyser', 'offline', 0.12),
  r('mist', 'legendary', 'mi5', 'Marée d’éther', 'luck', 0.3),
  r('mist', 'mythic', 'mi6', 'Grand Courant', 'bulk', 1, 'luck', 0.5),
  r('mist', 'celestial', 'mi7', 'Océan de nuages', 'luck', 2.5),
  // Astre — production immense, graines
  r('star', 'common', 'sa1', 'Poussière d’étoile', 'prod', 0.02),
  r('star', 'uncommon', 'sa2', 'Comète', 'seeds', 0.01),
  r('star', 'rare', 'sa3', 'Constellation', 'prod', 0.08),
  r('star', 'epic', 'sa4', 'Nébuleuse', 'seeds', 0.06),
  r('star', 'legendary', 'sa5', 'Aurore', 'prod', 0.8),
  r('star', 'mythic', 'sa6', 'Supernova', 'seeds', 0.6, 'prod', 1),
  r('star', 'celestial', 'sa7', 'Œil du Phare', 'prod', 12, 'luck', 1),
];

export const RUNE_BY_ID = new Map(RUNES.map((x) => [x.id, x]));

/** Altar upgrades (shared by all altars). Costs grow exponentially per level. */
export interface AltarUpgradeDef {
  id: 'luck' | 'bulk' | 'speed' | 'auto';
  name: string;
  desc: string;
  base: Cost;
  growth: number;
  max: number;
}

export const ALTAR_UPGRADES: AltarUpgradeDef[] = [
  { id: 'luck', name: 'Chance', desc: '+20 % de chance de rune par niveau', base: { shards: 400 }, growth: 1.9, max: 40 },
  { id: 'bulk', name: 'Charge', desc: '+1 rune par tirage par niveau', base: { shards: 1500 }, growth: 2.6, max: 9 },
  { id: 'speed', name: 'Cadence', desc: 'Tirages 15 % plus rapides par niveau', base: { shards: 800 }, growth: 2.1, max: 12 },
  { id: 'auto', name: 'Tirage automatique', desc: 'L’autel tire tout seul, même quand tu es ailleurs', base: { lumen: 120 }, growth: 1, max: 1 },
];

export const ROLL = {
  /** Seconds between two rolls before Cadence upgrades. */
  baseCooldown: 0.9,
  speedFactor: 0.85,
  minCooldown: 0.12,
  /** Luck per altar "Chance" level. */
  luckPerLevel: 0.2,
  /** Luck bonus per star seed. */
  luckPerSeed: 0.03,
};
