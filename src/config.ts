// All gameplay tuning lives here. Tweak numbers, refresh browser, feel the difference.

export const WORLD = {
  width: 6000,
  height: 6000,
};

export const PLAYER = {
  accel: 105, // sail thrust — ships gather way slowly
  drag: 22, // water resistance — low, so you coast like a real hull
  maxSpeed: 165,
  turnRate: 1.7, // radians per second — a rudder, not a joystick
  maxHp: 100,
  cannonRange: 430,
  cannonCooldown: 1.6, // seconds per broadside
  cannonDamage: 12,
  cannonballSpeed: 470,
  magnetRadius: 130,
};

export const ENEMY = {
  gunboat: { hp: 42, speed: 115, range: 380, cooldown: 2.6, damage: 8, ramDamage: 0, coins: [5, 9] },
  sloop: { hp: 24, speed: 160, range: 0, cooldown: 0, damage: 0, ramDamage: 12, coins: [3, 6] },
  merchant: { hp: 30, speed: 130, range: 0, cooldown: 0, damage: 0, ramDamage: 0, coins: [10, 18] },
  manowar: { hp: 600, speed: 95, range: 430, cooldown: 5, damage: 10, ramDamage: 20, coins: [60, 90] },
  fireship: { hp: 18, speed: 178, range: 0, cooldown: 0, damage: 0, ramDamage: 0, coins: [4, 8] },
  brig: { hp: 95, speed: 85, range: 340, cooldown: 3.4, damage: 9, ramDamage: 14, coins: [10, 16] },
  frigate: { hp: 150, speed: 128, range: 460, cooldown: 4.2, damage: 9, ramDamage: 10, coins: [22, 34] },
};

// Fire ship: a burning hulk that charges and detonates — the blast plays no favorites
export const FIRESHIP = {
  blastRadius: 115,
  playerDamage: 25,
  enemyDamage: 40, // bait them into packs; chains into other fire ships
};

// Armored brig: iron prow — head-on shot is nearly wasted, flank her or burn her
export const BRIG = {
  frontalArc: 2.1, // radians — impact heading within this wedge of the bow is armored
  frontalDmgMul: 0.3,
};

// Elite frigate: gold flash telegraphs a broadside fan with a gap — thread it
export const FRIGATE = {
  telegraphMs: 700,
  volley: 6,
  ballSpeed: 290,
  maxAlive: 1,
};

export const BOSS = {
  notorietyRequired: 5, // spawns when your infamy hits 5 stars
  volleyInterval: 5, // seconds between broadside fans
  volleyIntervalEnraged: 3.2,
  escortIntervalMs: 12000,
  name: 'HMS INEXORABLE',
};

// Ports of call. Each has its own stock, prices, and standards — the navy
// won't dock a known pirate, and pirates don't ask questions.
export type ShopItem = 'repair' | 'damage' | 'rate' | 'hull' | 'speed' | 'accuracy' | 'winch' | 'rumor-glint' | 'rumor-prize';

export interface PortDef {
  id: string;
  name: string;
  x: number;
  y: number;
  faction: 'navy' | 'merchant' | 'pirate' | 'smuggler';
  tint: number;
  priceMul: number;
  stock: ShopItem[];
  refusesAt: number; // notoriety at which the harbormaster bars you (99 = never)
}

export const PORTS: PortDef[] = [
  {
    id: 'royal', name: 'PORT ROYAL', x: 3000, y: 1400,
    faction: 'navy', tint: 0xffffff, priceMul: 1,
    stock: ['repair', 'damage', 'rate', 'hull', 'speed', 'accuracy', 'winch', 'rumor-glint', 'rumor-prize'],
    refusesAt: 8, // at ★8 the navy knows your face
  },
  {
    id: 'charles', name: 'CHARLES TOWNE', x: 1350, y: 3150,
    faction: 'merchant', tint: 0xbfd9ea, priceMul: 1.15, // posh docks, posh prices
    stock: ['repair', 'hull', 'speed', 'rumor-glint'],
    refusesAt: 99,
  },
  {
    id: 'tortuga', name: 'TORTUGA', x: 5200, y: 5200, // deep water — the pirate haven is earned
    faction: 'pirate', tint: 0xd98a8a, priceMul: 0.85,
    stock: ['repair', 'damage', 'rate', 'accuracy', 'rumor-prize'],
    refusesAt: 99,
  },
  {
    id: 'cove', name: "SMUGGLER'S COVE", x: 850, y: 4250, // storm-lashed and cheap
    faction: 'smuggler', tint: 0x9ad9a0, priceMul: 0.8,
    stock: ['repair', 'damage', 'speed', 'rumor-glint', 'rumor-prize'],
    refusesAt: 99,
  },
];

// Port Royal anchors the biome rings (shallows/storm/deep are measured from it)
export const PORT = {
  x: PORTS[0].x,
  y: PORTS[0].y,
  dockRadius: 220,
};

export const RUMOR = {
  glintCost: 25, // tavern talk of sunken treasure: glints charted for a while
  glintRevealMs: 90000,
  prizeCost: 40, // word of a fat prize galleon — marked on your chart
  prizeLootMul: 3,
};

