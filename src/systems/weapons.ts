// Weapon definitions: 6 distinct weapons, 5 levels each.
// Broadsides are the starting weapon; the rest come from the draft.

export type WeaponId = 'broadsides' | 'barrels' | 'mortar' | 'harpoon' | 'swivel' | 'ramprow';

export interface WeaponDef {
  id: WeaponId;
  name: string;
  short: string; // HUD abbreviation
  maxLevel: number;
  cooldown: number[]; // seconds per level (index 0 = Lv1)
  damage: number[];
  radius?: number[]; // barrels: burn radius
  aoe?: number[]; // mortar: blast radius
  pierce?: number[]; // harpoon: ships pierced
  intro: string; // shown on the NEW WEAPON card
  note: (lvl: number) => string; // what the next level adds (lvl = current level)
}

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  broadsides: {
    id: 'broadsides',
    name: 'Broadsides',
    short: 'BS',
    maxLevel: 5,
    cooldown: [1.6, 1.5, 1.4, 1.3, 1.15],
    damage: [12, 14, 16, 18, 22],
    intro: 'Your trusty side guns. Auto-fire at anything in your port/starboard arcs.',
    note: (l) => `Lv ${l + 1}: ${l + 1} balls per side, ${WEAPONS.broadsides.damage[l]} dmg each, faster reload.`,
  },
  barrels: {
    id: 'barrels',
    name: 'Fire Barrels',
    short: 'FIRE',
    maxLevel: 5,
    cooldown: [3.4, 3.0, 2.6, 2.2, 1.8],
    damage: [8, 11, 14, 17, 22],
    radius: [46, 52, 58, 64, 72],
    intro: 'Drop burning barrels astern. Anything that sails through the slick catches fire.',
    note: (l) => `Lv ${l + 1}: ${WEAPONS.barrels.damage[l]} burn dmg, wider slick, faster drops.`,
  },
  mortar: {
    id: 'mortar',
    name: 'Mortar',
    short: 'MOR',
    maxLevel: 5,
    cooldown: [4.2, 3.8, 3.3, 2.9, 2.4],
    damage: [26, 34, 42, 50, 62],
    aoe: [80, 90, 100, 110, 125],
    intro: 'Lob explosive shells at the nearest enemy. Slow, but the blast is enormous.',
    note: (l) => `Lv ${l + 1}: ${WEAPONS.mortar.damage[l]} dmg, bigger blast, faster fuse.`,
  },
  harpoon: {
    id: 'harpoon',
    name: 'Harpoon Ballista',
    short: 'HRP',
    maxLevel: 5,
    cooldown: [2.4, 2.1, 1.9, 1.6, 1.3],
    damage: [20, 26, 32, 38, 48],
    pierce: [2, 2, 3, 3, 4],
    intro: 'Bow-mounted ballista. The harpoon pierces clean through ships and tangles rigging (slows them).',
    note: (l) => `Lv ${l + 1}: ${WEAPONS.harpoon.damage[l]} dmg, pierces more hulls.`,
  },
  swivel: {
    id: 'swivel',
    name: 'Swivel Guns',
    short: 'SWV',
    maxLevel: 5,
    cooldown: [1.9, 1.7, 1.5, 1.3, 1.1],
    damage: [8, 10, 13, 16, 20],
    intro: 'Stern chasers that rake any ship foolish enough to chase you.',
    note: (l) => `Lv ${l + 1}: ${WEAPONS.swivel.damage[l]} dmg, faster swivel.`,
  },
  ramprow: {
    id: 'ramprow',
    name: 'Iron Ram Prow',
    short: 'RAM',
    maxLevel: 5,
    cooldown: [0, 0, 0, 0, 0], // passive — always on
    damage: [15, 22, 30, 38, 50],
    intro: 'An iron-clad bow. Collision becomes a weapon — and you take half ram damage.',
    note: (l) => `Lv ${l + 1}: ${WEAPONS.ramprow.damage[l]} contact damage.`,
  },
};

export const WEAPON_LIST: WeaponDef[] = Object.values(WEAPONS);
