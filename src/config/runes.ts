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
  { id: 'epic', name: 'Épique', oneIn: 90, color: 0x9a5ae6, css: '#7a3fc7', celebrate: 2, keptOnPrestige: false },
  { id: 'legendary', name: 'Légendaire', oneIn: 1_200, color: 0xf0b020, css: '#c08510', celebrate: 3, keptOnPrestige: true },
  { id: 'mythic', name: 'Mythique', oneIn: 30_000, color: 0xf04a64, css: '#c42e4a', celebrate: 4, keptOnPrestige: true },
  { id: 'celestial', name: 'Céleste', oneIn: 1_000_000, color: 0x7ff6ff, css: '#16a3b8', celebrate: 4, keptOnPrestige: true },
];

export const RARITY_INDEX: Record<RarityId, number> = Object.fromEntries(RARITIES.map((r, i) => [r.id, i])) as Record<RarityId, number>;

/** What a rune does. Values are per copy; copies stack with `stackCurve`. */
export type RuneStat = 'prod' | 'click' | 'speed' | 'luck' | 'offline' | 'cost' | 'lumen' | 'crit' | 'seeds' | 'bulk' | 'frag' | 'pet';

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
  frag: 'fragments de rune',
  pet: 'force des familiers',
};

/** Hard caps so stacking never breaks the game. */
export const STAT_CAP: Partial<Record<RuneStat, number>> = {
  cost: 0.6, // at most −60 % on machine costs
  crit: 0.5, // at most 50 % critical strikes
  speed: 1.5, // at most +150 % swing speed
  offline: 2, // at most +200 % offline gains
  seeds: 1, // at most +100 % star seeds
};

/** Total bonus of `count` copies = perCopy × count^STACK_EXP (duplicates always help, with diminishing returns). */
export const STACK_EXP = 0.6;

export type FamilyId = 'stone' | 'ember' | 'mist' | 'star' | 'moon' | 'warden';

/** Gameplay effects of some mythic runes (beyond a percentage). */
export type RuneSpecial = 'echo' | 'phoenix' | 'eclipse';

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
  /** Unique gameplay effect (mythic runes). */
  special?: RuneSpecial;
  /** Player-facing explanation of the special effect. */
  specialText?: string;
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
  /** Physical altar (none: the family drops from guardians). */
  altar: V2 | null;
  /** Only rolls at night. */
  nightOnly?: boolean;
}

export const FAMILIES: Record<FamilyId, FamilyDef> = {
  stone: { id: 'stone', zone: 'home', name: 'Runes de Pierre', altarName: 'Autel de Pierre', blurb: 'Production et coups de pioche.', rollCost: { shards: 60 }, color: 0xc99a6c, css: '#9e6d50', altar: [-9.2, 0.6] },
  ember: { id: 'ember', zone: 'forge', name: 'Runes de Braise', altarName: 'Autel de Braise', blurb: 'Lumen, coups critiques et coûts réduits.', rollCost: { lumen: 8 }, color: 0xff7a3d, css: '#c4521e', altar: [38.5, 1.6] },
  mist: { id: 'mist', zone: 'geyser', name: 'Runes de Brume', altarName: 'Autel de Brume', blurb: 'Chance, vitesse et gains hors ligne.', rollCost: { shards: 25_000 }, color: 0x6fe0d0, css: '#1d8a80', altar: [-40, -1.6] },
  star: { id: 'star', zone: 'sky', name: 'Runes d’Astre', altarName: 'Autel d’Astre', blurb: 'Production immense et graines d’étoile.', rollCost: { lumen: 400 }, color: 0xc59bff, css: '#6f45b8', altar: [-2.6, -43] },
  moon: { id: 'moon', zone: 'home', name: 'Runes de Lune', altarName: 'Autel de Lune', blurb: 'Chance et production. Ne s’éveille que la nuit.', rollCost: { lumen: 90 }, color: 0x9fb4ff, css: '#4b5fb0', altar: [-5.6, 12.6], nightOnly: true },
  warden: { id: 'warden', zone: 'forge', name: 'Runes de Gardien', altarName: 'Butin des gardiens', blurb: 'Coups, critiques et fragments. Tombent des gardiens de cristal.', rollCost: {}, color: 0xff7aa8, css: '#b8406a', altar: null },
};