// Trading: buy low here, sell high there. Prices are [buy, sell] per port —
// profit lives in the sailing between them. A fat hold slows you, and word
// of your cargo puts hunters on the wind.
export const TRADE = {
  capacity: 12, // crates in the hold
  slowPerCrate: 0.015, // each crate trims ~1.5% off your top speed
  huntedAt: 6, // this many crates and the sea knows you're worth robbing
  goods: {
    rum: {
      name: 'Rum',
      prices: { royal: [14, 9], charles: [16, 11], tortuga: [8, 5], cove: [12, 8] },
    },
    silk: {
      name: 'Silk',
      prices: { royal: [22, 15], charles: [12, 8], tortuga: [20, 13], cove: [18, 12] },
    },
    spice: {
      name: 'Spice',
      prices: { royal: [26, 18], charles: [24, 16], tortuga: [22, 15], cove: [14, 9] },
    },
  } as Record<string, { name: string; prices: Record<string, [number, number]> }>,
};

export const ENCOUNTER = {
  aggroRange: 700, // enemies notice you inside this
  deaggroRange: 1050, // and give up outside this
  spawnIntervalMs: 4000,
  spawnMinDist: 1100,
  spawnMaxDist: 1600,
  baseCap: 7,
  maxCap: 16,
  // new hulls join the hunt as your infamy grows
  fireship: { notoriety: 1, base: 0.14, perStar: 0.02, max: 0.3 },
  brig: { notoriety: 2, base: 0.1, perStar: 0.02, max: 0.26 },
  frigate: { notoriety: 3, chance: 0.07 },
};

export const ISLANDS = {
  count: 14,
  treasureCount: 4,
  minSpacing: 650,
  digRadius: 220, // how close you must sail to dig
  loot: [30, 45], // total coins from a dig
  relicChance: 0.25, // chance a dig also grants a card draft
};

export const WINCH = {
  costs: [80, 140, 220], // port shop, levels 1-3
  range: [280, 380, 480], // harpoon reach per level
  cooldown: [3.2, 2.4, 1.6], // seconds between harpoons
  dredgeTime: 2.5, // seconds hovering to raise treasure by hand
  loot: [14, 22], // coins in a sunken treasure
  glintCount: 5, // sunken treasure spots in the world
};

export const FLOTSAM = {
  intervalMs: 14000, // drifting debris spawns at sea
};

// Sea events: moments of choice drifting on the tide. Each spawns near the
// player, announces itself, and drifts away if ignored.
export const EVENTS = {
  firstDelayMs: 40000,
  intervalMs: [40000, 70000], // min/max between rolls
  despawnMs: 90000, // ignored events are lost to the sea
  maxActive: 2,
  weights: { distress: 0.3, coffin: 0.25, cache: 0.25, whale: 0.2 },
  distress: {
    approach: 140, // sail this close to answer the call
    trapChance: 0.45, // it's a navy decoy
    trapPerStar: 0.05, // the navy learns your tricks
    trapMax: 0.75,
    loot: [14, 22], // grateful sailors share cargo
  },
  coffin: {
    approach: 55,
    coinChance: 0.5, // burial coins
    rumChance: 0.2, // rum for the road
    curseChance: 0.15, // THE DEAD RESENT YOU (remainder = only bones)
    curseDamage: 8,
    loot: [10, 20],
  },
  whale: {
    followMs: 70000, // how long she shadows your wake
    distance: 260, // cruising distance off your beam
    speed: 120,
    spoutMs: 3500,
    glintChance: 0.4, // she may flush a sunken treasure up for you
  },
  cache: {
    approach: 80,
    guardedChance: 0.5, // hidden guards spring when you close in
    guardRange: 260,
    loot: [18, 30],
  },
};

// Weapon evolutions: max a weapon (Lv5) + hold its matching crew card,
// and the draft offers the evolved form. Numbers are multipliers on the
// Lv5 base values unless noted.
export const EVOLUTION = {
  broadsides: { volleys: 3, volleyGapMs: 140, dmgMul: 0.85, cooldownMul: 1.3 }, // Devastator Barrage
  barrels: { dmgMul: 1.5, radiusMul: 1.4, wakeRadius: 36, wakeDmgMul: 0.45, wakeLifeMs: 3200, wakeEveryMs: 450, wakeMinSpeed: 0.55 }, // Inferno Wake
  mortar: { dmgMul: 1.4, aoeMul: 1.5, burnDmgMul: 0.15, burnLifeMs: 4000 }, // Doombringer
  harpoon: { dmgMul: 1.5, speed: 900, pierce: 99, slowMs: 3000, yank: 230 }, // Kraken's Spear
  swivel: { dmgMul: 1.3, balls: 4, range: 460, fan: 0.12, speed: 460 }, // Wasp Nest
  ramprow: { dmgMul: 2.2, knockback: 430, stunMs: 1200 }, // Leviathan Prow
};

export const DAYNIGHT = {
  cycleSeconds: 240, // one full day across the sea
};

// Biomes: concentric rings of risk around Port Royal, plus scattered fog banks.
// The further out you sail, the uglier the company — and the fatter the prize.
export const BIOMES = {
  shallowsR: 1400, // golden shallows: merchants & sloops only — safe waters
  stormInnerR: 2800, // storm belt: lightning, swells shove your hull
  stormOuterR: 4200, // beyond this: the deep
  deepLootMul: 1.5, // coins collected in the deep pay half again
  storm: {
    swellEveryMs: 3600, // a swell shoves every ship in the belt
    swellForce: 55,
    lightningMinMs: 6000,
    lightningMaxMs: 14000,
  },
  fog: {
    count: 3,
    radius: [320, 520], // per-bank radius range
    aggroMul: 0.45, // predators in the mist see you late — and strike close
    lurkers: 2, // hulls lurking in each bank, waiting
  },
};

export function killsToNextLevel(level: number): number {
  return 3 + (level - 1) * 2;
}
