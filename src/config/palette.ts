/**
 * Restricted palette — warm sunset over a sea of clouds.
 * Raw crystal = cyan, refined Lumen = gold, prestige = violet. Everything else
 * stays in warm earth tones so the resources always pop.
 */
export const PALETTE = {
  skyTop: 0x5d74c9,
  skyMid: 0xa9a6e0,
  skyHorizon: 0xffc6a0,
  skyBelow: 0xf6d6c6,
  sun: 0xfff0d0,
  fog: 0xf2c9b4,
  cloud: 0xfff4ec,
  cloudShadow: 0xe9c9c9,

  dirt: 0xb8865a,
  rock1: 0xc99a6c,
  rock2: 0x9e6d50,
  rock3: 0x6b4a46,

  crystal: 0x52f0ff,
  crystalDeep: 0x2a9cd6,
  lumen: 0xffbe3b,
  seed: 0xc59bff,

  cream: 0xf3e7d4,
  copper: 0xd2774c,
  slate: 0x3b3552,
  steel: 0x8f8ca8,
  wood: 0xa8724b,
  woodDark: 0x76503a,

  leaf1: 0x6fb35a,
  leaf2: 0x4f9a55,
  leaf3: 0x93c45a,
  flowerA: 0xff8fa3,
  flowerB: 0xfff1a8,
  flowerC: 0xb69cff,
  lava: 0xff6a2b,
} as const;

/** Grass tints per zone (and per island generation, see prestige). */
export interface GrassTheme {
  grass: number;
  grassDark: number;
  grassLight: number;
  leaf: [number, number, number];
}

export const ZONE_GRASS: Record<'home' | 'forge' | 'geyser' | 'sky', GrassTheme> = {
  home: { grass: 0x8cc05a, grassDark: 0x6e9f45, grassLight: 0xa9d06c, leaf: [0x6fb35a, 0x4f9a55, 0x93c45a] },
  forge: { grass: 0xc4a35a, grassDark: 0xa27f45, grassLight: 0xd8bc72, leaf: [0xd98d45, 0xc46a3c, 0xe8b45a] },
  geyser: { grass: 0x6dbf9a, grassDark: 0x4f9f80, grassLight: 0x8fd6b0, leaf: [0x4fae8d, 0x3b8f7a, 0x7cc9a0] },
  sky: { grass: 0xbfb2ea, grassDark: 0x9d8fd6, grassLight: 0xd9cff5, leaf: [0xf2b5d4, 0xe48fbb, 0xffd6e8] },
};

/** After each prestige the home island grows back with a new season. */
export const HOME_SEASONS: GrassTheme[] = [
  ZONE_GRASS.home,
  { grass: 0xd9a65a, grassDark: 0xb98545, grassLight: 0xe9c070, leaf: [0xe0793f, 0xc95a35, 0xf0a94a] }, // autumn
  { grass: 0x9fcf8a, grassDark: 0x7fb06c, grassLight: 0xbfe3a6, leaf: [0xffb3c8, 0xf28fb0, 0xffd1df] }, // blossom
  { grass: 0x79b8a8, grassDark: 0x5c9a8c, grassLight: 0x9ad0c0, leaf: [0x5aa6c9, 0x4b88b8, 0x8cc9e0] }, // aurora
];