export const FAMILY_ORDER: FamilyId[] = ['stone', 'ember', 'mist', 'star', 'moon', 'warden'];
/** Families with a physical altar where the player rolls. */
export const ALTAR_FAMILIES: FamilyId[] = FAMILY_ORDER.filter((f) => FAMILIES[f].altar !== null);

const r = (family: FamilyId, rarity: RarityId, id: string, name: string, stat: RuneStat, value: number, stat2?: RuneStat, value2?: number, special?: RuneSpecial, specialText?: string): RuneDef => ({ id, family, rarity, name, stat, value, stat2, value2, special, specialText });

export const RUNES: RuneDef[] = [
  // Pierre — production & coups
  r('stone', 'common', 'st1', 'Caillou', 'prod', 0.006),
  r('stone', 'uncommon', 'st2', 'Pic', 'click', 0.03),
  r('stone', 'rare', 'st3', 'Veine', 'prod', 0.02),
  r('stone', 'epic', 'st4', 'Géode', 'speed', 0.04),
  r('stone', 'legendary', 'st5', 'Cœur de pierre', 'prod', 0.15),
  r('stone', 'mythic', 'st6', 'Écho de la montagne', 'click', 1.5, 'prod', 0.3, 'echo', 'Chaque coup de pioche résonne : un second impact, une demi-seconde plus tard, à 50 %.'),
  r('stone', 'celestial', 'st7', 'Titan de l’aube', 'prod', 2),
  // Braise — Lumen, critiques, coûts
  r('ember', 'common', 'em1', 'Étincelle', 'lumen', 0.01),
  r('ember', 'uncommon', 'em2', 'Tison', 'crit', 0.004),
  r('ember', 'rare', 'em3', 'Creuset', 'lumen', 0.03),
  r('ember', 'epic', 'em4', 'Forge vive', 'cost', 0.015),
  r('ember', 'legendary', 'em5', 'Salamandre', 'crit', 0.03, 'lumen', 0.15),
  r('ember', 'mythic', 'em6', 'Phénix', 'lumen', 1.5, 'prod', 0.3, 'phoenix', 'Un coup critique embrase la pioche : les 3 coups suivants sont critiques.'),
  r('ember', 'celestial', 'em7', 'Soleil captif', 'prod', 3),
  // Brume — chance, vitesse, hors ligne
  r('mist', 'common', 'mi1', 'Rosée', 'offline', 0.015),
  r('mist', 'uncommon', 'mi2', 'Vapeur', 'speed', 0.015),
  r('mist', 'rare', 'mi3', 'Source', 'luck', 0.03),
  r('mist', 'epic', 'mi4', 'Geyser', 'offline', 0.1),
  r('mist', 'legendary', 'mi5', 'Marée d’éther', 'luck', 0.2),
  r('mist', 'mythic', 'mi6', 'Grand Courant', 'bulk', 1, 'luck', 0.4),
  r('mist', 'celestial', 'mi7', 'Océan de nuages', 'luck', 2),
  // Astre — production immense, graines
  r('star', 'common', 'sa1', 'Poussière d’étoile', 'prod', 0.01),
  r('star', 'uncommon', 'sa2', 'Comète', 'seeds', 0.008),
  r('star', 'rare', 'sa3', 'Constellation', 'prod', 0.04),
  r('star', 'epic', 'sa4', 'Nébuleuse', 'seeds', 0.05),
  r('star', 'legendary', 'sa5', 'Aurore', 'prod', 0.4),
  r('star', 'mythic', 'sa6', 'Supernova', 'seeds', 0.5, 'prod', 0.6),
  r('star', 'celestial', 'sa7', 'Œil du Phare', 'prod', 6, 'luck', 1),
  // Lune — chance, production ; tirée seulement la nuit
  r('moon', 'common', 'mo1', 'Lueur', 'luck', 0.02),
  r('moon', 'uncommon', 'mo2', 'Reflet', 'offline', 0.03),
  r('moon', 'rare', 'mo3', 'Croissant', 'prod', 0.02),
  r('moon', 'epic', 'mo4', 'Marée haute', 'luck', 0.12),
  r('moon', 'legendary', 'mo5', 'Pleine lune', 'prod', 0.2, 'luck', 0.2),
  r('moon', 'mythic', 'mo6', 'Éclipse', 'luck', 0.5, 'prod', 0.3, 'eclipse', 'La nuit dure deux fois plus longtemps.'),
  r('moon', 'celestial', 'mo7', 'Lune d’argent', 'prod', 4, 'luck', 1),
  // Gardien — coups, critiques, fragments ; tombent des gardiens de cristal
  r('warden', 'common', 'wa1', 'Éclat de golem', 'click', 0.03),
  r('warden', 'uncommon', 'wa2', 'Poing de quartz', 'crit', 0.004),
  r('warden', 'rare', 'wa3', 'Cœur fêlé', 'frag', 0.05),
  r('warden', 'epic', 'wa4', 'Bouclier de cristal', 'click', 0.12),
  r('warden', 'legendary', 'wa5', 'Œil du gardien', 'frag', 0.3, 'crit', 0.02),
  r('warden', 'mythic', 'wa6', 'Colosse éveillé', 'click', 1.5, 'frag', 0.5),
  r('warden', 'celestial', 'wa7', 'Titan de cristal', 'prod', 3, 'frag', 1),
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
  { id: 'luck', name: 'Chance', desc: '+20 % de chance de rune par niveau', base: { shards: 600 }, growth: 3.2, max: 25 },
  { id: 'bulk', name: 'Charge', desc: '+1 rune par tirage par niveau', base: { shards: 4000, lumen: 10 }, growth: 9, max: 4 },
  { id: 'speed', name: 'Cadence', desc: 'Tirages 15 % plus rapides par niveau', base: { shards: 1500 }, growth: 3.5, max: 10 },
  { id: 'auto', name: 'Tirage automatique', desc: 'L’autel tire tout seul, même quand tu es ailleurs (au plus 10 % de ta production)', base: { lumen: 120 }, growth: 1, max: 1 },
];

