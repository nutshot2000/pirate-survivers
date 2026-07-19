// Biomes: rings of risk around Port Royal + fog banks that hide ambushes.
// Pure position math — the scenes read this every frame.

import { PORT, ENCOUNTER, BIOMES } from '../config';

export type BiomeId = 'shallows' | 'open' | 'storm' | 'deep';

export interface FogBank {
  x: number;
  y: number;
  r: number;
}

// fog banks live here so EnemyShip (which has no scene handle) can feel the mist
let fogBanks: FogBank[] = [];

export function setFogBanks(banks: FogBank[]): void {
  fogBanks = banks;
}

export function getFogBanks(): FogBank[] {
  return fogBanks;
}

export function biomeAt(x: number, y: number): BiomeId {
  const d = Math.hypot(x - PORT.x, y - PORT.y);
  if (d < BIOMES.shallowsR) return 'shallows';
  if (d < BIOMES.stormInnerR) return 'open';
  if (d < BIOMES.stormOuterR) return 'storm';
  return 'deep';
}

export function inFog(x: number, y: number): boolean {
  for (const b of fogBanks) {
    if (Math.hypot(x - b.x, y - b.y) < b.r) return true;
  }
  return false;
}

// predators in the mist strike late and close
export function aggroRangeAt(x: number, y: number): number {
  return inFog(x, y) ? ENCOUNTER.aggroRange * BIOMES.fog.aggroMul : ENCOUNTER.aggroRange;
}
