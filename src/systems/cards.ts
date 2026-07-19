// Ship modifiers + the level-up card draft.
// Cards come in three flavors: NEW WEAPON (add a weapon system),
// UPGRADE (level an owned weapon), and CREW (passive stat boosts).

import { WEAPONS, WEAPON_LIST, WeaponId } from './weapons';

export interface PlayerMods {
  damageMul: number;
  fireRateMul: number;
  speedMul: number;
  maxHpBonus: number;
  magnetMul: number;
  accuracyMul: number;
  rangeMul: number;
  chainShot: boolean;
}

export function baseMods(): PlayerMods {
  return {
    damageMul: 1,
    fireRateMul: 1,
    speedMul: 1,
    maxHpBonus: 0,
    magnetMul: 1,
    accuracyMul: 1,
    rangeMul: 1,
    chainShot: false,
  };
}

// What a card needs to touch when applied
export interface CardPlayerState {
  mods: PlayerMods;
  weapons: Map<WeaponId, number>;
  passives: Set<string>; // crew cards taken (they stack, but once is enough to evolve)
  evolved: Set<WeaponId>;
}

export interface CardDef {
  id: string;
  name: string;
  desc: string;
  tag: string;
  tagClass: 'new' | 'up' | 'crew' | 'evo';
  evoWeapon?: WeaponId; // set on EVOLUTION cards, for the fanfare
  apply: (state: CardPlayerState) => void;
}

// Evolutions: weapon at max level + matching crew card held → the draft
// offers the evolved form (guaranteed slot — the payoff for building into it).
export interface EvolutionDef {
  weapon: WeaponId;
  requires: string; // passive card id
  reqName: string; // crew card display name
  name: string; // evolved weapon name
  short: string; // HUD abbreviation
  desc: string;
}

export const EVOLUTIONS: EvolutionDef[] = [
  {
    weapon: 'broadsides', requires: 'deadeye', reqName: 'Deadeye Gunners',
    name: 'Devastator Barrage', short: 'DEV',
    desc: 'Broadsides + Deadeye Gunners. Every broadside erupts in a TRIPLE volley — slower reload, apocalyptic splinters.',
  },
  {
    weapon: 'barrels', requires: 'sails', reqName: 'Silk Sails',
    name: 'Inferno Wake', short: 'WAKE',
    desc: 'Fire Barrels + Silk Sails. Bigger, hotter barrels — and your wake itself burns while you run full sail.',
  },
  {
    weapon: 'mortar', requires: 'heavy-shot', reqName: 'Heavier Shot',
    name: 'Doombringer', short: 'DOOM',
    desc: 'Mortar + Heavier Shot. +40% shell damage, +50% blast, and the crater keeps burning for 4 seconds.',
  },
  {
    weapon: 'harpoon', requires: 'long-nines', reqName: 'Long Nines',
    name: "Kraken's Spear", short: 'KRKN',
    desc: 'Harpoon Ballista + Long Nines. A screaming spear that pierces whole formations and drags victims to your guns.',
  },
  {
    weapon: 'swivel', requires: 'chain', reqName: 'Chain Shot',
    name: 'Wasp Nest', short: 'WASP',
    desc: 'Swivel Guns + Chain Shot. Guns sweep ALL directions — a 4-shot fan at the nearest threat, shackling anything it hits.',
  },
  {
    weapon: 'ramprow', requires: 'hull', reqName: 'Reinforced Hull',
    name: 'Leviathan Prow', short: 'LEVI',
    desc: 'Iron Ram Prow + Reinforced Hull. Ramming deals ×2.2 damage, knocks ships reeling — and their rams break against YOU.',
  },
];

export function getEvolution(weapon: WeaponId): EvolutionDef | undefined {
  return EVOLUTIONS.find((e) => e.weapon === weapon);
}