/** Fusion at the Creuset runique: FUSE.copies of a rune + fragments → one rune of the next rarity. */
export const FUSE = {
  copies: 5,
  /** Fragments by input rarity (common → uncommon … epic → legendary). Higher rarities cannot be fused. */
  fragments: [2, 5, 15, 60] as number[],
};

/** Pity: after this many rolls without an epic (or better), the next roll guarantees one. */
export const PITY = { epic: 100, legendary: 1000 };

/** Rune sets: owning every listed piece grants the bonus. */
export interface SetPiece {
  /** A specific rune… */
  rune?: string;
  /** …or any rune of this family at this rarity or better. */
  family?: FamilyId;
  minRarity?: RarityId;
}
export interface RuneSetDef {
  id: string;
  name: string;
  pieces: SetPiece[];
  stat: RuneStat;
  value: number;
}
const any = (family: FamilyId, minRarity: RarityId): SetPiece => ({ family, minRarity });
const rn = (rune: string): SetPiece => ({ rune });
export const RUNE_SETS: RuneSetDef[] = [
  { id: 'elements', name: 'Quatre éléments', pieces: [any('stone', 'rare'), any('ember', 'rare'), any('mist', 'rare'), any('star', 'rare')], stat: 'prod', value: 0.1 },
  { id: 'quarry', name: 'Carrière', pieces: [rn('st1'), rn('st2'), rn('st3'), rn('st4')], stat: 'click', value: 0.15 },
  { id: 'forge', name: 'Forge ardente', pieces: [rn('em3'), rn('em4'), rn('st4')], stat: 'crit', value: 0.02 },
  { id: 'tides', name: 'Marées', pieces: [rn('mi3'), rn('mi4'), rn('mi5')], stat: 'offline', value: 0.4 },
  { id: 'night', name: 'Nuit étoilée', pieces: [rn('mo3'), rn('sa3')], stat: 'luck', value: 0.15 },
  { id: 'warden', name: 'Garde de cristal', pieces: [rn('wa1'), rn('wa2'), rn('wa3'), rn('wa4')], stat: 'frag', value: 0.25 },
  { id: 'vault', name: 'Voûte céleste', pieces: [rn('sa1'), rn('sa2'), rn('sa3'), rn('sa4')], stat: 'seeds', value: 0.05 },
  { id: 'cycle', name: 'Grand cycle', pieces: [rn('st5'), rn('mo5'), rn('sa5')], stat: 'prod', value: 0.5 },
];

export const ROLL = {
  /** Each roll of a family multiplies its next price by this (reset on prestige). */
  costGrowth: 1.018,
  /** Seconds between two rolls before Cadence upgrades. */
  baseCooldown: 0.9,
  speedFactor: 0.85,
  minCooldown: 0.12,
  /** Luck per altar "Chance" level. */
  luckPerLevel: 0.2,
  /** Luck bonus per star seed. */
  luckPerSeed: 0.02,
};
