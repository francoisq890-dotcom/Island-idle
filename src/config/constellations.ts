/**
 * Long-term goal after the first prestige: Constellations.
 * Lifetime star seeds light up constellations around the Lighthouse; each one
 * is a permanent perk that makes every new island start stronger.
 */
export type PerkId = 'drills5' | 'bridgeForge' | 'altarLuck' | 'prod2' | 'goldenRush' | 'picks' | 'prod3';

export interface ConstellationDef {
  id: PerkId;
  name: string;
  seeds: number;
  desc: string;
}

export const CONSTELLATIONS: ConstellationDef[] = [
  { id: 'drills5', name: 'La Foreuse', seeds: 5, desc: 'Chaque nouvelle île démarre avec 5 foreuses.' },
  { id: 'bridgeForge', name: 'Le Pont', seeds: 15, desc: 'Le Pont des Forges est déjà construit sur chaque nouvelle île.' },
  { id: 'altarLuck', name: 'Le Trèfle', seeds: 40, desc: 'L’amélioration Chance des autels démarre au niveau 5.' },
  { id: 'prod2', name: 'La Couronne', seeds: 100, desc: 'Toute la production ×2, pour toujours.' },
  { id: 'goldenRush', name: 'Le Soleil d’or', seeds: 200, desc: 'Les cristaux dorés apparaissent deux fois plus souvent.' },
  { id: 'picks', name: 'La Pioche', seeds: 350, desc: 'Les deux premières pioches sont offertes sur chaque nouvelle île.' },
  { id: 'prod3', name: 'Le Grand Phare', seeds: 600, desc: 'Toute la production ×3, pour toujours.' },
];

export function hasPerk(lifetimeSeeds: number, id: PerkId): boolean {
  const c = CONSTELLATIONS.find((x) => x.id === id)!;
  return lifetimeSeeds >= c.seeds;
}

export function nextConstellation(lifetimeSeeds: number): ConstellationDef | null {
  return CONSTELLATIONS.find((c) => lifetimeSeeds < c.seeds) ?? null;
}