const PASSIVES: CardDef[] = [
  {
    id: 'heavy-shot', name: 'Heavier Shot', tag: 'CREW', tagClass: 'crew',
    desc: '+30% damage on ALL weapons. Send them to the deep faster.',
    apply: (s) => { s.mods.damageMul *= 1.3; s.passives.add('heavy-shot'); },
  },
  {
    id: 'powder', name: 'Powder Monkeys', tag: 'CREW', tagClass: 'crew',
    desc: '+25% fire rate on ALL weapons. More smoke, more splinters.',
    apply: (s) => { s.mods.fireRateMul *= 1.25; s.passives.add('powder'); },
  },
  {
    id: 'hull', name: 'Reinforced Hull', tag: 'CREW', tagClass: 'crew',
    desc: '+30 max hull, and patch 30 HP right now.',
    apply: (s) => { s.mods.maxHpBonus += 30; s.passives.add('hull'); },
  },
  {
    id: 'sails', name: 'Silk Sails', tag: 'CREW', tagClass: 'crew',
    desc: '+15% sailing speed. Catch the wind.',
    apply: (s) => { s.mods.speedMul *= 1.15; s.passives.add('sails'); },
  },
  {
    id: 'navigator', name: "Navigator's Eye", tag: 'CREW', tagClass: 'crew',
    desc: '+60% salvage magnet radius. No crate escapes.',
    apply: (s) => { s.mods.magnetMul *= 1.6; s.passives.add('navigator'); },
  },
  {
    id: 'deadeye', name: 'Deadeye Gunners', tag: 'CREW', tagClass: 'crew',
    desc: '+30% accuracy: tighter broadside spread, faster shot.',
    apply: (s) => { s.mods.accuracyMul *= 1.3; s.passives.add('deadeye'); },
  },
  {
    id: 'long-nines', name: 'Long Nines', tag: 'CREW', tagClass: 'crew',
    desc: '+18% cannon range. Reach out and touch someone.',
    apply: (s) => { s.mods.rangeMul *= 1.18; s.passives.add('long-nines'); },
  },
  {
    id: 'chain', name: 'Chain Shot', tag: 'CREW', tagClass: 'crew',
    desc: 'Your hits shred sails: enemies are slowed for 3 seconds.',
    apply: (s) => { s.mods.chainShot = true; s.passives.add('chain'); },
  },
];

export function buildDraftPool(state: CardPlayerState): CardDef[] {
  const pool: CardDef[] = [...PASSIVES];

  for (const def of WEAPON_LIST) {
    const lvl = state.weapons.get(def.id) ?? 0;
    if (lvl === 0) {
      pool.push({
        id: `w-${def.id}`,
        name: def.name,
        tag: 'NEW WEAPON',
        tagClass: 'new',
        desc: def.intro,
        apply: (s) => { s.weapons.set(def.id, 1); },
      });
    } else if (lvl < def.maxLevel) {
      pool.push({
        id: `w-${def.id}-${lvl + 1}`,
        name: def.name,
        tag: `UPGRADE → Lv ${lvl + 1}`,
        tagClass: 'up',
        desc: def.note(lvl),
        apply: (s) => { s.weapons.set(def.id, lvl + 1); },
      });
    }
  }

  // evolution offers: maxed weapon + matching crew card held, not yet evolved
  for (const evo of EVOLUTIONS) {
    const lvl = state.weapons.get(evo.weapon) ?? 0;
    if (lvl >= WEAPONS[evo.weapon].maxLevel && !state.evolved.has(evo.weapon) && state.passives.has(evo.requires)) {
      pool.push({
        id: `evo-${evo.weapon}`,
        name: evo.name,
        tag: 'EVOLUTION',
        tagClass: 'evo',
        desc: evo.desc,
        evoWeapon: evo.weapon,
        apply: (s) => { s.evolved.add(evo.weapon); },
      });
    }
  }

  return pool;
}

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function drawCards(state: CardPlayerState, n: number): CardDef[] {
  const pool = buildDraftPool(state);
  const evos = shuffle(pool.filter((c) => c.tagClass === 'evo'));
  const rest = shuffle(pool.filter((c) => c.tagClass !== 'evo'));
  // an available evolution always makes the draft — that's the payoff
  if (evos.length === 0) return rest.slice(0, n);
  return [evos[0], ...rest.slice(0, n - 1)];
}
